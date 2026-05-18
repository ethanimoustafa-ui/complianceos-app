// Policy store — Phase 5 server-state migration.
//
// Reads from /api/policies; mutations call POST/PATCH/DELETE and patch local
// state on success. Legacy method signatures (`fetchAll`, `fetchById`,
// `create`, `update`, `delete`, `submitForReview`, `approve`,
// `initiateReview`, `setPhaseDeadline`, `renameWorkflowStep`,
// `reviewAlerts`, `checkAndUpdateStatuses`) are preserved verbatim — the
// pages currently consume them as **synchronous** calls; we keep that shape
// by doing optimistic local updates and firing the network request in the
// background. Errors surface via the store's `error` field.
//
// SKELETON-LOADING NOTE: pages render a skeleton when
// `isLoading && policies.length === 0` (first fetch). Refetches show stale
// data with a subtle indicator.

import { create } from 'zustand'
import type {
  Policy,
  PolicyFilters,
  PolicyStatus,
  PolicyCategory,
  PolicyApprovalTier,
  PolicyOwner,
  PolicyWorkflowStep,
  PolicyActivityEntry,
  PaginationState,
  RegulatoryBodyId,
  ReviewSchedule,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { computeNextReview, cadenceToReviewCycleDays } from '@/lib/review-schedule'
import { validateChildDeadline } from '@/lib/deadline-validation'
import { requirePermission } from '@/lib/rbac-store-gate'
import { useUserLogStore } from '@/stores/user-log-store'

// ---------- API row shape ----------------------------------------------------

interface PolicyApiRow {
  id: string
  ref_code: string
  name: string
  description?: string
  status: string
  category: string
  version: string
  approval_tier: string
  owner_id: string | null
  owner_name: string | null
  owner_department: string | null
  business_owner_department_id: string | null
  last_review_date: string | null
  next_review_date: string | null
  review_cycle_days?: number
  approved_date?: string | null
  overdue_count: number | null
  last_overdue_date?: string | null
  current_review_cycle_id?: string | null
  current_review_cycle_label?: string | null
  current_review_cycle_date?: string | null
  review_schedule?: unknown
  framework_ids: string[]
  affected_departments: string[]
  created_at: string
  updated_at: string
}

function stubOwner(name: string | null, department: string | null): PolicyOwner {
  return {
    name: name ?? '',
    avatar: name ?? '',
    department: department ?? '',
  }
}

function mapRow(row: PolicyApiRow, previous?: Policy): Policy {
  return {
    id: row.ref_code || row.id,
    name: row.name,
    description: row.description ?? previous?.description ?? '',
    status: row.status as PolicyStatus,
    category: row.category as PolicyCategory,
    version: row.version,
    approvalTier: row.approval_tier as PolicyApprovalTier,
    owner: previous?.owner ?? stubOwner(row.owner_name, row.owner_department),
    businessOwnerDepartmentId:
      row.business_owner_department_id ?? previous?.businessOwnerDepartmentId,
    affectedDepartments: row.affected_departments ?? previous?.affectedDepartments ?? [],
    lastReviewDate: row.last_review_date ?? previous?.lastReviewDate ?? '',
    nextReviewDate: row.next_review_date ?? previous?.nextReviewDate ?? '',
    reviewCycleDays: row.review_cycle_days ?? previous?.reviewCycleDays ?? 365,
    approvedDate: row.approved_date ?? previous?.approvedDate,
    versionHistory: previous?.versionHistory ?? [],
    workflowTimeline: previous?.workflowTimeline ?? [],
    activityLog: previous?.activityLog ?? [],
    attachments: previous?.attachments,
    attachmentUrl: previous?.attachmentUrl,
    evidence: previous?.evidence,
    overdueCount: row.overdue_count ?? previous?.overdueCount ?? 0,
    lastOverdueDate: row.last_overdue_date ?? previous?.lastOverdueDate,
    currentReviewCycleId: row.current_review_cycle_id ?? previous?.currentReviewCycleId,
    currentReviewCycleLabel: row.current_review_cycle_label ?? previous?.currentReviewCycleLabel,
    currentReviewCycleDate: row.current_review_cycle_date ?? previous?.currentReviewCycleDate,
    reviewCycleHistory: previous?.reviewCycleHistory,
    reviewSchedule:
      (row.review_schedule as ReviewSchedule | undefined) ?? previous?.reviewSchedule,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  return {
    ref_code: `POL-PENDING-${Date.now()}`, // overridden by getNextId-style consumers below
    name: data.name,
    description: data.description,
    category: data.category as string,
    version: data.version || 'v1.0',
    approval_tier: data.approvalTier,
    owner_name: data.owner?.name ?? undefined,
    owner_department: data.owner?.department ?? undefined,
    business_owner_department_id: data.businessOwnerDepartmentId ?? undefined,
    last_review_date: data.lastReviewDate || undefined,
    next_review_date: data.nextReviewDate || undefined,
    review_cycle_days: data.reviewCycleDays ?? 365,
    approved_date: data.approvedDate ?? undefined,
    review_schedule: data.reviewSchedule ?? undefined,
    framework_ids: data.frameworkIds ?? [],
    affected_departments: data.affectedDepartments ?? [],
  }
}

function toUpdatePayload(patch: Partial<Policy>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.name !== undefined) out.name = patch.name
  if (patch.description !== undefined) out.description = patch.description
  if (patch.category !== undefined) out.category = patch.category
  if (patch.version !== undefined) out.version = patch.version
  if (patch.approvalTier !== undefined) out.approval_tier = patch.approvalTier
  if (patch.owner !== undefined) {
    out.owner_name = patch.owner?.name ?? null
    out.owner_department = patch.owner?.department ?? null
  }
  if (patch.businessOwnerDepartmentId !== undefined)
    out.business_owner_department_id = patch.businessOwnerDepartmentId
  if (patch.lastReviewDate !== undefined) out.last_review_date = patch.lastReviewDate || null
  if (patch.nextReviewDate !== undefined) out.next_review_date = patch.nextReviewDate || null
  if (patch.reviewCycleDays !== undefined) out.review_cycle_days = patch.reviewCycleDays
  if (patch.approvedDate !== undefined) out.approved_date = patch.approvedDate || null
  if (patch.status !== undefined) out.status = patch.status
  if (patch.reviewSchedule !== undefined) out.review_schedule = patch.reviewSchedule ?? null
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  if (patch.affectedDepartments !== undefined) out.affected_departments = patch.affectedDepartments
  if (patch.currentReviewCycleId !== undefined) out.current_review_cycle_id = patch.currentReviewCycleId
  if (patch.currentReviewCycleLabel !== undefined)
    out.current_review_cycle_label = patch.currentReviewCycleLabel
  if (patch.currentReviewCycleDate !== undefined)
    out.current_review_cycle_date = patch.currentReviewCycleDate
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store -----------------------------------------------------------

interface PolicyStoreState {
  policies: Policy[]
  byId: Record<string, Policy>
  selectedPolicy: Policy | null
  pagination: PaginationState
  filters: PolicyFilters

  // First-fetch skeleton detector: `isLoading && policies.length === 0` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Legacy sync signatures preserved for consumer pages.
  fetchAll: (force?: boolean) => void
  fetchById: (id: string) => Policy | null
  getNextId: () => string

  /** Returns the locally-optimistic policy; background POST reconciles state. */
  create: (data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) => Policy
  update: (id: string, data: Partial<Policy>) => void
  delete: (id: string) => void
  setSelected: (policy: Policy | null) => void
  setFilters: (filters: PolicyFilters) => void
  clearFilters: () => void

  submitForReview: (id: string) => void
  approve: (id: string, notes?: string) => void
  initiateReview: (id: string) => void

  reviewAlerts: () => Policy[]
  checkAndUpdateStatuses: () => void

  setPhaseDeadline: (
    policyId: string,
    stepIndex: number,
    deadline: string | undefined,
    actingUser: string,
  ) => { ok: true } | { ok: false; reason: string }
  renameWorkflowStep: (
    policyId: string,
    stepIndex: number,
    newLabel: string,
    actingUser: string,
  ) => void

  clearError: () => void
}

const INITIAL_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
}

export const usePolicyStore = create<PolicyStoreState>()((set, get) => ({
  policies: [],
  byId: {},
  selectedPolicy: null,
  pagination: INITIAL_PAGINATION,
  filters: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: (force = false) => {
    const state = get()
    // Skip if a fresh fetch completed in the last 30s, unless force=true.
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) {
      return
    }
    set({ isLoading: true, error: null })
    void (async () => {
      try {
        const result = await api.get<{
          items: PolicyApiRow[]
          page: number
          pageSize: number
          total: number
          totalPages: number
        }>('/policies', { page: 1, pageSize: 100 })
        const previousById = get().byId
        const policies = result.items.map((r) => mapRow(r, previousById[r.ref_code || r.id]))
        const byId: Record<string, Policy> = {}
        for (const p of policies) byId[p.id] = p
        set({
          policies,
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
        set({ error: errorMessage(e, 'Failed to fetch policies'), isLoading: false })
      }
    })()
  },

  fetchById: (id) => {
    // Legacy signature: synchronous lookup with background refresh.
    const cached = get().byId[id] ?? get().policies.find((p) => p.id === id) ?? null
    void (async () => {
      try {
        const row = await api.get<PolicyApiRow>(`/policies/${id}`)
        const previous = get().byId[id]
        const policy = mapRow(row, previous)
        set((s) => ({
          byId: { ...s.byId, [id]: policy },
          policies: s.policies.some((p) => p.id === id)
            ? s.policies.map((p) => (p.id === id ? policy : p))
            : [policy, ...s.policies],
          selectedPolicy: s.selectedPolicy?.id === id ? policy : s.selectedPolicy,
        }))
      } catch {
        // 404 / network errors are silent here — the legacy method just returns null/cached.
      }
    })()
    return cached
  },

  getNextId: () => {
    const existing = get().policies
      .map((p) => {
        const match = p.id.match(/^POL-(\d+)$/)
        return match ? parseInt(match[1], 10) : 0
      })
    const maxNum = existing.length > 0 ? Math.max(...existing) : 0
    return `POL-${String(maxNum + 1).padStart(3, '0')}`
  },

  create: (data) => {
    requirePermission('Approve Policy Reviews', { storeName: 'policy', actionName: 'create' })
    const now = new Date().toISOString()
    const id = get().getNextId()
    let nextReviewDate = data.nextReviewDate
    let reviewCycleDays = data.reviewCycleDays
    if (data.reviewSchedule) {
      nextReviewDate = computeNextReview(data.reviewSchedule)
      reviewCycleDays = cadenceToReviewCycleDays(data.reviewSchedule.cadence)
    }
    const optimistic: Policy = {
      ...data,
      id,
      nextReviewDate,
      reviewCycleDays,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({
      policies: [optimistic, ...s.policies],
      byId: { ...s.byId, [id]: optimistic },
      isMutating: true,
      error: null,
    }))

    void (async () => {
      try {
        const payload = { ...toCreatePayload({ ...optimistic }), ref_code: id }
        const row = await api.post<PolicyApiRow>('/policies', payload)
        const created = mapRow(row, optimistic)
        // The server may return a different stable id — surface it on the
        // optimistic row so subsequent calls (PATCH/DELETE) hit the same id.
        set((s) => {
          const { [id]: _drop, ...restById } = s.byId
          return {
            policies: s.policies.map((p) => (p.id === id ? created : p)),
            byId: { ...restById, [created.id]: created },
            isMutating: false,
          }
        })
        // Reconcile with server so any computed fields (workflow steps,
        // activity log, etc.) authored by the route handler land in state.
        void get().fetchAll()
      } catch (e) {
        // Roll back optimistic insert.
        set((s) => {
          const { [id]: _drop, ...rest } = s.byId
          return {
            policies: s.policies.filter((p) => p.id !== id),
            byId: rest,
            error: errorMessage(e, 'Failed to create policy'),
            isMutating: false,
          }
        })
      }
    })()

    return optimistic
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const previous = get().byId[id]
    if (!previous) return
    const optimistic: Policy = { ...previous, ...data, updatedAt: now }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === id ? optimistic : p)),
      byId: { ...s.byId, [id]: optimistic },
      selectedPolicy: s.selectedPolicy?.id === id ? optimistic : s.selectedPolicy,
      isMutating: true,
      error: null,
    }))

    void (async () => {
      try {
        const row = await api.patch<PolicyApiRow>(`/policies/${id}`, toUpdatePayload(data))
        const updated = mapRow(row, optimistic)
        set((s) => ({
          policies: s.policies.map((p) => (p.id === id ? updated : p)),
          byId: { ...s.byId, [id]: updated },
          selectedPolicy: s.selectedPolicy?.id === id ? updated : s.selectedPolicy,
          isMutating: false,
        }))
      } catch (e) {
        // Roll back the optimistic patch to the previous server-known state.
        set((s) => ({
          policies: s.policies.map((p) => (p.id === id ? previous : p)),
          byId: { ...s.byId, [id]: previous },
          selectedPolicy: s.selectedPolicy?.id === id ? previous : s.selectedPolicy,
          error: errorMessage(e, 'Failed to update policy'),
          isMutating: false,
        }))
      }
    })()
  },

  delete: (id) => {
    const previous = get().byId[id]
    if (!previous) return
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return {
        policies: s.policies.filter((p) => p.id !== id),
        byId: rest,
        selectedPolicy: s.selectedPolicy?.id === id ? null : s.selectedPolicy,
        isMutating: true,
        error: null,
      }
    })

    void (async () => {
      try {
        await api.delete(`/policies/${id}`)
        set({ isMutating: false })
      } catch (e) {
        // Roll back.
        set((s) => ({
          policies: [previous, ...s.policies],
          byId: { ...s.byId, [id]: previous },
          error: errorMessage(e, 'Failed to delete policy'),
          isMutating: false,
        }))
      }
    })()
  },

  setSelected: (policy) => set({ selectedPolicy: policy }),
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),

  submitForReview: (id) => {
    requirePermission('Approve Policy Reviews', { storeName: 'policy', actionName: 'submitForReview', id })
    const policy = get().byId[id]
    if (!policy) return
    const newTimeline = policy.workflowTimeline.map((step) =>
      step.status === 'current' ? { ...step, stepState: 'pending-approval' as const } : step,
    )
    get().update(id, {
      status: 'under-review' as PolicyStatus,
      workflowTimeline: newTimeline,
    })
  },

  approve: (id, notes?) => {
    const user = requirePermission('Approve Policy Reviews', { storeName: 'policy', actionName: 'approve', id })
    const policy = get().byId[id]
    if (!policy) return
    useUserLogStore.getState().log({
      userId: user.id,
      action: 'policy.approval_step_committed',
      target: id,
      metadata: notes ? { notes } : undefined,
    })
    const today = new Date().toISOString().split('T')[0]
    const currentIdx = policy.workflowTimeline.findIndex((s) => s.status === 'current')
    const updatedTimeline = policy.workflowTimeline.map((step, idx) =>
      step.status !== 'completed'
        ? {
            ...step,
            status: 'completed' as const,
            date: step.date || today,
            stepState: undefined,
            ...(idx === currentIdx && notes ? { note: notes } : {}),
          }
        : step,
    )
    const activityEntry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'workflow_approved',
      textEn: notes ? `Policy approved — ${notes}` : 'Policy approved',
      textAr: notes ? `تمت الموافقة على السياسة — ${notes}` : 'تمت الموافقة على السياسة',
      user: user.name,
    }
    get().update(id, {
      status: 'approved' as PolicyStatus,
      approvedDate: today,
      workflowTimeline: updatedTimeline,
      activityLog: [...(policy.activityLog ?? []), activityEntry],
    })
  },

  initiateReview: (id) => {
    requirePermission('Approve Policy Reviews', { storeName: 'policy', actionName: 'initiateReview', id })
    const policy = get().byId[id]
    if (!policy) return
    const today = new Date().toISOString().split('T')[0]
    const cycleId = Date.now().toString()
    const cycleLabel = `Review ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    const oldEntry = policy.currentReviewCycleId
      ? [{ id: policy.currentReviewCycleId, label: policy.currentReviewCycleLabel ?? 'Review', initiatedAt: today }]
      : []
    const resetTimeline = policy.workflowTimeline.map((step) =>
      step.status === 'current' ? { ...step, status: 'completed' as const, date: today } : step,
    )
    const newStep: PolicyWorkflowStep = {
      step: 'Review Initiated',
      date: today,
      user: policy.owner.name,
      status: 'current',
    }
    const nextReviewDate = policy.reviewSchedule
      ? computeNextReview(policy.reviewSchedule, new Date())
      : policy.nextReviewDate
    get().update(id, {
      status: 'draft' as PolicyStatus,
      workflowTimeline: [...resetTimeline, newStep],
      currentReviewCycleId: cycleId,
      currentReviewCycleLabel: cycleLabel,
      currentReviewCycleDate: new Date().toISOString(),
      reviewCycleHistory: [...(policy.reviewCycleHistory ?? []), ...oldEntry],
      nextReviewDate,
    })
  },

  reviewAlerts: (): Policy[] => {
    const now = new Date()
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    return get().policies.filter((p) => {
      if (p.status === 'expired') return true
      if (p.nextReviewDate) {
        const reviewDate = new Date(p.nextReviewDate)
        return reviewDate <= ninetyDays
      }
      return false
    })
  },

  setPhaseDeadline: (policyId, stepIndex, deadline, actingUser) => {
    const policy = get().byId[policyId]
    if (!policy) return { ok: false, reason: 'policy-not-found' }
    if (stepIndex < 0 || stepIndex >= policy.workflowTimeline.length) {
      return { ok: false, reason: 'step-not-found' }
    }
    const validation = validateChildDeadline(deadline ?? null, policy.nextReviewDate)
    if (!validation.ok) {
      return { ok: false, reason: validation.reason }
    }
    const previous = policy.workflowTimeline[stepIndex].deadline
    const newTimeline = policy.workflowTimeline.map((step, i) =>
      i === stepIndex ? { ...step, deadline: deadline || undefined } : step,
    )
    const today = new Date().toISOString().split('T')[0]
    const stepLabel = policy.workflowTimeline[stepIndex].step
    const action = previous
      ? deadline ? 'phase_deadline_changed' : 'phase_deadline_set'
      : 'phase_deadline_set'
    const entry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: action,
      textEn: deadline
        ? (previous
            ? `Deadline for "${stepLabel}" changed from ${previous} to ${deadline}`
            : `Deadline for "${stepLabel}" set to ${deadline}`)
        : `Deadline cleared on "${stepLabel}"`,
      textAr: deadline
        ? (previous
            ? `تم تغيير الموعد النهائي لـ "${stepLabel}" من ${previous} إلى ${deadline}`
            : `تم تعيين الموعد النهائي لـ "${stepLabel}" إلى ${deadline}`)
        : `تم مسح الموعد النهائي لـ "${stepLabel}"`,
      user: actingUser,
    }
    get().update(policyId, {
      workflowTimeline: newTimeline,
      activityLog: [...(policy.activityLog ?? []), entry],
    })
    return { ok: true }
  },

  renameWorkflowStep: (policyId, stepIndex, newLabel, actingUser) => {
    const policy = get().byId[policyId]
    if (!policy) return
    if (stepIndex < 0 || stepIndex >= policy.workflowTimeline.length) return
    const step = policy.workflowTimeline[stepIndex]
    if (step.status === 'completed') return
    const trimmed = newLabel.trim()
    if (!trimmed || trimmed === step.step) return
    const previous = step.step
    const newTimeline = policy.workflowTimeline.map((s, i) =>
      i === stepIndex ? { ...s, step: trimmed } : s,
    )
    const today = new Date().toISOString().split('T')[0]
    const entry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'step_renamed',
      textEn: `Workflow step renamed from "${previous}" to "${trimmed}"`,
      textAr: `تمت إعادة تسمية الخطوة من "${previous}" إلى "${trimmed}"`,
      user: actingUser,
    }
    get().update(policyId, {
      workflowTimeline: newTimeline,
      activityLog: [...(policy.activityLog ?? []), entry],
    })
  },

  checkAndUpdateStatuses: () => {
    const today = new Date().toISOString().split('T')[0]
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
    set((state) => {
      const policies = state.policies.map((p) => {
        if (p.status === 'draft' || p.status === 'expired') return p
        let updated = { ...p }
        if (
          p.nextReviewDate &&
          p.nextReviewDate < today &&
          p.status !== 'overdue' &&
          p.lastOverdueDate !== p.nextReviewDate
        ) {
          updated = {
            ...updated,
            status: 'overdue' as PolicyStatus,
            overdueCount: (p.overdueCount ?? 0) + 1,
            lastOverdueDate: p.nextReviewDate,
          }
        } else if (
          p.nextReviewDate &&
          p.nextReviewDate <= ninetyDaysFromNow &&
          p.status === 'approved'
        ) {
          updated = { ...updated, status: 'requires-review' as PolicyStatus }
        }
        return updated
      })
      const byId: Record<string, Policy> = {}
      for (const p of policies) byId[p.id] = p
      return { policies, byId }
    })
  },

  clearError: () => set({ error: null }),
}))
