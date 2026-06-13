// Audit store — Phase 5 reference implementation.
//
// Server-state backed: every read/write goes through the Route Handler API at
// `/api/audits/*`. Local state mirrors the server response so the UI stays
// snappy between fetches, but the server is the source of truth.
//
// Read `.planning/09-store-pattern.md` before mirroring this shape onto the
// remaining Phase 5 stores.
//
// SKELETON-LOADING NOTE: consumer pages should render a skeleton when
// `isLoading && audits.length === 0` (first-fetch). After the first fetch a
// refetch shows stale data with a subtle indicator (`isLoading === true` with a
// non-empty `audits` array).

import { create } from 'zustand'
import type {
  Audit,
  AuditAuthority,
  AuditCategory,
  AuditComment,
  AuditDocument,
  AuditFilters,
  AuditFrequency,
  AuditPriority,
  AuditTeamMember,
  PaginationState,
  RegulatoryBodyId,
  ReviewSchedule,
  SortState,
  User,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { useAuditLogStore } from './audit-log-store'
import { useAuthStore } from './auth-store'
import { useTeamStore } from './team-store'
import { requirePermission } from '@/lib/rbac-store-gate'

// ---------- API row shapes (snake_case from Route Handlers) -----------------

interface AuditApiRow {
  id: string
  title: string
  type: string
  status: string
  priority: string | null
  due_date: string
  assignee_id: string | null
  progress: number | null
  category: string | null
  framework_ids: string[] | null
  created_at: string
  updated_at: string
  // Present on detail responses only:
  description?: string | null
  frequency?: string | null
  closed_overdue?: boolean | null
  completed_at?: string | null
  review_schedule?: unknown
  counts?: { observations: number; tasks: number; documents: number; team_members: number }
}

interface AuditDocumentApiRow {
  id: string
  audit_id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
  storage_path: string
  uploaded_at: string
  uploaded_by: string | null
}

// W45: child rows for the detail page (team / comments). These were never
// fetched — the detail sections skeletoned forever because `audit.team`
// stayed undefined.
interface AuditTeamMemberApiRow {
  id: string
  audit_id: string
  user_id: string
  role: string | null
  is_owner: boolean | null
  added_at: string
}

interface AuditCommentApiRow {
  id: string
  audit_id: string
  content: string
  author_id: string | null
  is_edited: boolean | null
  created_at: string
  updated_at: string
}

// W50: archived cycle snapshots ("schedule next" rolls the SAME audit over).
export interface AuditCycleSummary {
  id: string
  cycleNumber: number
  closedAt: string
  dueDate: string | null
  status: string | null
  progress: number
  counts: { tasks: number; documents: number; comments: number }
}

export interface AuditCycleDetail extends AuditCycleSummary {
  snapshot: {
    audit: Record<string, unknown>
    tasks: Array<Record<string, unknown>>
    documents: Array<Record<string, unknown>>
    comments: Array<Record<string, unknown>>
    team: Array<Record<string, unknown>>
    logs: Array<Record<string, unknown>>
  }
}

interface AuditCycleApiRow {
  id: string
  cycle_number: number
  closed_at: string
  due_date: string | null
  status: string | null
  progress: number | null
  counts?: { tasks: number; documents: number; comments: number }
  snapshot?: AuditCycleDetail['snapshot']
}

function mapCycleRow(r: AuditCycleApiRow): AuditCycleSummary {
  return {
    id: r.id,
    cycleNumber: r.cycle_number,
    closedAt: r.closed_at,
    dueDate: r.due_date,
    status: r.status,
    progress: r.progress ?? 0,
    counts: r.counts ?? { tasks: 0, documents: 0, comments: 0 },
  }
}

/** Child GETs return either a bare array or a paginated `{ items }`. */
function unwrapItems<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  const items = (r as { items?: T[] } | null)?.items
  return Array.isArray(items) ? items : []
}

/** Resolve a profile id to display name/avatar via the team store. */
function resolveProfile(userId: string | null): { id: string; name: string; avatar: string } {
  const m = userId ? useTeamStore.getState().members.find((x) => x.id === userId) : undefined
  return { id: userId ?? '', name: m?.name ?? '', avatar: m?.avatar ?? '' }
}

// ---------- mappers ---------------------------------------------------------

/**
 * Build a placeholder User for `audit.assignee` when the API only gives an
 * `assignee_id`. Profile-table lookups happen elsewhere; the placeholder
 * preserves the `Audit` type contract while components opportunistically read
 * `.id` and `.name` with optional chaining.
 */
