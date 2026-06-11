// Risk store — Phase 5 server-state migration.
//
// Core CRUD (`fetchAll`, `fetchById`, `create`, `update`, `delete`) goes through
// /api/risks. The mitigation-workflow sub-actions
// (`assignDepartment`, `setMitigationDeadline`, `sendToDepartment`,
// `submitDepartmentPlan`, `acceptDepartmentPlan`, `toggleDepartmentPlanItem`)
// hit the dedicated route family at /api/risks/[id]/*. Mitigation checklist
// mutations (`addMitigationItem` / `editMitigationItem` / `toggleMitigationItem`
// / `removeMitigationItem`) are wired to /api/risks/[id]/checklist[/itemId].
// `markReviewed` is a thin wrapper around `update`.
//
// Legacy method names are preserved so the risks reports page keeps compiling.
//
// SKELETON-LOADING NOTE: consumer pages render a skeleton when
// `isLoading && risks.length === 0` (first-fetch). On refetch, stale data
// stays visible while `isLoading` flips back to true with a subtle indicator.
// Detail-page sub-sections may additionally gate on `isDetailLoaded(id)` to
// skeleton-render until the full detail payload (history, proposed plan,
// checklist) has arrived from `fetchById`.

import { create } from 'zustand'
import type {
  Risk,
  RiskFilters,
  PaginationState,
  SortState,
  MonitoringFrequency,
  MitigationChecklistItem,
  RiskMitigationWorkflowStatus,
  DepartmentProposedPlan,
  RegulatoryBodyId,
  ReviewSchedule,
  RiskHistoryEntry,
  User,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { computeNextReview } from '@/lib/review-schedule'
import { requirePermission } from '@/lib/rbac-store-gate'
import { newTempId } from '@/lib/optimistic'

// ---------- helpers ---------------------------------------------------------

function computeNextReviewDate(from: string, frequency: MonitoringFrequency): string {
  const d = new Date(from)
  switch (frequency) {
    case 'weekly':      d.setDate(d.getDate() + 7);   break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
    case 'quarterly':   d.setMonth(d.getMonth() + 3); break
    case 'semi_annual': d.setMonth(d.getMonth() + 6); break
    case 'annual':      d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString()
}

function computeMitigationProgress(checklist?: Array<{ completed: boolean }>): number {
  if (!checklist || checklist.length === 0) return 0
  return Math.round((checklist.filter((i) => i.completed).length / checklist.length) * 100)
}

// ---------- API row shapes --------------------------------------------------

// List rows surface the columns from `RISK_LIST_COLUMNS` (server-side).
interface RiskApiRow {
  id: string
  title: string
  description?: string | null
  category: string
  likelihood: number
  impact: number
  risk_score: number
  status: string
  owner_id: string | null
  mitigation_plan?: string | null
  mitigation_progress: number
  monitoring_frequency: string
  last_review_date?: string | null
  next_review_date?: string | null
  review_schedule?: unknown
  intended_department_id?: string | null
  mitigation_deadline?: string | null
  mitigation_workflow_status?: string | null
  sent_to_department_at?: string | null
  framework_ids: string[]
  created_at: string
  updated_at: string
}

// Detail GET additionally surfaces composite children.
interface RiskChecklistRow {
  id: string
  risk_id: string
  text: string
  completed: boolean
  sort_order: number
  deadline?: string | null
}

interface RiskHistoryRow {
  id: string
  risk_id: string
  user_id: string | null
  action: string
  previous_value: string | null
  new_value: string | null
  notes: string | null
  created_at: string
}

interface RiskProposedPlanRow {
  risk_id: string
  plan: string
  submitted_by: string | null
  submitted_at: string
}

interface RiskPlanDocumentRow {
  id: string
  risk_id: string
  name: string
  type: string
  storage_path: string
  uploaded_at: string
}

interface RiskApiDetail extends RiskApiRow {
  mitigation_checklist?: RiskChecklistRow[]
  proposed_plan?: RiskProposedPlanRow | null
  history?: RiskHistoryRow[]
  plan_documents?: RiskPlanDocumentRow[]
}

function stubOwner(id: string | null): User {
  return {
    id: id ?? '',
    name: '',
    email: '',
    role: 'officer',
    department: '',
    avatar: '',
    workload: 0,
  }
}

function mapChecklistRow(row: RiskChecklistRow): MitigationChecklistItem {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    deadline: row.deadline ?? undefined,
  }
}

function mapHistoryRow(row: RiskHistoryRow): RiskHistoryEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    user: row.user_id ?? '',
    action: row.action as RiskHistoryEntry['action'],
    previousValue: row.previous_value ?? undefined,
    newValue: row.new_value ?? undefined,
    notes: row.notes ?? undefined,
  }
}

