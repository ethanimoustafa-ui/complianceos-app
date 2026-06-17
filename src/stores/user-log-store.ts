// User log store — Phase 5 server-state migration.
//
// Two complementary write paths exist here, both intentional:
//
//   1. `log()` is called inline by RBAC gates, auth-store, team-store, etc.
//      It appends a UI-visible row to `state.logs` for instant feedback AND
//      fires `mirrorAuthEventToSupabase` so auth-related events also land in
//      the server-side `user_activity_logs` table. This path is unchanged
//      from Phase 3.
//
//   2. `fetchLogs()` (new in Phase 5) loads the canonical, paginated log
//      list from `GET /api/team/logs` and replaces `state.logs` with the
//      server view. The admin "User Logs" page calls this on mount.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && logs.length === 0` (first-fetch).

import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { api, ApiClientError } from '@/lib/api-client'
import {
  collectClientActivityContext,
  deviceFromMetadata,
  locationFromMetadata,
  isUuid,
} from '@/lib/user-activity-meta'

// Best-effort resolution of a userId → display name without a static import of
// the auth/team stores (that would create a require cycle — auth-store already
// imports this module). Done lazily at call time.
async function resolveUserName(userId: string): Promise<string | null> {
  try {
    const [{ useAuthStore }, { useTeamStore }] = await Promise.all([
      import('@/stores/auth-store'),
      import('@/stores/team-store'),
    ])
    const current = useAuthStore.getState().user
    if (current && current.id === userId) return current.name
    const member = useTeamStore.getState().members.find((m) => m.id === userId)
    return member?.name ?? null
  } catch {
    return null
  }
}

// Best-effort server-side mirror for auth-related activity. The local log
// stays as instant UI feedback; this just writes a row to the
// `user_activity_logs` table so server-side analytics see the event too.
//
// IMPORTANT: `auth.login` / `auth.logout` are written authoritatively (with the
// real profile name + device metadata) by auth-store's `recordActivity`. If we
// ALSO mirrored them here we'd get a duplicate row per sign-in whose user_name
// is the raw uuid (this hook only has the id). So we skip those two and only
// mirror the events recordActivity doesn't cover (permission_denied, etc.).
async function mirrorAuthEventToSupabase(entry: {
  userId: string
  action: string
  target?: string
  metadata?: unknown
}): Promise<void> {
  if (typeof window === 'undefined') return
  if (!entry.action.startsWith('auth.')) return
  if (entry.action === 'auth.login' || entry.action === 'auth.logout') return
  try {
    const resolvedName =
      entry.userId === 'anonymous' ? 'anonymous' : await resolveUserName(entry.userId)
    const supabase = createClient()
    await supabase.from('user_activity_logs').insert({
      user_id: entry.userId === 'anonymous' ? null : entry.userId,
      // Prefer a real name; fall back to the id only when we truly can't resolve
      // it (the read side resolves ids → names again as a safety net).
      user_name: resolvedName ?? entry.userId,
      action: entry.action,
      module: 'auth',
      details: entry.target ?? null,
      ip_address: null,
      // metadata column is NOT NULL DEFAULT '{}'::jsonb — never send null.
      metadata:
        entry.metadata != null
          ? entry.metadata
          : collectClientActivityContext(),
    })
  } catch (err) {
    console.warn('[user-log-store] mirror to supabase failed', err)
  }
}

export type UserLogAction =
  | 'sign_in'
  | 'sign_out'
  | 'session_timeout'
  | 'password_change'
  | 'profile_update'
  | 'permission_change'
  | 'mfa_enabled'
  | 'failed_login'
  | 'auth.permission_denied'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.switch_user'
  | 'team.permissions_changed'
  | 'team.member_invited'
  | 'team.member_removed'
  | 'team.member_role_changed'
  | 'policy.approval_step_committed'
  | 'policy.rejection'
  | 'samaLetter.approval_step_committed'
  | 'samaLetter.sent'

export interface UserLog {
  id: number
  timestamp: string
  user: string
  action: UserLogAction
  detailsKey: string
  ipAddress: string
  device: string
  location: string
  status: 'success' | 'warning' | 'failed' | 'info'
  userId?: string
  target?: string
  metadata?: unknown
}

export interface RBACDeniedLogEntry {
  userId: string
  action: UserLogAction
  target?: string
  metadata?: unknown
}

// ---------- API row shape (from /api/team/logs) ------------------------------

interface UserLogApiRow {
  id: string
  user_id: string | null
  user_name: string | null
  action: string
  module: string | null
  details: string | null
  ip_address: string | null
  metadata: unknown
  created_at: string
}

// Deterministic 32-bit numeric hash of the server uuid so the legacy
// `UserLog.id: number` contract is preserved. Collisions are theoretical
// but inconsequential — the table doesn't rely on `id` for uniqueness, only
// for React keys and expand-toggle bookkeeping.
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) || 1
}

function mapRow(row: UserLogApiRow): UserLog {
  // Map the server action onto the legacy action union when possible. Unknown
  // actions fall through as-is — the log table renders them verbatim.
  const status: UserLog['status'] =
    row.action === 'auth.permission_denied' || row.action === 'policy.rejection'
      ? 'warning'
      : row.action === 'auth.login' || row.action === 'auth.logout' || row.action === 'sign_in'
        ? 'success'
        : row.action === 'failed_login'
          ? 'failed'
          : 'info'
  return {
    id: hashId(row.id),
    timestamp: row.created_at,
    user: row.user_name ?? row.user_id ?? 'system',
    action: row.action as UserLogAction,
    detailsKey: row.details ?? '',
    ipAddress: row.ip_address ?? '',
    device: deviceFromMetadata(row.metadata),
    location: locationFromMetadata(row.metadata),
    status,
    userId: row.user_id ?? undefined,
    metadata: row.metadata ?? undefined,
  }
}