function stubAssignee(assigneeId: string | null): User {
  return {
    id: assigneeId ?? '',
    name: '',
    email: '',
    role: 'officer',
    department: '',
    avatar: '',
    workload: 0,
  }
}

// Normalize free-form / legacy category strings to the canonical filter
// vocabulary used by /reports/audits (`security_compliance`,
// `regulatory_compliance`, etc.). Without this, rows seeded with display
// strings like `it-security-audit` or `regulatory-audit` are silently dropped
// by the page's default category filter set. Unrecognized values fall back to
// `regulatory_compliance` so they remain visible.
function normalizeAuditCategory(raw: string | null | undefined): AuditCategory | undefined {
  if (!raw) return undefined
  const v = raw.toLowerCase()
  if (
    v === 'security_compliance' ||
    v === 'financial_compliance' ||
    v === 'regulatory_compliance' ||
    v === 'operational_compliance' ||
    v === 'hr_compliance' ||
    v === 'sharia_compliance'
  ) {
    return v as AuditCategory
  }
  if (v.includes('security') || v.includes('cyber') || v.includes('it')) return 'security_compliance' as AuditCategory
  if (v.includes('financial') || v.includes('finance')) return 'financial_compliance' as AuditCategory
  if (v.includes('sharia')) return 'sharia_compliance' as AuditCategory
  if (v.includes('hr') || v.includes('human')) return 'hr_compliance' as AuditCategory
  if (v.includes('operational') || v.includes('operations')) return 'operational_compliance' as AuditCategory
  // W45: categories are user-configurable (useAuditCategoryStore) — keep the
  // raw id instead of force-bucketing into 'regulatory_compliance'. The
  // audits page surfaces custom ids as filter options dynamically.
  return raw as AuditCategory
}

function mapAuditRow(row: AuditApiRow, previous?: Audit): Audit {
  return {
    id: row.id,
    title: row.title,
    type: row.type as AuditAuthority,
    status: row.status as Audit['status'],
    dueDate: row.due_date,
    // W46: resolve the lead author's display name/avatar from the team store
    // — the bare stub left the detail page showing an empty assignee.
    assignee:
      previous?.assignee?.name
        ? previous.assignee
        : { ...stubAssignee(row.assignee_id), ...resolveProfile(row.assignee_id) },
    progress: row.progress ?? 0,
    documents: previous?.documents,
    team: previous?.team,
    comments: previous?.comments,
    description: row.description ?? previous?.description,
    category: normalizeAuditCategory(row.category) ?? previous?.category,
    frequency: (row.frequency ?? previous?.frequency) as AuditFrequency | undefined,
    priority: (row.priority ?? previous?.priority) as AuditPriority | undefined,
    closedOverdue: row.closed_overdue ?? previous?.closedOverdue,
    completedAt: row.completed_at ?? previous?.completedAt,
    reviewSchedule: (row.review_schedule as ReviewSchedule | undefined) ?? previous?.reviewSchedule,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDocumentRow(row: AuditDocumentApiRow): AuditDocument {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by ?? undefined,
    storagePath: row.storage_path ?? undefined,
  }
}

/**
 * Reduce a Partial<Audit> patch (camelCase) to the snake_case shape accepted
 * by `PATCH /api/audits/[id]`. Only fields the API understands are forwarded;
 * unknown extras (e.g. nested `assignee.name`) are stripped.
 */
function toUpdatePayload(patch: Partial<Audit>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.description !== undefined) out.description = patch.description
  if (patch.type !== undefined) out.type = patch.type
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  if (patch.category !== undefined) out.category = patch.category
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate
  if (patch.assignee !== undefined) out.assignee_id = patch.assignee?.id ?? null
  if (patch.frequency !== undefined) out.frequency = patch.frequency
  if (patch.reviewSchedule !== undefined) out.review_schedule = patch.reviewSchedule
  if (patch.status !== undefined) out.status = patch.status
  if (patch.progress !== undefined) out.progress = patch.progress
  return out
}