function mapRow(row: RiskApiRow | RiskApiDetail, previous?: Risk): Risk {
  const detail = row as RiskApiDetail
  const checklist = Array.isArray(detail.mitigation_checklist)
    ? detail.mitigation_checklist.map(mapChecklistRow)
    : previous?.mitigationChecklist
  const history = Array.isArray(detail.history)
    ? detail.history.map(mapHistoryRow)
    : previous?.history ?? []
  let proposedPlan: DepartmentProposedPlan | undefined = previous?.departmentProposedPlan
  if (detail.proposed_plan) {
    proposedPlan = {
      id: detail.proposed_plan.risk_id,
      plan: detail.proposed_plan.plan,
      checklist: checklist ?? [],
      submittedAt: detail.proposed_plan.submitted_at,
      submittedBy: detail.proposed_plan.submitted_by ?? '',
    }
  } else if (detail.proposed_plan === null) {
    proposedPlan = undefined
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? previous?.description ?? '',
    category: row.category,
    likelihood: row.likelihood as Risk['likelihood'],
    impact: row.impact as Risk['impact'],
    riskScore: row.risk_score,
    status: row.status as Risk['status'],
    owner: previous?.owner ?? stubOwner(row.owner_id),
    mitigationPlan: row.mitigation_plan ?? previous?.mitigationPlan,
    mitigationChecklist: checklist,
    mitigationProgress: row.mitigation_progress ?? previous?.mitigationProgress ?? 0,
    monitoringFrequency: row.monitoring_frequency as MonitoringFrequency,
    lastReviewDate: row.last_review_date ?? previous?.lastReviewDate,
    nextReviewDate: row.next_review_date ?? previous?.nextReviewDate,
    reviewSchedule: (row.review_schedule as ReviewSchedule | undefined) ?? previous?.reviewSchedule,
    history,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    intendedDepartmentId: row.intended_department_id ?? previous?.intendedDepartmentId,
    mitigationDeadline: row.mitigation_deadline ?? previous?.mitigationDeadline,
    mitigationWorkflowStatus:
      (row.mitigation_workflow_status as RiskMitigationWorkflowStatus | undefined) ??
      previous?.mitigationWorkflowStatus,
    departmentProposedPlan: proposedPlan,
    planDocuments: Array.isArray(detail.plan_documents)
      ? detail.plan_documents.map((d) => ({
          id: d.id, name: d.name, type: d.type, storagePath: d.storage_path, uploadedAt: d.uploaded_at,
        }))
      : previous?.planDocuments,
    sentToDepartmentAt: row.sent_to_department_at ?? previous?.sentToDepartmentAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(data: Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>): Record<string, unknown> {
  return {
    title: data.title,
    description: data.description,
    category: data.category,
    likelihood: data.likelihood,
    impact: data.impact,
    owner_id: data.owner?.id || undefined,
    mitigation_plan: data.mitigationPlan ?? undefined,
    monitoring_frequency: data.monitoringFrequency,
    last_review_date: data.lastReviewDate ?? undefined,
    next_review_date: data.nextReviewDate ?? undefined,
    review_schedule: data.reviewSchedule ?? undefined,
    intended_department_id: data.intendedDepartmentId ?? undefined,
    mitigation_deadline: data.mitigationDeadline ?? undefined,
    framework_ids: data.frameworkIds ?? [],
  }
}

function toUpdatePayload(patch: Partial<Risk>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.description !== undefined) out.description = patch.description
  if (patch.category !== undefined) out.category = patch.category
  if (patch.likelihood !== undefined) out.likelihood = patch.likelihood
  if (patch.impact !== undefined) out.impact = patch.impact
  // Owner edits previously no-op'd: the modal sent `owner` but this mapper
  // never translated it to the `owner_id` the API expects. Map it through.
  if (patch.owner !== undefined) out.owner_id = patch.owner.id
  if (patch.status !== undefined) out.status = patch.status
  if (patch.mitigationPlan !== undefined) out.mitigation_plan = patch.mitigationPlan
  if (patch.mitigationProgress !== undefined) out.mitigation_progress = patch.mitigationProgress
  if (patch.monitoringFrequency !== undefined) out.monitoring_frequency = patch.monitoringFrequency
  if (patch.lastReviewDate !== undefined) out.last_review_date = patch.lastReviewDate
  if (patch.nextReviewDate !== undefined) out.next_review_date = patch.nextReviewDate
  if (patch.reviewSchedule !== undefined) out.review_schedule = patch.reviewSchedule
  if (patch.intendedDepartmentId !== undefined)
    out.intended_department_id = patch.intendedDepartmentId
  if (patch.mitigationDeadline !== undefined) out.mitigation_deadline = patch.mitigationDeadline
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

function appendHistory(previous: Risk, entry: Omit<RiskHistoryEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): RiskHistoryEntry[] {
  const full: RiskHistoryEntry = {
    id: entry.id ?? crypto.randomUUID(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    user: entry.user,
    action: entry.action,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    notes: entry.notes,
  }
  return [...previous.history, full]
}

// ---------- store -----------------------------------------------------------

interface RiskState {
  risks: Risk[]
  byId: Record<string, Risk>
  // Tracks which IDs have had their full detail payload loaded (history,
  // checklist, proposed plan). Detail-page sub-sections gate skeleton render
  // on `isDetailLoaded(id)` rather than `isLoading` so list-fetched rows
  // don't flash incomplete data.
  detailLoadedIds: Record<string, true>
  selectedRisk: Risk | null
  filters: RiskFilters
  pagination: PaginationState
  sort: SortState

  // First-fetch skeleton: `isLoading && risks.length === 0` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Async CRUD
  fetchAll: (force?: boolean) => Promise<void>
  fetchById: (id: string) => Promise<Risk | null>
  create: (data: Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>) => Promise<Risk>
  update: (id: string, data: Partial<Risk>) => Promise<Risk>
  delete: (id: string) => Promise<void>

  // Detail-loaded helper
  isDetailLoaded: (id: string) => boolean

  // Status / review (legacy sync facade backed by an async PATCH)
  updateStatus: (id: string, newStatus: Risk['status']) => void
  markReviewed: (riskId: string) => void

  // Mitigation plan scalar (parity with other stores). Convenience wrappers
  // around `update(id, { mitigationPlan })` plus optimistic history-append.
  addMitigationPlan: (riskId: string, plan: string) => Promise<void>
  updateMitigationPlan: (riskId: string, plan: string) => Promise<void>
  deleteMitigationPlan: (riskId: string) => Promise<void>

  // Mitigation checklist — server-backed (POST/PATCH/DELETE).
  addMitigationItem: (riskId: string, text: string) => Promise<void>
  editMitigationItem: (riskId: string, itemId: string, newText: string) => Promise<void>
  toggleMitigationItem: (riskId: string, itemId: string) => Promise<void>
  removeMitigationItem: (riskId: string, itemId: string) => Promise<void>
  setMitigationItemDeadline: (riskId: string, itemId: string, deadline: string | undefined) => Promise<void>
  addPlanDocument: (riskId: string, doc: { name: string; type: string; storage_path: string }) => Promise<void>
  removePlanDocument: (riskId: string, docId: string) => Promise<void>

  // Officer-driven mitigation workflow (async; backed by /api/risks/[id]/*).
  assignDepartment: (riskId: string, departmentId: string) => void
  setMitigationDeadline: (riskId: string, deadline: string | undefined) => void
  sendToDepartment: (riskId: string, actingUser: string) => void
  submitDepartmentPlan: (
    riskId: string,
    plan: string,
    checklist: Array<{ text: string; deadline?: string }>,
    submittedBy: string,
  ) => void
  acceptDepartmentPlan: (riskId: string, actingUser: string) => void
  toggleDepartmentPlanItem: (riskId: string, itemId: string, actingUser: string) => void

  // UI helpers
  setFilters: (filters: RiskFilters) => void
  clearFilters: () => void
  setSelected: (risk: Risk | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  clearError: () => void
}

const INITIAL_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
}

const INITIAL_SORT: SortState = {
  field: 'riskScore',
  direction: 'desc',
}

export const useRiskStore = create<RiskState>()((set, get) => ({
  risks: [],
  byId: {},
  detailLoadedIds: {},
  selectedRisk: null,
  filters: {},
  pagination: INITIAL_PAGINATION,
  sort: INITIAL_SORT,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (force = false) => {
    const state = get()
    // Skip if a fresh fetch completed in the last 30s, unless force=true.
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) {
      return
    }
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: RiskApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/risks', { page: 1, pageSize: 100 })
      const previousById = get().byId
      const risks = result.items.map((r) => mapRow(r, previousById[r.id]))
      const byId: Record<string, Risk> = {}
      for (const r of risks) byId[r.id] = r
      set({
        risks,
        byId,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch risks'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<RiskApiDetail>(`/risks/${id}`)
      const previous = get().byId[id]
      const risk = mapRow(row, previous)
      // Push into `risks[]` if missing — deep-link to a freshly-created risk
      // would otherwise leave list-keyed selectors (e.g. `risks.find(r => r.id === riskId)`)
      // empty. Same pattern as the audit / observation stores.
      set((s) => ({
        byId: { ...s.byId, [id]: risk },
        risks: s.risks.some((r) => r.id === id)
          ? s.risks.map((r) => (r.id === id ? risk : r))
          : [risk, ...s.risks],
        detailLoadedIds: { ...s.detailLoadedIds, [id]: true },
        selectedRisk: risk,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return risk
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch risk'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  isDetailLoaded: (id) => Boolean(get().detailLoadedIds[id]),

  create: async (data) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'create' })
    // OPTIMISTIC: insert temp row immediately. Replace with server row on
    // success; roll back on failure.
    const tempId = newTempId('temp-risk')
    const now = new Date().toISOString()
    const seedHistory = [{
      id: crypto.randomUUID(),
      timestamp: now,
      user: data.owner?.name ?? '',
      action: 'created' as const,
      notes: 'Risk created',
    }]
    const optimistic: Risk = {
      ...(data as Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>),
      id: tempId,
      riskScore: 0,
      history: seedHistory,
      createdAt: now,
      updatedAt: now,
    } as Risk
    set((s) => ({
      risks: [optimistic, ...s.risks],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    try {
      const row = await api.post<RiskApiRow>('/risks', toCreatePayload(data))
      const created = mapRow(row)
      // Inject the seed history entry locally for parity with the legacy store.
      created.history = seedHistory
      set((s) => {
        const { [tempId]: _drop, ...restById } = s.byId
        return {
          risks: s.risks.map((r) => (r.id === tempId ? created : r)),
          byId: { ...restById, [created.id]: created },
          isMutating: false,
        }
      })
      void get().fetchAll()
      return created
    } catch (e) {
      set((s) => {
        const { [tempId]: _drop, ...rest } = s.byId
        return {
          risks: s.risks.filter((r) => r.id !== tempId),
          byId: rest,
          error: errorMessage(e, 'Failed to create risk'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  update: async (id, data) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'update', id })
    // OPTIMISTIC: snapshot, apply patch, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Risk = { ...snapshot, ...data, updatedAt: new Date().toISOString() }
      set((s) => ({
        risks: s.risks.map((r) => (r.id === id ? optimistic : r)),
        byId: { ...s.byId, [id]: optimistic },
        selectedRisk: s.selectedRisk?.id === id ? optimistic : s.selectedRisk,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.patch<RiskApiRow>(`/risks/${id}`, toUpdatePayload(data))
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      set((s) => ({
        risks: s.risks.map((r) => (r.id === id ? updated : r)),
        byId: { ...s.byId, [id]: updated },
        selectedRisk: s.selectedRisk?.id === id ? updated : s.selectedRisk,
        isMutating: false,
      }))
      return updated
    } catch (e) {
      if (snapshot) {
        set((s) => ({
          risks: s.risks.map((r) => (r.id === id ? snapshot : r)),
          byId: { ...s.byId, [id]: snapshot },
          selectedRisk: s.selectedRisk?.id === id ? snapshot : s.selectedRisk,
          error: errorMessage(e, 'Failed to update risk'),
          isMutating: false,
        }))
      } else {
        set({ error: errorMessage(e, 'Failed to update risk'), isMutating: false })
      }
      throw e
    }
  },

  delete: async (id) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'delete', id })
    // CONFIRM-THEN-REMOVE (not optimistic): the delete confirmation dialog
    // shows its spinner for the lifetime of this promise and closes when it
    // resolves. If we removed the row up front (optimistic), the row would
    // vanish from the table seconds before the dialog's spinner finished —
    // the mismatch Hani reported. Awaiting the server first means the row
    // disappears at the same instant the dialog closes. Matches the
    // EditableSelect delete convention (server-confirmed, then mutate state).
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/risks/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        const { [id]: _dropDetail, ...restDetail } = s.detailLoadedIds
        return {
          risks: s.risks.filter((r) => r.id !== id),
          byId: rest,
          selectedRisk: s.selectedRisk?.id === id ? null : s.selectedRisk,
          detailLoadedIds: restDetail,
          isMutating: false,
        }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete risk'), isMutating: false })
      throw e
    }
  },

  updateStatus: (id, newStatus) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: `updateStatus:${newStatus}`, id })
    const previous = get().byId[id]
    if (!previous) return
    // Optimistic local update so the UI flips immediately.
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      status: newStatus,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'status_changed',
        previousValue: previous.status,
        newValue: newStatus,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === id ? optimistic : r)),
      byId: { ...s.byId, [id]: optimistic },
      selectedRisk: s.selectedRisk?.id === id ? optimistic : s.selectedRisk,
    }))
    void get().update(id, { status: newStatus }).catch(() => {
      // The async `update()` already sets `error` — nothing more to do.
    })
  },

  // ---- mitigation plan scalar (parity wrappers) --------------------------

  addMitigationPlan: async (riskId, plan) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      mitigationPlan: plan,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'mitigation_updated',
        newValue: plan,
        notes: 'Mitigation plan added',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await get().update(riskId, { mitigationPlan: plan })
    } catch {
      // `update` already rolled back and surfaced the error.
    }
  },

  updateMitigationPlan: async (riskId, plan) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      mitigationPlan: plan,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'mitigation_updated',
        previousValue: previous.mitigationPlan,
        newValue: plan,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await get().update(riskId, { mitigationPlan: plan })
    } catch {
      // `update` rolled back already.
    }
  },

  deleteMitigationPlan: async (riskId) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      mitigationPlan: undefined,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'mitigation_updated',
        previousValue: previous.mitigationPlan,
        notes: 'Mitigation plan removed',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await get().update(riskId, { mitigationPlan: undefined })
    } catch {
      // `update` rolled back already.
    }
  },

  // ---- mitigation checklist (server-backed) ------------------------------
  // Wired to /api/risks/[id]/checklist[/itemId]. Each mutation runs optimistic
  // local state first, then reconciles with the server response. Failures
  // restore the prior snapshot (the inner `set` covers `risks`, `byId`,
  // `selectedRisk`, and `history`).

  addMitigationItem: async (riskId, text) => {
    const previous = get().byId[riskId]
    if (!previous) return
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'addMitigationItem', id: riskId })
    const now = new Date().toISOString()
    const tempItemId = newTempId('temp-risk-item')
    const optimisticItem: MitigationChecklistItem = { id: tempItemId, text, completed: false }
    const checklist = [...(previous.mitigationChecklist ?? []), optimisticItem]
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: checklist,
      mitigationProgress: computeMitigationProgress(checklist),
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'checklist_added',
        newValue: text,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      const row = await api.post<RiskChecklistRow>(`/risks/${riskId}/checklist`, { text })
      const serverItem = mapChecklistRow(row)
      set((s) => {
        const current = s.byId[riskId]
        if (!current) return s
        const swapped = (current.mitigationChecklist ?? []).map((i) =>
          i.id === tempItemId ? serverItem : i,
        )
        const reconciled: Risk = {
          ...current,
          mitigationChecklist: swapped,
          mitigationProgress: computeMitigationProgress(swapped),
        }
        return {
          risks: s.risks.map((r) => (r.id === riskId ? reconciled : r)),
          byId: { ...s.byId, [riskId]: reconciled },
          selectedRisk: s.selectedRisk?.id === riskId ? reconciled : s.selectedRisk,
        }
      })
    } catch (e) {
      set((s) => ({
        risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
        byId: { ...s.byId, [riskId]: previous },
        selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
        error: errorMessage(e, 'Failed to add checklist item'),
      }))
    }
  },

  editMitigationItem: async (riskId, itemId, newText) => {
    const previous = get().byId[riskId]
    if (!previous) return
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'editMitigationItem', id: riskId })
    const now = new Date().toISOString()
    const checklist = (previous.mitigationChecklist ?? []).map((i) =>
      i.id === itemId ? { ...i, text: newText } : i,
    )
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: checklist,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'checklist_edited',
        newValue: newText,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await api.patch(`/risks/${riskId}/checklist/${itemId}`, { text: newText })
    } catch (e) {
      set((s) => ({
        risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
        byId: { ...s.byId, [riskId]: previous },
        selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
        error: errorMessage(e, 'Failed to update checklist item'),
      }))
      // If the row is gone server-side (404 — id drifted out of sync after a
      // plan submit/accept), reconcile to server truth rather than leaving a
      // stale local item that will keep failing.
      if (e instanceof ApiClientError && e.code === 'not_found') void get().fetchById(riskId)
    }
  },

  toggleMitigationItem: async (riskId, itemId) => {
    const previous = get().byId[riskId]
    if (!previous) return
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'toggleMitigationItem', id: riskId })
    const now = new Date().toISOString()
    const currentItem = (previous.mitigationChecklist ?? []).find((i) => i.id === itemId)
    const targetCompleted = currentItem ? !currentItem.completed : true
    const checklist = (previous.mitigationChecklist ?? []).map((i) =>
      i.id === itemId ? { ...i, completed: targetCompleted } : i,
    )
    const allDone = checklist.length > 0 && checklist.every((i) => i.completed)
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: checklist,
      mitigationProgress: computeMitigationProgress(checklist),
      status: allDone ? 'resolved' : previous.status,
      mitigationWorkflowStatus: allDone ? 'mitigated' : previous.mitigationWorkflowStatus,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'checklist_toggled',
        newValue: currentItem?.text,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await api.patch(`/risks/${riskId}/checklist/${itemId}`, { completed: targetCompleted })
    } catch (e) {
      set((s) => ({
        risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
        byId: { ...s.byId, [riskId]: previous },
        selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
        error: errorMessage(e, 'Failed to toggle checklist item'),
      }))
    }
  },

  removeMitigationItem: async (riskId, itemId) => {
    const previous = get().byId[riskId]
    if (!previous) return
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'removeMitigationItem', id: riskId })
    const now = new Date().toISOString()
    const removed = (previous.mitigationChecklist ?? []).find((i) => i.id === itemId)
    const checklist = (previous.mitigationChecklist ?? []).filter((i) => i.id !== itemId)
    // Cascade: the department's proposed-plan checklist is the SAME set of
    // risk_mitigation_checklist rows, so removing an item must drop it from the
    // proposed-plan view too (otherwise the two lists diverge until refetch).
    const proposedPlan = previous.departmentProposedPlan
      ? {
          ...previous.departmentProposedPlan,
          checklist: previous.departmentProposedPlan.checklist.filter((i) => i.id !== itemId),
        }
      : previous.departmentProposedPlan
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: checklist,
      departmentProposedPlan: proposedPlan,
      mitigationProgress: computeMitigationProgress(checklist),
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'checklist_removed',
        newValue: removed?.text,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    try {
      await api.delete(`/risks/${riskId}/checklist/${itemId}`)
    } catch (e) {
      set((s) => ({
        risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
        byId: { ...s.byId, [riskId]: previous },
        selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
        error: errorMessage(e, 'Failed to remove checklist item'),
      }))
    }
  },

  setMitigationItemDeadline: async (riskId, itemId, deadline) => {
    const previous = get().byId[riskId]
    if (!previous) return
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'setMitigationItemDeadline', id: riskId })
    const apply = (item: MitigationChecklistItem) =>
      item.id === itemId ? { ...item, deadline: deadline ?? undefined } : item
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: (previous.mitigationChecklist ?? []).map(apply),
      // Keep the proposed-plan view in sync (same underlying rows).
      departmentProposedPlan: previous.departmentProposedPlan
        ? { ...previous.departmentProposedPlan, checklist: previous.departmentProposedPlan.checklist.map(apply) }
        : previous.departmentProposedPlan,
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    // The item hasn't been persisted yet (still an optimistic temp id) — keep
    // the local deadline; it'll be saved once the add reconciles. Firing now
    // would PATCH a non-existent id.
    if (itemId.startsWith('temp-')) return
    try {
      await api.patch(`/risks/${riskId}/checklist/${itemId}`, { deadline: deadline ?? null })
    } catch (e) {
      set((s) => ({
        risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
        byId: { ...s.byId, [riskId]: previous },
        selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
        error: errorMessage(e, 'Failed to set checklist item deadline'),
      }))
      if (e instanceof ApiClientError && e.code === 'not_found') void get().fetchById(riskId)
    }
  },

  addPlanDocument: async (riskId, doc) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'addPlanDocument', id: riskId })
    const row = await api.post<RiskPlanDocumentRow>(`/risks/${riskId}/plan-documents`, doc)
    const mapped = { id: row.id, name: row.name, type: row.type, storagePath: row.storage_path, uploadedAt: row.uploaded_at }
    set((s) => {
      const prev = s.byId[riskId]
      if (!prev) return s
      const next: Risk = { ...prev, planDocuments: [mapped, ...(prev.planDocuments ?? [])] }
      return {
        risks: s.risks.map((r) => (r.id === riskId ? next : r)),
        byId: { ...s.byId, [riskId]: next },
        selectedRisk: s.selectedRisk?.id === riskId ? next : s.selectedRisk,
      }
    })
  },

  removePlanDocument: async (riskId, docId) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'removePlanDocument', id: riskId })
    const prev = get().byId[riskId]
    const snapshot = prev?.planDocuments
    // Optimistic remove.
    set((s) => {
      const cur = s.byId[riskId]
      if (!cur) return s
      const next: Risk = { ...cur, planDocuments: (cur.planDocuments ?? []).filter((d) => d.id !== docId) }
      return {
        risks: s.risks.map((r) => (r.id === riskId ? next : r)),
        byId: { ...s.byId, [riskId]: next },
        selectedRisk: s.selectedRisk?.id === riskId ? next : s.selectedRisk,
      }
    })
    try {
      await api.delete(`/risks/${riskId}/plan-documents/${docId}`)
    } catch (e) {
      set((s) => {
        const cur = s.byId[riskId]
        if (!cur) return { error: errorMessage(e, 'Failed to remove document') }
        const restored: Risk = { ...cur, planDocuments: snapshot }
        return {
          risks: s.risks.map((r) => (r.id === riskId ? restored : r)),
          byId: { ...s.byId, [riskId]: restored },
          selectedRisk: s.selectedRisk?.id === riskId ? restored : s.selectedRisk,
          error: errorMessage(e, 'Failed to remove document'),
        }
      })
    }
  },

  markReviewed: (riskId) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const nextReviewDate = previous.reviewSchedule
      ? computeNextReview(previous.reviewSchedule, new Date())
      : computeNextReviewDate(now, previous.monitoringFrequency)
    const optimistic: Risk = {
      ...previous,
      lastReviewDate: now,
      nextReviewDate,
      updatedAt: now,
      history: appendHistory(previous, {
        user: previous.owner.name,
        action: 'reviewed',
        notes: 'Risk marked as reviewed',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void get().update(riskId, {
      lastReviewDate: now,
      nextReviewDate,
    }).catch(() => {})
  },

  // ---- officer mitigation workflow (server-backed) ----------------------

  assignDepartment: (riskId, departmentId) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const optimistic: Risk = {
      ...previous,
      intendedDepartmentId: departmentId,
      mitigationWorkflowStatus:
        previous.mitigationWorkflowStatus ?? 'pending-assignment',
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/assign-department`, {
          intended_department_id: departmentId,
        })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to assign department') })
      }
    })()
  },

  setMitigationDeadline: (riskId, deadline) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const optimistic: Risk = {
      ...previous,
      mitigationDeadline: deadline,
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/set-deadline`, {
          mitigation_deadline: deadline ?? null,
        })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to set deadline') })
      }
    })()
  },

  sendToDepartment: (riskId, actingUser) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      mitigationWorkflowStatus: 'sent-to-department' as RiskMitigationWorkflowStatus,
      sentToDepartmentAt: now,
      updatedAt: now,
      history: appendHistory(previous, {
        user: actingUser,
        action: 'note_added',
        notes: 'Risk sent to intended department for mitigation plan',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/send-to-department`)
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to send to department') })
      }
    })()
  },

  submitDepartmentPlan: (riskId, plan, checklist, submittedBy) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const proposedPlan: DepartmentProposedPlan = {
      id: crypto.randomUUID(),
      plan,
      checklist: checklist.map((c) => ({
        id: crypto.randomUUID(),
        text: c.text,
        deadline: c.deadline,
        completed: false,
      })),
      submittedAt: now,
      submittedBy,
    }
    const optimistic: Risk = {
      ...previous,
      departmentProposedPlan: proposedPlan,
      mitigationWorkflowStatus: 'plan-proposed' as RiskMitigationWorkflowStatus,
      updatedAt: now,
      history: appendHistory(previous, {
        user: submittedBy,
        action: 'mitigation_updated',
        notes: 'Department proposed mitigation plan',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/submit-plan`, {
          plan,
          checklist: checklist.map((c, idx) => ({
            text: c.text,
            deadline: c.deadline,
            sort_order: idx,
          })),
        })
        // submit-plan delete-reinserts risk_mitigation_checklist with fresh
        // server ids; refetch so the client's proposed-plan + checklist hold
        // the real ids (otherwise later edits hit a stale id → 0 rows → 500).
        await get().fetchById(riskId)
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to submit department plan') })
      }
    })()
  },

  acceptDepartmentPlan: (riskId, actingUser) => {
    requirePermission('Manage Audit Findings', { storeName: 'risk', actionName: 'acceptDepartmentPlan', id: riskId })
    const previous = get().byId[riskId]
    if (!previous?.departmentProposedPlan) return
    const now = new Date().toISOString()
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: previous.departmentProposedPlan.checklist,
      mitigationPlan: previous.departmentProposedPlan.plan,
      mitigationProgress: computeMitigationProgress(previous.departmentProposedPlan.checklist),
      mitigationWorkflowStatus: 'in-progress' as RiskMitigationWorkflowStatus,
      status: 'mitigating',
      updatedAt: now,
      history: appendHistory(previous, {
        user: actingUser,
        action: 'mitigation_updated',
        notes: 'Officer accepted department-proposed plan',
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/accept-plan`)
        // Re-sync: the optimistic mitigationChecklist holds CLIENT-generated
        // uuids for the proposed items, but the server checklist rows have
        // their own ids. Without this refetch, editing/toggling an accepted
        // item PATCHes a non-existent id → 0 rows → 500. fetchById pulls the
        // real ids in.
        await get().fetchById(riskId)
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to accept plan') })
      }
    })()
  },

  toggleDepartmentPlanItem: (riskId, itemId, actingUser) => {
    const previous = get().byId[riskId]
    if (!previous) return
    const now = new Date().toISOString()
    const checklist: MitigationChecklistItem[] = (previous.mitigationChecklist ?? []).map((i) =>
      i.id === itemId ? { ...i, completed: !i.completed } : i,
    )
    const progress = computeMitigationProgress(checklist)
    const allDone = checklist.length > 0 && checklist.every((i) => i.completed)
    const optimistic: Risk = {
      ...previous,
      mitigationChecklist: checklist,
      mitigationProgress: progress,
      mitigationWorkflowStatus: allDone
        ? 'mitigated'
        : (previous.mitigationWorkflowStatus ?? 'in-progress'),
      status: allDone ? 'resolved' : previous.status,
      updatedAt: now,
      history: appendHistory(previous, {
        user: actingUser,
        action: 'checklist_toggled',
        newValue: checklist.find((i) => i.id === itemId)?.text,
        timestamp: now,
      }),
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    const planId = previous.departmentProposedPlan?.id
    if (!planId) {
      // No proposed plan in flight — fall back to top-level checklist toggle.
      void (async () => {
        try {
          const target = (previous.mitigationChecklist ?? []).find((i) => i.id === itemId)
          if (!target) return
          await api.patch(`/risks/${riskId}/checklist/${itemId}`, {
            completed: !target.completed,
          })
        } catch (e) {
          set((s) => ({
            risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
            byId: { ...s.byId, [riskId]: previous },
            selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
            error: errorMessage(e, 'Failed to toggle plan item'),
          }))
        }
      })()
      return
    }
    void (async () => {
      try {
        await api.patch(`/risks/${riskId}/plan/${planId}/toggle/${itemId}`)
      } catch (e) {
        set((s) => ({
          risks: s.risks.map((r) => (r.id === riskId ? previous : r)),
          byId: { ...s.byId, [riskId]: previous },
          selectedRisk: s.selectedRisk?.id === riskId ? previous : s.selectedRisk,
          error: errorMessage(e, 'Failed to toggle plan item'),
        }))
      }
    })()
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (risk) => set({ selectedRisk: risk }),
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
