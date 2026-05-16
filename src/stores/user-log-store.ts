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

// Best-effort server-side mirror for auth-related activity. The local log
// stays as instant UI feedback; this just writes a row to the
// `user_activity_logs` table so server-side analytics see the event too.
async function mirrorAuthEventToSupabase(entry: {
  userId: string
  action: string
  target?: string
  metadata?: unknown
}): Promise<void> {
  if (typeof window === 'undefined') return
  if (!entry.action.startsWith('auth.')) return
  try {
    const supabase = createClient()
    await supabase.from('user_activity_logs').insert({
      user_id: entry.userId === 'anonymous' ? null : entry.userId,
      user_name: entry.userId,
      action: entry.action,
      module: 'auth',
      details: entry.target ?? null,
      ip_address: null,
      // metadata column is NOT NULL DEFAULT '{}'::jsonb — never send null.
      metadata: entry.metadata ?? {},
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
    device: '',
    location: '',
    status,
    userId: row.user_id ?? undefined,
    metadata: row.metadata ?? undefined,
  }
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
      set({ logs: result.items.map(mapRow), isLoading: false, lastFetched: Date.now() })
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