function toCreatePayload(data: Omit<Audit, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  return {
    title: data.title,
    description: data.description ?? undefined,
    type: data.type,
    framework_ids: data.frameworkIds ?? [],
    category: data.category ?? undefined,
    priority: data.priority ?? 'medium',
    due_date: data.dueDate,
    assignee_id: data.assignee?.id || undefined,
    frequency: data.frequency ?? undefined,
    review_schedule: data.reviewSchedule ?? undefined,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const getCurrentUser = () => {
  const user = useAuthStore.getState().user
  return {
    name: user?.name || 'System',
    avatar: user?.avatar || '',
  }
}

// ---------- store ----------------------------------------------------------

interface AuditState {
  // --- data ---
  audits: Audit[]
  byId: Record<string, Audit>
  selectedAudit: Audit | null
  pagination: PaginationState
  sort: SortState
  filters: AuditFilters

  // --- status ---
  // First-fetch detector: `isLoading && audits.length === 0` → render skeleton.
  // Subsequent refetches set `isLoading = true` while keeping the stale list
  // visible; UI shows a subtle indicator (spinner / progress bar) rather than a
  // full skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // --- async actions ---
  fetchAll: (opts?: {
    page?: number
    pageSize?: number
    filters?: Partial<AuditFilters>
    force?: boolean
  }) => Promise<void>
  fetchById: (id: string) => Promise<Audit | null>
  // W45: hydrate team/comments/documents from their server endpoints and flag
  // the audit's detail children as loaded (drives the detail-page skeletons).
  fetchDetailChildren: (id: string) => Promise<void>
  detailChildrenLoaded: Record<string, boolean>
  isDetailLoaded: (id: string) => boolean
  // W50: archived cycles.
  cyclesByAudit: Record<string, AuditCycleSummary[]>
  fetchCycles: (auditId: string) => Promise<void>
  fetchCycleDetail: (auditId: string, cycleId: string) => Promise<AuditCycleDetail | null>
  rescheduleAudit: (auditId: string, dueDate: string) => Promise<void>
  create: (data: Omit<Audit, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Audit>
  update: (id: string, data: Partial<Audit>) => Promise<Audit>
  delete: (id: string) => Promise<void>
  start: (id: string) => Promise<void>
  complete: (id: string) => Promise<void>

  // --- nested mutations (preserve legacy shape — pages/components call these directly) ---
  addDocument: (
    auditId: string,
    document: Omit<AuditDocument, 'id' | 'uploadedAt'> & { storage_path?: string },
    user?: { name: string },
  ) => Promise<AuditDocument | null>
  removeDocument: (auditId: string, documentId: string) => Promise<void>

  addTeamMember: (
    auditId: string,
    member: Omit<AuditTeamMember, 'addedAt'>,
  ) => AuditTeamMember | null
  removeTeamMember: (auditId: string, memberId: string) => void

  addComment: (
    auditId: string,
    content: string,
    author: { id: string; name: string; avatar: string },
  ) => AuditComment | null
  editComment: (
    auditId: string,
    commentId: string,
    newContent: string,
    editor: { name: string },
  ) => void
  deleteComment: (auditId: string, commentId: string, deleter: { name: string }) => void

  updateStatus: (
    auditId: string,
    newStatus: Audit['status'],
    user: { name: string },
  ) => Promise<void>

  // --- UI helpers (client-only; never persisted) ---
  setFilters: (filters: AuditFilters) => void
  clearFilters: () => void
  setSelected: (audit: Audit | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  clearError: () => void
}

const INITIAL_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
}

const INITIAL_SORT: SortState = {
  field: 'dueDate',
  direction: 'asc',
}

export const useAuditStore = create<AuditState>()((set, get) => ({
  audits: [],
  byId: {},
  selectedAudit: null,
  pagination: INITIAL_PAGINATION,
  sort: INITIAL_SORT,
  filters: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (opts) => {
    const current = get()
    const page = opts?.page ?? current.pagination.page
    const pageSize = opts?.pageSize ?? current.pagination.pageSize
    const filters = opts?.filters
      ? { ...current.filters, ...opts.filters }
      : current.filters

    // Skip if a fresh fetch completed in the last 30s and no opts override
    // page/pageSize/filters (which would change the result set). Callers can
    // pass `force: true` to bypass the TTL.
    const hasOverride =
      opts?.page !== undefined ||
      opts?.pageSize !== undefined ||
      opts?.filters !== undefined
    if (
      !opts?.force &&
      !hasOverride &&
      current.lastFetched &&
      Date.now() - current.lastFetched < 30_000
    ) {
      return
    }

    set({ isLoading: true, error: null })
    try {
      // AuditFilters allows multi-select arrays for status / type; the API
      // accepts a single value per call, so we forward the first entry. Pages
      // doing multi-status filters should call `fetchAll` multiple times and
      // merge, or rely on client-side filtering after a full fetch.
      const result = await api.get<{
        items: AuditApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/audits', {
        page,
        pageSize,
        status: filters.status?.[0],
        type: filters.type?.[0],
        assignee_id: filters.assigneeId,
      })

      const previousById = get().byId
      const audits = result.items.map((row) => mapAuditRow(row, previousById[row.id]))
      const byId: Record<string, Audit> = {}
      for (const a of audits) byId[a.id] = a

      set({
        audits,
        byId,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
        filters,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audits'), isLoading: false })
      // Don't re-throw on list fetches — consumers render the error banner via `error`.
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<AuditApiRow>(`/audits/${id}`)
      const previous = get().byId[id]
      const audit = mapAuditRow(row, previous)
      set((state) => ({
        byId: { ...state.byId, [id]: audit },
        // If the row isn't in `audits[]` yet (deep-link to a freshly-created
        // audit), prepend it so detail-page selectors using
        // `audits.find(a => a.id === auditId)` can resolve it.
        audits: state.audits.some((a) => a.id === id)
          ? state.audits.map((a) => (a.id === id ? audit : a))
          : [audit, ...state.audits],
        selectedAudit: audit,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return audit
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audit'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  detailChildrenLoaded: {},

  isDetailLoaded: (id) => get().detailChildrenLoaded[id] === true,

  cyclesByAudit: {},

  fetchCycles: async (auditId) => {
    try {
      const rows = await api.get<AuditCycleApiRow[]>(`/audits/${auditId}/cycles`)
      set((s) => ({ cyclesByAudit: { ...s.cyclesByAudit, [auditId]: rows.map(mapCycleRow) } }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to load audit history') })
    }
  },

  fetchCycleDetail: async (auditId, cycleId) => {
    try {
      const row = await api.get<AuditCycleApiRow>(`/audits/${auditId}/cycles/${cycleId}`)
      return { ...mapCycleRow(row), snapshot: row.snapshot! } as AuditCycleDetail
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to load the archived cycle') })
      return null
    }
  },

  rescheduleAudit: async (auditId, dueDate) => {
    set({ isMutating: true, error: null })
    try {
      const res = await api.post<{ audit: AuditApiRow; cycle: { id: string; cycle_number: number } }>(
        `/audits/${auditId}/reschedule`,
        { due_date: dueDate },
      )
      const previous = get().byId[auditId]
      const audit = mapAuditRow(res.audit, previous)
      // Cycle-bound children reset server-side — clear the local mirrors too.
      const cleared = { ...audit, documents: [], comments: [], team: previous?.team }
      set((state) => ({
        audits: state.audits.map((a) => (a.id === auditId ? cleared : a)),
        byId: { ...state.byId, [auditId]: cleared },
        selectedAudit: state.selectedAudit?.id === auditId ? cleared : state.selectedAudit,
        isMutating: false,
      }))
      await get().fetchCycles(auditId)
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to reschedule the audit'), isMutating: false })
      throw e
    }
  },

  fetchDetailChildren: async (id) => {
    try {
      const [teamRes, commentsRes, docsRes] = await Promise.all([
        api.get<unknown>(`/audits/${id}/team`),
        api.get<unknown>(`/audits/${id}/comments`),
        api.get<unknown>(`/audits/${id}/documents`),
      ])
      const team: AuditTeamMember[] = unwrapItems<AuditTeamMemberApiRow>(teamRes).map((r) => {
        const p = resolveProfile(r.user_id)
        return {
          id: r.id,
          userId: r.user_id,
          name: p.name,
          avatar: p.avatar,
          role: r.role ?? '',
          isOwner: r.is_owner ?? false,
          addedAt: r.added_at,
        }
      })
      const comments: AuditComment[] = unwrapItems<AuditCommentApiRow>(commentsRes).map((r) => ({
        id: r.id,
        auditId: id,
        content: r.content,
        author: resolveProfile(r.author_id),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        isEdited: r.is_edited ?? false,
      }))
      const documents = unwrapItems<AuditDocumentApiRow>(docsRes).map(mapDocumentRow)
      const patch = (a: Audit): Audit => (a.id === id ? { ...a, team, comments, documents } : a)
      set((state) => ({
        audits: state.audits.map(patch),
        byId: state.byId[id] ? { ...state.byId, [id]: patch(state.byId[id]) } : state.byId,
        selectedAudit: state.selectedAudit?.id === id ? patch(state.selectedAudit) : state.selectedAudit,
        detailChildrenLoaded: { ...state.detailChildrenLoaded, [id]: true },
      }))
    } catch (e) {
      // Mark loaded anyway — sections render their empty states instead of
      // skeleton-ing forever; the error is surfaced on the store.
      set((state) => ({
        detailChildrenLoaded: { ...state.detailChildrenLoaded, [id]: true },
        error: errorMessage(e, 'Failed to load audit details'),
      }))
    }
  },

  create: async (data) => {
    requirePermission('Manage Audit Findings', { storeName: 'audit', actionName: 'create' })
    // W54 follow-up: NOT optimistic. The create modal blocks the screen while
    // its spinner runs, so a temp row spliced in here was visible behind the
    // overlay ~1s before the spinner settled ("the spinner don't match when it
    // actually appears"). The row is cached in byId for immediate detail
    // lookups, but the visible list is only updated by the caller's AWAITED
    // forced refetch (AddAuditModal onSuccess → fetchAll({force:true})), so the
    // row appears at the exact moment the spinner ends and the modal closes.
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<AuditApiRow>('/audits', toCreatePayload(data))
      const created = mapAuditRow(row)
      set((state) => ({
        byId: { ...state.byId, [created.id]: created },
        isMutating: false,
      }))

      const user = getCurrentUser()
      useAuditLogStore.getState().addLog({
        user,
        action: 'created',
        audit: created.title,
        auditId: created.id,
        description: `Created new audit: ${created.title}`,
        descriptionKey: 'auditDetail.activityCreatedAudit',
        descriptionParams: { title: created.title },
        status: 'completed',
      })

      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create audit'), isMutating: false })
      throw e
    }
  },

  update: async (id, data) => {
    requirePermission('Manage Audit Findings', { storeName: 'audit', actionName: 'update', id })
    // OPTIMISTIC: snapshot, apply patch, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Audit = { ...snapshot, ...data, updatedAt: new Date().toISOString() }
      set((state) => ({
        audits: state.audits.map((a) => (a.id === id ? optimistic : a)),
        byId: { ...state.byId, [id]: optimistic },
        selectedAudit: state.selectedAudit?.id === id ? optimistic : state.selectedAudit,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.patch<AuditApiRow>(`/audits/${id}`, toUpdatePayload(data))
      const previous = get().byId[id]
      const updated = mapAuditRow(row, previous)

      set((state) => ({
        audits: state.audits.map((a) => (a.id === id ? updated : a)),
        byId: { ...state.byId, [id]: updated },
        selectedAudit: state.selectedAudit?.id === id ? updated : state.selectedAudit,
        isMutating: false,
      }))

      const user = getCurrentUser()
      useAuditLogStore.getState().addLog({
        user,
        action: 'updated',
        audit: updated.title,
        auditId: updated.id,
        description: `Updated audit: ${updated.title}`,
        descriptionKey: 'auditDetail.activityUpdatedAudit',
        descriptionParams: { title: updated.title },
        status: 'completed',
      })

      return updated
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          audits: state.audits.map((a) => (a.id === id ? snapshot : a)),
          byId: { ...state.byId, [id]: snapshot },
          selectedAudit: state.selectedAudit?.id === id ? snapshot : state.selectedAudit,
          error: errorMessage(e, 'Failed to update audit'),
          isMutating: false,
        }))
      } else {
        set({ error: errorMessage(e, 'Failed to update audit'), isMutating: false })
      }
      throw e
    }
  },

  delete: async (id) => {
    requirePermission('Manage Audit Findings', { storeName: 'audit', actionName: 'delete', id })
    const auditToDelete = get().byId[id]
    const prevIndex = get().audits.findIndex((a) => a.id === id)
    // OPTIMISTIC: remove immediately, restore on failure.
    set((state) => {
      const { [id]: _removed, ...rest } = state.byId
      return {
        audits: state.audits.filter((a) => a.id !== id),
        byId: rest,
        selectedAudit: state.selectedAudit?.id === id ? null : state.selectedAudit,
        isMutating: true,
        error: null,
      }
    })
    try {
      await api.delete(`/audits/${id}`)
      set({ isMutating: false })
      if (auditToDelete) {
        const user = getCurrentUser()
        useAuditLogStore.getState().addLog({
          user,
          action: 'closed',
          audit: auditToDelete.title,
          auditId: auditToDelete.id,
          description: `Closed/deleted audit: ${auditToDelete.title}`,
          descriptionKey: 'auditDetail.activityClosedAudit',
          descriptionParams: { title: auditToDelete.title },
          status: 'completed',
        })
      }
    } catch (e) {
      if (auditToDelete) {
        set((state) => {
          const list = [...state.audits]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, auditToDelete)
          return {
            audits: list,
            byId: { ...state.byId, [id]: auditToDelete },
            error: errorMessage(e, 'Failed to delete audit'),
            isMutating: false,
          }
        })
      } else {
        set({ error: errorMessage(e, 'Failed to delete audit'), isMutating: false })
      }
      throw e
    }
  },

  start: async (id) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<AuditApiRow>(`/audits/${id}/start`)
      const previous = get().byId[id]
      const updated = mapAuditRow(row, previous)
      set((state) => ({
        audits: state.audits.map((a) => (a.id === id ? updated : a)),
        byId: { ...state.byId, [id]: updated },
        selectedAudit: state.selectedAudit?.id === id ? updated : state.selectedAudit,
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to start audit'), isMutating: false })
      throw e
    }
  },

  complete: async (id) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<AuditApiRow>(`/audits/${id}/complete`)
      const previous = get().byId[id]
      const updated = mapAuditRow(row, previous)
      set((state) => ({
        audits: state.audits.map((a) => (a.id === id ? updated : a)),
        byId: { ...state.byId, [id]: updated },
        selectedAudit: state.selectedAudit?.id === id ? updated : state.selectedAudit,
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to complete audit'), isMutating: false })
      throw e
    }
  },

  // ---- documents -------------------------------------------------------

  addDocument: async (auditId, documentData, user) => {
    set({ isMutating: true, error: null })
    try {
      // The API records a metadata row — file bytes must already live in
      // Supabase Storage at `storage_path`. Pages that previously passed only
      // `{name, type}` (no upload) get a derived storage path stub so the
      // metadata row still lands; a follow-up uploader page should fill in the
      // real path.
      const payload = {
        name: documentData.name,
        type: documentData.type,
        storage_path:
          documentData.storage_path ??
          `audits/${auditId}/${documentData.name}`,
      }
      const row = await api.post<AuditDocumentApiRow>(
        `/audits/${auditId}/documents`,
        payload,
      )
      const newDocument = mapDocumentRow(row)
      if (user?.name) newDocument.uploadedBy = user.name

      set((state) => ({
        audits: state.audits.map((a) =>
          a.id === auditId
            ? { ...a, documents: [...(a.documents ?? []), newDocument], updatedAt: new Date().toISOString() }
            : a,
        ),
        byId: state.byId[auditId]
          ? {
              ...state.byId,
              [auditId]: {
                ...state.byId[auditId],
                documents: [...(state.byId[auditId].documents ?? []), newDocument],
                updatedAt: new Date().toISOString(),
              },
            }
          : state.byId,
        selectedAudit:
          state.selectedAudit?.id === auditId
            ? {
                ...state.selectedAudit,
                documents: [...(state.selectedAudit.documents ?? []), newDocument],
                updatedAt: new Date().toISOString(),
              }
            : state.selectedAudit,
        isMutating: false,
      }))

      const currentUser = getCurrentUser()
      useAuditLogStore.getState().addLog({
        user: currentUser,
        action: 'uploaded',
        audit: get().byId[auditId]?.title ?? '',
        auditId,
        description: `Uploaded document: ${newDocument.name}`,
        descriptionKey: 'auditDetail.activityUploadedDocument',
        descriptionParams: { name: newDocument.name },
        status: 'completed',
      })

      return newDocument
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to upload document'), isMutating: false })
      return null
    }
  },

  removeDocument: async (auditId, documentId) => {
    // No DELETE endpoint yet for individual documents in Phase 4 — perform a
    // local-only removal so the UI responds; Phase 5+ should add
    // `/api/audits/[auditId]/documents/[docId]` (DELETE) and wire it here.
    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              documents: (a.documents ?? []).filter((d) => d.id !== documentId),
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              documents: (state.byId[auditId].documents ?? []).filter((d) => d.id !== documentId),
              updatedAt: new Date().toISOString(),
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              documents: (state.selectedAudit.documents ?? []).filter((d) => d.id !== documentId),
              updatedAt: new Date().toISOString(),
            }
          : state.selectedAudit,
    }))
  },

  // ---- team (W45: optimistic local + server persistence) ----------------

  addTeamMember: (auditId, memberData) => {
    const existing = get().byId[auditId]
    if (existing?.team?.some((m) => m.id === memberData.id || m.userId === memberData.id)) return null
    // W46: the incoming id IS the profile id — keep it as userId so the row
    // survives the id-swap to the server row id.
    const newMember: AuditTeamMember = { ...memberData, userId: memberData.userId ?? memberData.id, addedAt: new Date().toISOString() }

    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? { ...a, team: [...(a.team ?? []), newMember], updatedAt: new Date().toISOString() }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              team: [...(state.byId[auditId].team ?? []), newMember],
              updatedAt: new Date().toISOString(),
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              team: [...(state.selectedAudit.team ?? []), newMember],
              updatedAt: new Date().toISOString(),
            }
          : state.selectedAudit,
    }))

    // W45: persist (these used to be local-only and vanished on reload). The
    // optimistic entry keys on the USER id; swap to the server row id so a
    // follow-up remove targets the right resource.
    void api
      .post<AuditTeamMemberApiRow>(`/audits/${auditId}/team`, {
        user_id: memberData.id,
        role: memberData.role || undefined,
        is_owner: memberData.isOwner ?? false,
      })
      .then((row) => {
        const swap = (a: Audit): Audit =>
          a.id === auditId
            ? { ...a, team: (a.team ?? []).map((m) => (m.id === memberData.id ? { ...m, id: row.id } : m)) }
            : a
        set((state) => ({
          audits: state.audits.map(swap),
          byId: state.byId[auditId] ? { ...state.byId, [auditId]: swap(state.byId[auditId]) } : state.byId,
          selectedAudit: state.selectedAudit?.id === auditId ? swap(state.selectedAudit) : state.selectedAudit,
        }))
      })
      .catch((e) => {
        set({ error: errorMessage(e, 'Failed to add team member') })
        void get().fetchDetailChildren(auditId)
      })

    return newMember
  },

  removeTeamMember: (auditId, memberId) => {
    void api.delete(`/audits/${auditId}/team/${memberId}`).catch((e) => {
      set({ error: errorMessage(e, 'Failed to remove team member') })
      void get().fetchDetailChildren(auditId)
    })
    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              team: (a.team ?? []).filter((m) => m.id !== memberId),
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              team: (state.byId[auditId].team ?? []).filter((m) => m.id !== memberId),
              updatedAt: new Date().toISOString(),
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              team: (state.selectedAudit.team ?? []).filter((m) => m.id !== memberId),
              updatedAt: new Date().toISOString(),
            }
          : state.selectedAudit,
    }))
  },

  // ---- comments (W45: optimistic local + server persistence) ------------

  addComment: (auditId, content, author) => {
    const newComment: AuditComment = {
      id: crypto.randomUUID(),
      auditId,
      content,
      author,
      createdAt: new Date().toISOString(),
      isEdited: false,
    }

    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              comments: [...(a.comments ?? []), newComment],
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              comments: [...(state.byId[auditId].comments ?? []), newComment],
              updatedAt: new Date().toISOString(),
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              comments: [...(state.selectedAudit.comments ?? []), newComment],
              updatedAt: new Date().toISOString(),
            }
          : state.selectedAudit,
    }))

    const audit = get().byId[auditId]
    const truncatedComment = `${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`
    useAuditLogStore.getState().addLog({
      user: { name: author.name, avatar: author.avatar },
      action: 'commented',
      audit: audit?.title ?? '',
      auditId,
      description: `Added comment: "${truncatedComment}"`,
      descriptionKey: 'auditDetail.activityAddedComment',
      descriptionParams: { comment: truncatedComment },
      status: 'completed',
    })

    // W45: persist + swap the optimistic id for the server row id so
    // edit/delete target the right resource after reload-free flows.
    void api
      .post<AuditCommentApiRow>(`/audits/${auditId}/comments`, { content })
      .then((row) => {
        const swap = (a: Audit): Audit =>
          a.id === auditId
            ? { ...a, comments: (a.comments ?? []).map((c) => (c.id === newComment.id ? { ...c, id: row.id } : c)) }
            : a
        set((state) => ({
          audits: state.audits.map(swap),
          byId: state.byId[auditId] ? { ...state.byId, [auditId]: swap(state.byId[auditId]) } : state.byId,
          selectedAudit: state.selectedAudit?.id === auditId ? swap(state.selectedAudit) : state.selectedAudit,
        }))
      })
      .catch((e) => {
        set({ error: errorMessage(e, 'Failed to add comment') })
        void get().fetchDetailChildren(auditId)
      })

    return newComment
  },

  editComment: (auditId, commentId, newContent, _editor) => {
    const now = new Date().toISOString()
    const patchComment = (c: AuditComment): AuditComment =>
      c.id === commentId
        ? { ...c, content: newContent, updatedAt: now, isEdited: true }
        : c

    // W45: persist (resync from server on failure).
    void api.patch(`/audits/${auditId}/comments/${commentId}`, { content: newContent }).catch((e) => {
      set({ error: errorMessage(e, 'Failed to edit comment') })
      void get().fetchDetailChildren(auditId)
    })

    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? { ...a, comments: (a.comments ?? []).map(patchComment), updatedAt: now }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              comments: (state.byId[auditId].comments ?? []).map(patchComment),
              updatedAt: now,
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              comments: (state.selectedAudit.comments ?? []).map(patchComment),
              updatedAt: now,
            }
          : state.selectedAudit,
    }))

    const audit = get().byId[auditId]
    const currentUser = getCurrentUser()
    const truncatedComment = `${newContent.substring(0, 50)}${newContent.length > 50 ? '...' : ''}`
    useAuditLogStore.getState().addLog({
      user: currentUser,
      action: 'updated',
      audit: audit?.title ?? '',
      auditId,
      description: `Edited comment: "${truncatedComment}"`,
      descriptionKey: 'auditDetail.activityEditedComment',
      descriptionParams: { comment: truncatedComment },
      status: 'completed',
    })
  },

  deleteComment: (auditId, commentId, _deleter) => {
    const audit = get().byId[auditId]
    const comment = audit?.comments?.find((c) => c.id === commentId)
    const now = new Date().toISOString()

    // W45: persist (resync from server on failure).
    void api.delete(`/audits/${auditId}/comments/${commentId}`).catch((e) => {
      set({ error: errorMessage(e, 'Failed to delete comment') })
      void get().fetchDetailChildren(auditId)
    })

    set((state) => ({
      audits: state.audits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              comments: (a.comments ?? []).filter((c) => c.id !== commentId),
              updatedAt: now,
            }
          : a,
      ),
      byId: state.byId[auditId]
        ? {
            ...state.byId,
            [auditId]: {
              ...state.byId[auditId],
              comments: (state.byId[auditId].comments ?? []).filter((c) => c.id !== commentId),
              updatedAt: now,
            },
          }
        : state.byId,
      selectedAudit:
        state.selectedAudit?.id === auditId
          ? {
              ...state.selectedAudit,
              comments: (state.selectedAudit.comments ?? []).filter((c) => c.id !== commentId),
              updatedAt: now,
            }
          : state.selectedAudit,
    }))

    const currentUser = getCurrentUser()
    const truncatedComment = `${comment?.content.substring(0, 30) ?? ''}...`
    useAuditLogStore.getState().addLog({
      user: currentUser,
      action: 'updated',
      audit: audit?.title ?? '',
      auditId,
      description: `Deleted comment: "${truncatedComment}"`,
      descriptionKey: 'auditDetail.activityDeletedComment',
      descriptionParams: { comment: truncatedComment },
      status: 'completed',
    })
  },

  // ---- status -------------------------------------------------------------

  updateStatus: async (auditId, newStatus, _user) => {
    requirePermission('Manage Audit Findings', {
      storeName: 'audit',
      actionName: `updateStatus:${newStatus}`,
      id: auditId,
    })
    const audit = get().byId[auditId]
    const oldStatus = audit?.status

    try {
      if (newStatus === 'in_progress') {
        await get().start(auditId)
      } else if (newStatus === 'completed') {
        await get().complete(auditId)
      } else {
        // Fall back to a generic PATCH for non-transition statuses (e.g. resetting to pending).
        await get().update(auditId, { status: newStatus })
      }
    } catch (e) {
      // The underlying action already set `error`; rethrow nothing — the
      // caller fires a toast on its own path.
      set({ error: errorMessage(e, 'Failed to update status') })
      return
    }

    // Compliance-engine logging mirrors the legacy implementation: tag closes
    // that landed past the due date so dashboards highlight them.
    const isOverdue = audit?.dueDate ? new Date(audit.dueDate) < new Date() : false
    const isClosingOverdue = newStatus === 'completed' && isOverdue

    const currentUser = getCurrentUser()
    const statusLabels: Record<string, string> = {
      pending: 'Pending',
      in_progress: 'In Progress',
      completed: 'Completed',
      overdue: 'Overdue',
    }
    const dueDate = audit?.dueDate ? new Date(audit.dueDate).toLocaleDateString() : 'earlier'
    const description = isClosingOverdue
      ? `Closed audit as overdue (was due ${dueDate})`
      : `Changed status from ${statusLabels[oldStatus ?? 'pending']} to ${statusLabels[newStatus]}`

    const descriptionKey = isClosingOverdue
      ? 'auditDetail.activityClosedOverdue'
      : 'auditDetail.activityStatusChanged'

    const descriptionParams: Record<string, string> = isClosingOverdue
      ? { date: dueDate }
      : { from: oldStatus ?? 'pending', to: newStatus }

    useAuditLogStore.getState().addLog({
      user: currentUser,
      action: 'updated',
      audit: audit?.title ?? '',
      auditId,
      description,
      descriptionKey,
      descriptionParams,
      status: 'completed',
    })
  },

  // ---- UI helpers ---------------------------------------------------------

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (audit) => set({ selectedAudit: audit }),
  setSort: (sort) => set({ sort }),
  setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
  setPageSize: (pageSize) =>
    set((state) => ({
      pagination: {
        ...state.pagination,
        pageSize,
        totalPages: pageSize > 0 ? Math.max(1, Math.ceil(state.pagination.total / pageSize)) : 1,
      },
    })),
  clearError: () => set({ error: null }),
}))