// Historical artifact cleanup: before the double-write bug was fixed, every
// sign-in wrote TWO rows a few ms apart (one with the real name, one with the
// raw uuid). Collapse those legacy pairs so the table doesn't show each login
// twice. Scoped to `auth.*` events for the same user within a 1s window — the
// artifact rows are <10ms apart, while a genuine re-login takes a full
// page/session flow (seconds), so this can't eat a real distinct event. Keeps
// the row whose user_name is NOT a raw uuid.
const AUTH_DUPLICATE_WINDOW_MS = 1000
function dedupeAuthDoubleWrites(rows: UserLogApiRow[], mapped: UserLog[]): UserLog[] {
  const kept: UserLog[] = []
  const seen: { userId: string; action: string; t: number; keptIdx: number; isUuid: boolean }[] = []
  for (let i = 0; i < mapped.length; i++) {
    const log = mapped[i]
    const raw = rows[i]
    if (!log.action.startsWith('auth.') || !log.userId) {
      kept.push(log)
      continue
    }
    const t = new Date(log.timestamp).getTime()
    const currentIsUuid = isUuid(raw.user_name)
    // A genuine double-write is the SAME user+action inside the window where
    // exactly ONE row carries a raw-uuid user_name and the other a real name.
    // Requiring that uuid/real-name mismatch means two same-shape distinct
    // events (e.g. several `auth.permission_denied` with different targets fired
    // in a burst) are never collapsed — only the legacy login pair is.
    const dupe = seen.find(
      (s) =>
        s.userId === log.userId &&
        s.action === log.action &&
        Math.abs(s.t - t) <= AUTH_DUPLICATE_WINDOW_MS &&
        s.isUuid !== currentIsUuid,
    )
    if (dupe) {
      // Keep the real-name row in the slot.
      if (isUuid(kept[dupe.keptIdx].user) && !currentIsUuid) kept[dupe.keptIdx] = log
      continue
    }
    seen.push({ userId: log.userId, action: log.action, t, keptIdx: kept.length, isUuid: currentIsUuid })
    kept.push(log)
  }
  return kept
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface UserLogState {
  logs: UserLog[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  /** Load the canonical paginated log list from `GET /api/team/logs`. */
  fetchLogs: (opts?: {
    page?: number
    pageSize?: number
    userId?: string
    action?: string
    module?: string
  }) => Promise<void>
  addLog: (log: Omit<UserLog, 'id'>) => void
  /**
   * Compact logger used by RBAC store-action gates and the Phase 7
   * audit-log emitters. Fills in `timestamp`, status, and a generic
   * `detailsKey` so call sites can stay one-liners. Auth events are mirrored
   * to the `user_activity_logs` table.
   */
  log: (entry: RBACDeniedLogEntry) => void
  getLogsByUserId: (userId: string) => UserLog[]
  clearLogs: () => void
  clearError: () => void
}

const nextLocalId = (logs: UserLog[]): number => {
  let max = 0
  for (const l of logs) {
    if (l.id > max) max = l.id
  }
  return max + 1
}

export const useUserLogStore = create<UserLogState>()((set, get) => ({
  logs: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchLogs: async (opts) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: UserLogApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/team/logs', {
        page: opts?.page,
        pageSize: opts?.pageSize ?? 50,
        user_id: opts?.userId,
        action: opts?.action,
        module: opts?.module,
      })
      const rows = result.items ?? []
      const mapped = rows.map(mapRow)
      set({
        logs: dedupeAuthDoubleWrites(rows, mapped),
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch user logs'), isLoading: false })
    }
  },

  addLog: (log) =>
    set((state) => ({
      logs: [{ ...log, id: nextLocalId(state.logs) }, ...state.logs],
    })),

  log: (entry) => {
    // Fire-and-forget mirror to user_activity_logs for auth.* events.
    void mirrorAuthEventToSupabase(entry)
    return set((state) => {
      const detailsKey =
        entry.action === 'auth.permission_denied'
          ? 'team.permissionDenied'
          : `team.${entry.action.replace(/\./g, '_')}`
      const status: UserLog['status'] =
        entry.action === 'auth.permission_denied' || entry.action === 'policy.rejection'
          ? 'warning'
          : entry.action === 'auth.login' || entry.action === 'auth.logout'
            ? 'success'
            : 'info'
      const next: UserLog = {
        id: nextLocalId(state.logs),
        timestamp: new Date().toISOString(),
        user: entry.userId,
        action: entry.action,
        detailsKey,
        ipAddress: 'demo',
        device: 'demo',
        location: 'demo',
        status,
        userId: entry.userId,
        target: entry.target,
        metadata: entry.metadata,
      }
      return { logs: [next, ...state.logs] }
    })
  },

  getLogsByUserId: (userId) => get().logs.filter((l) => l.userId === userId),

  clearLogs: () => set({ logs: [] }),
  clearError: () => set({ error: null }),
}))
