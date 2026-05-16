// Audit log store — Phase 5 server-state migration.
//
// Backed by `/api/audit-logs` (paginated read) + `/api/audit-logs/[id]`
// (single-row detail). The endpoint is **read-only** — every mutation across
// the app writes its audit row server-side through `writeAudit()` in
// `lib/api/audit.ts` (not via this store).
//
// `addLog` is preserved as a client-only no-server-call shim so the other
// stores (`audit-store`, `audit-task-store`, etc.) keep compiling and can
// still surface optimistic activity entries to the audit-detail page without
// waiting for the next `fetchAll`. The server-side row already exists; this
// local copy is just there to bridge the round-trip.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

type ActionType = 'opened' | 'closed' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated' | 'reviewed'
type LogStatus = 'completed' | 'pending' | 'info' | 'failed'

export interface AuditLog {
  id: string
  timestamp: string
  user: { name: string; avatar: string }
  action: ActionType
  /**
   * Raw canonical action key from the server (`observation.checklist.create`,
   * `letter.attachment.upload`, …). Use this with `formatAuditAction()` to
   * render a localized human phrase. The legacy `action` field above is the
   * coerced UI bucket (`'created' | 'updated' | …`). Optional because legacy
   * client-side `addLog()` callers (audit-store, audit-task-store) don't set
   * it — they already supply a fully-formed `description`.
   */
  rawAction?: string
  audit: string
  auditId: string
  description: string
  descriptionKey?: string
  descriptionParams?: Record<string, string>
  metadata?: Record<string, unknown>
  status: LogStatus
  duration?: string
  context?: string
}

interface AuditLogApiRow {
  id: number
  timestamp: string
  user_id: string | null
  user_name: string | null
  action: string
  details_key: string | null
  details_params: Record<string, string> | null
  ip_address: string | null
  device: string | null
  location: string | null
  status: string | null
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
}

interface AuditLogListResponse {
  items: AuditLogApiRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function mapAction(action: string): ActionType {
  const map: Record<string, ActionType> = {
    'opened': 'opened',
    'closed': 'closed',
    'commented': 'commented',
    'uploaded': 'uploaded',
    'created': 'created',
    'assigned': 'assigned',
    'updated': 'updated',
    'reviewed': 'reviewed',
  }
  // Server actions are usually `<entity>.<verb>` (e.g. `audit.update`); coerce
  // to the closest legacy ActionType.
  if (map[action]) return map[action]
  if (action.endsWith('.create')) return 'created'
  if (action.endsWith('.update')) return 'updated'
  if (action.endsWith('.delete') || action.endsWith('.close')) return 'closed'
  if (action.endsWith('.upload')) return 'uploaded'
  if (action.endsWith('.comment')) return 'commented'
  if (action.endsWith('.assign')) return 'assigned'
  if (action.endsWith('.review')) return 'reviewed'
  return 'updated'
}

function mapStatus(status: string | null): LogStatus {
  if (status === 'completed' || status === 'pending' || status === 'info' || status === 'failed') {
    return status
  }
  return 'completed'
}

function mapRow(row: AuditLogApiRow): AuditLog {
  // `description` is rendered directly in the detailed-reports table. When the
  // route handler attaches a `metadata.description` it wins; otherwise we
  // surface the raw action key so the row's *consumer* can run it through
  // `formatAuditAction()` to get a localized human phrase. Storing the raw
  // key here (rather than humanising in-store) keeps the i18n boundary at the
  // render layer — Arabic users see Arabic, English users see English.
  return {
    id: String(row.id),
    timestamp: row.timestamp,
    user: { name: row.user_name ?? '', avatar: '' },
    action: mapAction(row.action),
    rawAction: row.action,
    audit: typeof row.metadata?.audit_title === 'string' ? (row.metadata.audit_title as string) : '',
    auditId: row.target_type === 'audit' && row.target_id ? row.target_id : (
      typeof row.metadata?.audit_id === 'string' ? (row.metadata.audit_id as string) : ''
    ),
    description: typeof row.metadata?.description === 'string'
      ? (row.metadata.description as string)
      : row.action,
    descriptionKey: row.details_key ?? undefined,
    descriptionParams: row.details_params ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    status: mapStatus(row.status),
    context: typeof row.metadata?.context === 'string' ? (row.metadata.context as string) : undefined,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface AuditLogState {
  logs: AuditLog[]
  byId: Record<string, AuditLog>

  // First-fetch rule: `isLoading && logs.length === 0` → render skeleton.
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(opts?: { page?: number; pageSize?: number; auditId?: string }): Promise<void>
  fetchById(id: string): Promise<AuditLog | null>
  /**
   * Local-only optimistic insert. Mutations across the app already write
   * audit rows server-side via `writeAudit()`; this shim keeps legacy
   * call sites (`useAuditLogStore.getState().addLog({...})`) compiling
   * and refreshes the in-memory list so detail pages see the entry before
   * the next `fetchAll`.
   */
  addLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void
  getLogsByAuditId(auditId: string): AuditLog[]
  clearLogs(): void
  clearError(): void
}

export const useAuditLogStore = create<AuditLogState>()((set, get) => ({
  logs: [],
  byId: {},

  isLoading: false,
  error: null,
  lastFetched: null,

  fetchAll: async (opts) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<AuditLogListResponse>('/audit-logs', {
        page: opts?.page ?? 1,
        pageSize: opts?.pageSize ?? 100,
        entity_id: opts?.auditId,
      })
      const logs = result.items.map(mapRow)
      const byId: Record<string, AuditLog> = {}
      for (const l of logs) byId[l.id] = l
      set({ logs, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audit logs'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<AuditLogApiRow>(`/audit-logs/${id}`)
      const log = mapRow(row)
      set((s) => ({
        byId: { ...s.byId, [log.id]: log },
        logs: s.logs.some((l) => l.id === log.id)
          ? s.logs.map((l) => (l.id === log.id ? log : l))
          : s.logs,
        isLoading: false,
      }))
      return log
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audit log'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  addLog: (logData) => {
    const newLog: AuditLog = {
      ...logData,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    set((s) => ({
      logs: [newLog, ...s.logs],
      byId: { ...s.byId, [newLog.id]: newLog },
    }))
  },

  getLogsByAuditId: (auditId) => get().logs.filter((log) => log.auditId === auditId),

  clearLogs: () => set({ logs: [], byId: {} }),

  clearError: () => set({ error: null }),
}))
