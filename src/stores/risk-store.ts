// Risk store — Phase 5 server-state migration.
//
// Core CRUD (`fetchAll`, `fetchById`, `create`, `update`, `delete`) goes through
// /api/risks. The mitigation-workflow sub-actions
// (`assignDepartment`, `setMitigationDeadline`, `sendToDepartment`,
// `submitDepartmentPlan`, `acceptDepartmentPlan`, `toggleDepartmentPlanItem`)
// hit the dedicated route family at /api/risks/[id]/*. Checklist mutations
// (`addMitigationItem` / `editMitigationItem` / `toggleMitigationItem` /
// `removeMitigationItem`) and `markReviewed` patch local state only — no
// individual endpoints exist for those yet (Phase 6 will wire them once the
// risk-checklist routes ship).
//
// Legacy method names are preserved so the risks reports page keeps compiling.
//
// SKELETON-LOADING NOTE: consumer pages render a skeleton when
// `isLoading && risks.length === 0` (first-fetch). On refetch, stale data
// stays visible while `isLoading` flips back to true with a subtle indicator.

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

// ---------- API row shape ----------------------------------------------------

interface RiskApiRow {
  id: string
  title: string
  description?: string
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

function mapRow(row: RiskApiRow, previous?: Risk): Risk {
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
    mitigationChecklist: previous?.mitigationChecklist,
    mitigationProgress: row.mitigation_progress ?? previous?.mitigationProgress ?? 0,
    monitoringFrequency: row.monitoring_frequency as MonitoringFrequency,
    lastReviewDate: row.last_review_date ?? previous?.lastReviewDate,
    nextReviewDate: row.next_review_date ?? previous?.nextReviewDate,
    reviewSchedule: (row.review_schedule as ReviewSchedule | undefined) ?? previous?.reviewSchedule,
    history: previous?.history ?? [],
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    intendedDepartmentId: row.intended_department_id ?? previous?.intendedDepartmentId,
    mitigationDeadline: row.mitigation_deadline ?? previous?.mitigationDeadline,
    mitigationWorkflowStatus:
      (row.mitigation_workflow_status as RiskMitigationWorkflowStatus | undefined) ??
      previous?.mitigationWorkflowStatus,
    departmentProposedPlan: previous?.departmentProposedPlan,
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

// ---------- store -----------------------------------------------------------

interface RiskState {
  risks: Risk[]
  byId: Record<string, Risk>
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
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Risk | null>
  create: (data: Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>) => Promise<Risk>
  update: (id: string, data: Partial<Risk>) => Promise<Risk>
  delete: (id: string) => Promise<void>

  // Status / review (legacy sync facade backed by an async PATCH)
  updateStatus: (id: string, newStatus: Risk['status']) => void
  markReviewed: (riskId: string) => void

  // Mitigation checklist — local-only (no per-item endpoint yet; see TODO).
  addMitigationItem: (riskId: string, text: string) => void
  editMitigationItem: (riskId: string, itemId: string, newText: string) => void
  toggleMitigationItem: (riskId: string, itemId: string) => void
  removeMitigationItem: (riskId: string, itemId: string) => void

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
  selectedRisk: null,
  filters: {},
  pagination: INITIAL_PAGINATION,
  sort: INITIAL_SORT,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
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
      const row = await api.get<RiskApiRow>(`/risks/${id}`)
      const previous = get().byId[id]
      const risk = mapRow(row, previous)
      set((s) => ({
        byId: { ...s.byId, [id]: risk },
        risks: s.risks.some((r) => r.id === id) ? s.risks.map((r) => (r.id === id ? risk : r)) : s.risks,
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
    // OPTIMISTIC: remove immediately. Restore on failure.
    const snapshot = get().byId[id]
    const prevIndex = get().risks.findIndex((r) => r.id === id)
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return {
        risks: s.risks.filter((r) => r.id !== id),
        byId: rest,
        selectedRisk: s.selectedRisk?.id === id ? null : s.selectedRisk,
        isMutating: true,
        error: null,
      }
    })
    try {
      await api.delete(`/risks/${id}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        set((s) => {
          const list = [...s.risks]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, snapshot)
          return {
            risks: list,
            byId: { ...s.byId, [id]: snapshot },
            error: errorMessage(e, 'Failed to delete risk'),
            isMutating: false,
          }
        })
      } else {
        set({ error: errorMessage(e, 'Failed to delete risk'), isMutating: false })
      }
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
      history: [
        ...previous.history,
        {
          id: crypto.randomUUID(),
          timestamp: now,
          user: previous.owner.name,
          action: 'status_changed',
          previousValue: previous.status,
          newValue: newStatus,
        },
      ],
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

  // ---- mitigation checklist (local-only) ---------------------------------
  // No per-item endpoints exist yet for the top-level risk checklist; these
  // mirror the legacy seeded behaviour. TODO(Phase 6): wire `/api/risks/[id]/checklist`
  // (mirror of the observation checklist family).

  addMitigationItem: (riskId, text) => {
    set((state) => {
      const r = state.byId[riskId]
      if (!r) return state
      const now = new Date().toISOString()
      const newItem = { id: crypto.randomUUID(), text, completed: false }
      const checklist = [...(r.mitigationChecklist || []), newItem]
      const updated: Risk = {
        ...r,
        mitigationChecklist: checklist,
        mitigationProgress: computeMitigationProgress(checklist),
        updatedAt: now,
        history: [...r.history, {
          id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
          action: 'checklist_added', newValue: text,
        }],
      }
      return {
        risks: state.risks.map((x) => (x.id === riskId ? updated : x)),
        byId: { ...state.byId, [riskId]: updated },
        selectedRisk: state.selectedRisk?.id === riskId ? updated : state.selectedRisk,
      }
    })
  },

  editMitigationItem: (riskId, itemId, newText) => {
    set((state) => {
      const r = state.byId[riskId]
      if (!r) return state
      const now = new Date().toISOString()
      const checklist = (r.mitigationChecklist || []).map((i) =>
        i.id === itemId ? { ...i, text: newText } : i,
      )
      const updated: Risk = {
        ...r,
        mitigationChecklist: checklist,
        updatedAt: now,
        history: [...r.history, {
          id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
          action: 'checklist_edited', newValue: newText,
        }],
      }
      return {
        risks: state.risks.map((x) => (x.id === riskId ? updated : x)),
        byId: { ...state.byId, [riskId]: updated },
        selectedRisk: state.selectedRisk?.id === riskId ? updated : state.selectedRisk,
      }
    })
  },

  toggleMitigationItem: (riskId, itemId) => {
    set((state) => {
      const r = state.byId[riskId]
      if (!r) return state
      const now = new Date().toISOString()
      const checklist = (r.mitigationChecklist || []).map((i) =>
        i.id === itemId ? { ...i, completed: !i.completed } : i,
      )
      const updated: Risk = {
        ...r,
        mitigationChecklist: checklist,
        mitigationProgress: computeMitigationProgress(checklist),
        updatedAt: now,
        history: [...r.history, {
          id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
          action: 'checklist_toggled',
          newValue: checklist.find((i) => i.id === itemId)?.text,
        }],
      }
      return {
        risks: state.risks.map((x) => (x.id === riskId ? updated : x)),
        byId: { ...state.byId, [riskId]: updated },
        selectedRisk: state.selectedRisk?.id === riskId ? updated : state.selectedRisk,
      }
    })
  },

  removeMitigationItem: (riskId, itemId) => {
    set((state) => {
      const r = state.byId[riskId]
      if (!r) return state
      const now = new Date().toISOString()
      const removed = (r.mitigationChecklist || []).find((i) => i.id === itemId)
      const checklist = (r.mitigationChecklist || []).filter((i) => i.id !== itemId)
      const updated: Risk = {
        ...r,
        mitigationChecklist: checklist,
        mitigationProgress: computeMitigationProgress(checklist),
        updatedAt: now,
        history: [...r.history, {
          id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
          action: 'checklist_removed', newValue: removed?.text,
        }],
      }
      return {
        risks: state.risks.map((x) => (x.id === riskId ? updated : x)),
        byId: { ...state.byId, [riskId]: updated },
        selectedRisk: state.selectedRisk?.id === riskId ? updated : state.selectedRisk,
      }
    })
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
      history: [...previous.history, {
        id: crypto.randomUUID(), timestamp: now, user: previous.owner.name,
        action: 'reviewed', notes: 'Risk marked as reviewed',
      }],
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
      history: [...previous.history, {
        id: crypto.randomUUID(), timestamp: now, user: actingUser,
        action: 'note_added',
        notes: 'Risk sent to intended department for mitigation plan',
      }],
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
      history: [...previous.history, {
        id: crypto.randomUUID(), timestamp: now, user: submittedBy,
        action: 'mitigation_updated',
        notes: 'Department proposed mitigation plan',
      }],
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
            sort_order: idx,
          })),
        })
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
      history: [...previous.history, {
        id: crypto.randomUUID(), timestamp: now, user: actingUser,
        action: 'mitigation_updated',
        notes: 'Officer accepted department-proposed plan',
      }],
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    void (async () => {
      try {
        await api.post(`/risks/${riskId}/accept-plan`)
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
      history: [...previous.history, {
        id: crypto.randomUUID(), timestamp: now, user: actingUser,
        action: 'checklist_toggled',
        newValue: checklist.find((i) => i.id === itemId)?.text,
      }],
    }
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? optimistic : r)),
      byId: { ...s.byId, [riskId]: optimistic },
      selectedRisk: s.selectedRisk?.id === riskId ? optimistic : s.selectedRisk,
    }))
    // Note: the proposed-plan toggle endpoint takes a `planId`; without it
    // we fall back to a local-only update — Phase 6 should pass the planId
    // through and call POST /api/risks/[id]/plan/[planId]/toggle/[itemId].
    // TODO(Phase 6): plumb planId from previous.departmentProposedPlan.id.
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
