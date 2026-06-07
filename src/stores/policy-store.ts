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
  PolicyVersionEntry,
  PolicyAttachment,
  PolicyEvidence,
  PaginationState,
  RegulatoryBodyId,
  ReviewSchedule,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { computeNextReview, cadenceToReviewCycleDays } from '@/lib/review-schedule'
import { validateChildDeadline } from '@/lib/deadline-validation'
import { requirePermission } from '@/lib/rbac-store-gate'
import { useUserLogStore } from '@/stores/user-log-store'
import { pushToast, type ToastMessage } from '@/stores/toast-store'

// W18 / W17-1 / SEC-1: build an `If-Match: W/"<updatedAt>"` header object when
// the entity carries an `updatedAt` token. Returned `undefined` keeps the
// request backward-compatible with rows hydrated before the column existed.
function ifMatchHeader(
  updatedAt: string | undefined,
): Record<string, string> | undefined {
  if (!updatedAt) return undefined
  return { 'If-Match': `W/"${updatedAt}"` }
}

// W18 / GAP-20: a child mutation must never PATCH a non-persisted id. A
// persisted row always has a real Postgres UUID; an optimistic/temp row has a
// `temp-…` id OR a short client random id.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isPersistedId(id: string): boolean {
  return UUID_RE.test(id)
}
void isPersistedId

// GAP-14 / RTL-8 / W18: keyed toast for a reverted optimistic mutation. 412 →
// dedicated conflict toast (someone else changed the row); other errors → the
// generic revert key.
function revertMessage(e: unknown): ToastMessage {
  if (e instanceof ApiClientError) {
    if (e.status === 412 || e.code === 'precondition_failed') {
      return { key: 'regulatoryUpdates.optimisticConflict' }
    }
    const showable =
      e.code === 'validation_error' ||
      e.code === 'validation_failed' ||
      e.code === 'bad_request' ||
      e.code === 'conflict'
    if (showable && e.message && e.message.length < 120) {
      return {
        key: 'regulatoryUpdates.optimisticRevertWithReason',
        params: { reason: e.message },
      }
    }
  }
  return { key: 'regulatoryUpdates.optimisticRevert' }
}

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
  // Wave-19 / Q3 — persisted `policies.is_expired` from migration 055.
  is_expired?: boolean
  // P6 (W29): archived_at from migration 081. Set when Archive button is clicked.
  archived_at?: string | null
  created_at: string
  updated_at: string
  // Detail-GET-only nested children. Wave-19.3 / P18-BUG-1 — `mapRow` now
  // hydrates these onto the Policy entity so the Activity / Version /
  // Workflow tabs render server-side rows instead of falling through to the
  // empty branch.
  versions?: unknown[]
  versions_has_more?: boolean
  workflow_steps?: unknown[]
  attachments?: unknown[]
  evidence?: unknown[]
  activity_log?: unknown[]
  activity_log_has_more?: boolean
}

// Wave-19.3 / P18-BUG-1 — API-row shape for `policy_activity_log` rows fed by
// `/api/policies/[id]` (nested) and `/api/policies/[id]/activity` (paginated).
interface PolicyActivityApiRow {
  id: string
  timestamp: string
  date: string
  type: string
  text_en: string
  text_ar: string
  user_name: string | null
  note: string | null
}

// Wave-19.4 / Item-3 — dual-store columns `text_en` + `text_ar` (migration 057).
interface PolicyVersionApiRow {
  id: string
  version: string
  date: string
  author: string | null
  text_en: string
  text_ar: string
  // GAP-19 / W18 — structured per-field diff (migration 054); null on older rows.
  field_changes?: { field: string; from: string; to: string }[] | null
}

interface PolicyWorkflowStepApiRow {
  id: string
  step: string
  date: string | null
  user_name: string | null
  status: string
  description: string | null
  action_type: string | null
  note: string | null
  step_state: string | null
  sort_order: number
  deadline: string | null
  updated_at?: string
}

interface PolicyAttachmentApiRow {
  id: string
  name: string
  storage_path: string
  size: number | null
  uploaded_at: string
  uploaded_by: string | null
  // P2 (W29): joined profiles row so we can render display name instead of raw UUID.
  uploaded_by_profile?: { name: string | null; email: string | null } | null
}

interface PolicyEvidenceApiRow {
  id: string
  name: string
  storage_path: string
  uploaded_at: string
  uploaded_by: string | null
  // P2 (W29): joined profiles row so we can render display name instead of raw UUID.
  uploaded_by_profile?: { name: string | null; email: string | null } | null
  review_cycle_id: string
  review_cycle_label: string
  notes: string | null
}

function mapPolicyActivityRow(row: PolicyActivityApiRow): PolicyActivityEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    date: row.date,
    type: row.type as PolicyActivityEntry['type'],
    // Wave-19.3 — `policy_activity_log` is dual-store; the renderer reads
    // `textEn` / `textAr` directly based on locale.
    textEn: row.text_en ?? '',
    textAr: row.text_ar ?? '',
    user: row.user_name ?? undefined,
    note: row.note ?? undefined,
  }
}

function mapPolicyVersionRow(row: PolicyVersionApiRow): PolicyVersionEntry {
  return {
    version: row.version,
    date: row.date,
    author: row.author ?? '',
    // Wave-19.4 / Item-3 — dual-store. Reader picks per-locale at render time.
    textEn: row.text_en ?? '',
    textAr: row.text_ar ?? '',
    // W32-4 — carry the structured diff so the Version-History expanded panel
    // can render Field / From / To (was dropped → panel showed only metadata).
    fieldChanges: Array.isArray(row.field_changes)
      ? row.field_changes.map((c) => ({ field: c.field, from: c.from ?? '', to: c.to ?? '' }))
      : [],
  }
}

function mapPolicyWorkflowStepRow(row: PolicyWorkflowStepApiRow): PolicyWorkflowStep {
  return {
    // P1-fix: carry the server-issued UUID so setPhaseDeadline can call
    // POST /workflow/set-phase-deadline with the correct step_id.
    id: row.id,
    step: row.step,
    date: row.date ?? '',
    user: row.user_name ?? '',
    status: row.status as PolicyWorkflowStep['status'],
    description: row.description ?? undefined,
    actionType: row.action_type ?? undefined,
    note: row.note ?? undefined,
    stepState: (row.step_state as PolicyWorkflowStep['stepState']) ?? undefined,
    deadline: row.deadline ?? undefined,
  }
}

// P2 (W29): resolve uploaded_by UUID to a display name via the joined profile.
// Preference: profile.name > profile.email > raw UUID (last resort, not shown to user).
function resolveUploaderName(row: {
  uploaded_by?: string | null
  uploaded_by_profile?: { name: string | null; email: string | null } | null
}): string {
  if (row.uploaded_by_profile?.name) return row.uploaded_by_profile.name
  if (row.uploaded_by_profile?.email) return row.uploaded_by_profile.email
  // Fallback for legacy rows before the JOIN was added — uploaded_by may be a
  // display name (old path) or a UUID (new path). Return empty string rather
  // than surfacing a UUID to the user.
  const v = row.uploaded_by ?? ''
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return UUID_RE.test(v) ? '' : v
}

function mapPolicyAttachmentRow(row: PolicyAttachmentApiRow): PolicyAttachment {
  return {
    id: row.id,
    name: row.name,
    dataUrl: row.storage_path,
    size: row.size ?? 0,
    uploadedAt: row.uploaded_at,
    uploadedBy: resolveUploaderName(row),
  }
}

function mapPolicyEvidenceRow(row: PolicyEvidenceApiRow): PolicyEvidence {
  return {
    id: row.id,
    name: row.name,
    dataUrl: row.storage_path,
    uploadedAt: row.uploaded_at,
    uploadedBy: resolveUploaderName(row),
    reviewCycleId: row.review_cycle_id,
    reviewCycleLabel: row.review_cycle_label,
    notes: row.notes ?? undefined,
  }
}

function stubOwner(name: string | null, department: string | null): PolicyOwner {
  return {
    name: name ?? '',
    avatar: name ?? '',
    department: department ?? '',
  }
}

function mapRow(row: PolicyApiRow, previous?: Policy): Policy {
  // Wave-19.3 / P18-BUG-1 — the detail GET (`/api/policies/[id]`) returns
  // first-page nested children (`activity_log`, `versions`, `workflow_steps`,
  // `attachments`, `evidence`); the list GET (`/api/policies`) omits them.
  // Hydrate whenever an array IS present on the row, else keep `previous`'s
  // value so list-refresh after a detail-fetch doesn't blow away the modal's
  // populated tabs. Empty arrays from the detail GET are honored — they mean
  // "the server says there are none yet".
  const activity = Array.isArray(row.activity_log)
    ? (row.activity_log as PolicyActivityApiRow[]).map(mapPolicyActivityRow)
    : previous?.activityLog ?? []
  const versions = Array.isArray(row.versions)
    ? (row.versions as PolicyVersionApiRow[]).map(mapPolicyVersionRow)
    : previous?.versionHistory ?? []
  const steps = Array.isArray(row.workflow_steps)
    ? (row.workflow_steps as PolicyWorkflowStepApiRow[]).map(mapPolicyWorkflowStepRow)
    : previous?.workflowTimeline ?? []
  const attachments = Array.isArray(row.attachments)
    ? (row.attachments as PolicyAttachmentApiRow[]).map(mapPolicyAttachmentRow)
    : previous?.attachments
  const evidence = Array.isArray(row.evidence)
    ? (row.evidence as PolicyEvidenceApiRow[]).map(mapPolicyEvidenceRow)
    : previous?.evidence
  return {
    id: row.ref_code || row.id,
    uuid: row.id,
    name: row.name,
    description: row.description ?? previous?.description ?? '',
    status: row.status as PolicyStatus,
    category: row.category as PolicyCategory,
    version: row.version,
    approvalTier: row.approval_tier as PolicyApprovalTier,
    // Wave-19.3 / Task-B — keep owner in sync with the canonical
    // `owner_name` / `owner_department` columns. The previous behaviour
    // (`previous?.owner ?? stubOwner(...)`) ignored fresh server-side
    // changes to the Policy Leader, defeating the round-trip after a
    // leader-change PATCH. The avatar is derived from `owner_name`.
    owner: stubOwner(row.owner_name, row.owner_department),
    ownerId: row.owner_id ?? previous?.ownerId ?? undefined,
    businessOwnerDepartmentId:
      row.business_owner_department_id ?? previous?.businessOwnerDepartmentId,
    affectedDepartments: row.affected_departments ?? previous?.affectedDepartments ?? [],
    lastReviewDate: row.last_review_date ?? previous?.lastReviewDate ?? '',
    nextReviewDate: row.next_review_date ?? previous?.nextReviewDate ?? '',
    reviewCycleDays: row.review_cycle_days ?? previous?.reviewCycleDays ?? 365,
    approvedDate: row.approved_date ?? previous?.approvedDate,
    versionHistory: versions,
    workflowTimeline: steps,
    activityLog: activity,
    attachments,
    attachmentUrl: previous?.attachmentUrl,
    evidence,
    overdueCount: row.overdue_count ?? previous?.overdueCount ?? 0,
    lastOverdueDate: row.last_overdue_date ?? previous?.lastOverdueDate,
    currentReviewCycleId: row.current_review_cycle_id ?? previous?.currentReviewCycleId,
    currentReviewCycleLabel: row.current_review_cycle_label ?? previous?.currentReviewCycleLabel,
    currentReviewCycleDate: row.current_review_cycle_date ?? previous?.currentReviewCycleDate,
    reviewCycleHistory: previous?.reviewCycleHistory,
    reviewSchedule:
      (row.review_schedule as ReviewSchedule | undefined) ?? previous?.reviewSchedule,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    // Wave-19 / Q3 — persisted `policies.is_expired` from migration 055.
    isExpired: row.is_expired ?? previous?.isExpired,
    // P6 (W29): archived_at from migration 081.
    archivedAt: row.archived_at !== undefined ? row.archived_at : previous?.archivedAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  // Wave-19 / Q1: `ref_code` is server-generated (`{SLUG}-{YYYY}-{NNNN}`) — the
  // client must NOT send it. CreatePolicySchema is `.strict()` and would 400
  // on any extra key. See `src/lib/api/services/refcode.ts`.
  return {
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
  // Wave-19.3 / Task-B — `ownerId` carries the canonical `policies.owner_id`
  // (FK to profiles). The Leader-picker writes both `owner` (name/dept) and
  // `ownerId` so the server-side diff in `/api/policies/[id]` PATCH fires.
  if (patch.ownerId !== undefined) out.owner_id = patch.ownerId ?? null
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
  // P6 (W29): archive/unarchive.
  if (patch.archivedAt !== undefined) out.archived_at = patch.archivedAt ?? null
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

  /** Returns a Promise that resolves with the server-confirmed policy row.
   *  The list insert is gated on the server response so the returned `id`
   *  is always the canonical server-issued ref_code (D1 timing pattern). */
  create: (data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Policy>
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

  // Wave-19.3 / P18-BUG-1 — load more `policy_activity_log` rows (10/page,
  // newest-first). Mirrors `loadMoreTimeline` in circular-store.
  loadMorePolicyActivity: (policyId: string) => Promise<void>
  policyActivityPagination: Record<
    string,
    { offset: number; hasMore: boolean; loadingMore: boolean }
  >
  // P6 (W34): per-policy detail-GET in-flight flag, keyed by the display id.
  // Drives the description / policy-document skeletons in PolicyDetailsContent.
  detailLoading: Record<string, boolean>

  // Wave-19.3 / Task-B — Policy Leader change. Optimistically updates
  // owner/ownerId, PATCHes with If-Match; the server emits the activity-log
  // row (`leader_changed` / `leader_assigned`) so the Activity tab re-renders
  // it from the dual-store columns on the next detail-GET.
  updateLeader: (
    policyId: string,
    ownerId: string | null,
    ownerName: string | null,
    ownerDepartment?: string | null,
  ) => void

  // A6 fix — upload a document attachment via POST /api/policies/{id}/attachments.
  // Optimistic local insert; rolls back + surfaces a toast on failure.
  addAttachment: (
    policyId: string,
    file: { name: string; dataUrl: string; size: number; uploadedBy: string },
  ) => Promise<void>

  // A6 companion — remove an attachment from local state immediately; no
  // dedicated DELETE route needed (matching circular pattern).
  removeAttachment: (policyId: string, attachmentId: string) => void

  // P2 fix — POST /api/policies/{id}/evidence to persist evidence.
  // Optimistic local insert; rolls back + surfaces a toast on failure.
  addEvidence: (
    policyId: string,
    file: {
      name: string
      dataUrl: string
      uploadedBy: string
      reviewCycleId: string
      reviewCycleLabel: string
    },
  ) => Promise<void>

  // A7 fix — POST /api/policies/{id}/workflow/steps to persist the new step.
  // Optimistic local insert; rolls back on failure.
  addWorkflowStep: (
    policyId: string,
    step: {
      step: string
      description?: string
      actionType?: string
      deadline?: string
    },
  ) => void

  // P1 (W29): POST /api/policies/{id}/workflow/advance to persist step completion.
  // Mirrors advanceStep in circular-store. Optimistic local update; server confirms
  // the step status + policy status transition and emits an activity-log row.
  advanceWorkflowStep: (
    policyId: string,
    opts: {
      action: 'submit-for-review' | 'approve' | 'undo' | 'initiate-review'
      stepId?: string
      note?: string
      userName?: string
    },
  ) => Promise<void>

  // P6 (W29): archive / unarchive a policy.
  // PATCHes archived_at; optimistic archivedAt update in store.
  archivePolicy: (policyId: string, actorName: string) => Promise<void>
  unarchivePolicy: (policyId: string, actorName: string) => Promise<void>

  // Archive filter state (P6).
  archiveFilter: 'active' | 'archived' | 'all'
  setArchiveFilter: (f: 'active' | 'archived' | 'all') => void

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
  policyActivityPagination: {},
  detailLoading: {},
  pagination: INITIAL_PAGINATION,
  filters: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,
  // P6 (W29): archive filter — default 'active' (hide archived rows).
  archiveFilter: 'active' as const,

  fetchAll: (force = false) => {
    const state = get()
    // Skip if a fresh fetch completed in the last 30s, unless force=true.
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) {
      return
    }
    set({ isLoading: true, error: null })
    void (async () => {
      try {
        const archiveFilter = get().archiveFilter
        const result = await api.get<{
          items: PolicyApiRow[]
          page: number
          pageSize: number
          total: number
          totalPages: number
        }>('/policies', { page: 1, pageSize: 100, archive_filter: archiveFilter })
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
    // Wave-19.3 / P18-BUG-1 — the entity `id` is the display `ref_code`, but
    // the REST route requires the canonical UUID. Resolve to the stored `uuid`
    // before hitting the network; fall through to the bare `id` so a UUID
    // passed directly (deep-link case) still works.
    const cached = get().byId[id] ?? get().policies.find((p) => p.id === id) ?? null
    const apiId = cached?.uuid ?? id
    // P6 (W34): mark this policy's detail GET as in-flight so the description /
    // policy-document skeletons render until the detail-only columns hydrate.
    set((s) => ({ detailLoading: { ...s.detailLoading, [id]: true } }))
    void (async () => {
      try {
        const row = await api.get<PolicyApiRow>(`/policies/${apiId}`)
        const previous = get().byId[id]
        const policy = mapRow(row, previous)
        set((s) => ({
          byId: { ...s.byId, [id]: policy },
          policies: s.policies.some((p) => p.id === id)
            ? s.policies.map((p) => (p.id === id ? policy : p))
            : [policy, ...s.policies],
          selectedPolicy: s.selectedPolicy?.id === id ? policy : s.selectedPolicy,
          detailLoading: { ...s.detailLoading, [id]: false },
          // P9 (W34): seed activity pagination from the detail GET's first page
          // length + server has-more flag (mirrors circular-store.fetchById).
          // Without this the "Load more" button never appears for policies with
          // >10 activity-log entries.
          policyActivityPagination: {
            ...s.policyActivityPagination,
            [id]: {
              offset: policy.activityLog?.length ?? 0,
              hasMore: !!row.activity_log_has_more,
              loadingMore: false,
            },
          },
        }))
      } catch {
        // 404 / network errors are silent here — clear the loading flag so the
        // skeleton does not stick.
        set((s) => ({ detailLoading: { ...s.detailLoading, [id]: false } }))
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

  create: async (data) => {
    // P3-D1: async create — the list insert is gated on the server response
    // so the returned id is always the canonical server-issued ref_code.
    // RegisterPolicyModal awaits this before using newPolicy.id.
    requirePermission('Approve Policy Reviews', { storeName: 'policy', actionName: 'create' })
    const now = new Date().toISOString()
    let nextReviewDate = data.nextReviewDate
    let reviewCycleDays = data.reviewCycleDays
    if (data.reviewSchedule) {
      nextReviewDate = computeNextReview(data.reviewSchedule)
      reviewCycleDays = cadenceToReviewCycleDays(data.reviewSchedule.cadence)
    }
    set({ isMutating: true, error: null })
    try {
      // Wave-19 / Q1: do NOT inject `ref_code` — server generates it.
      const payload = toCreatePayload({ ...data, nextReviewDate, reviewCycleDays })
      const row = await api.post<PolicyApiRow>('/policies', payload)
      const created = mapRow(row)
      set((s) => ({
        policies: [created, ...s.policies],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      // Reconcile with server so any computed fields (workflow steps,
      // activity log, etc.) authored by the route handler land in state.
      void get().fetchAll(true)
      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create policy'), isMutating: false })
      pushToast(revertMessage(e), 'error')
      throw e
    }
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
        // W18 / SEC-1: thread the row's last-known `updatedAt` via `If-Match`
        // so the server can refuse a stale write with 412.
        // Wave-19.3 / P18-BUG-1 — route requires the canonical UUID; entity
        // `id` is the `ref_code` for display.
        const apiId = previous.uuid ?? id
        const row = await api.patch<PolicyApiRow>(
          `/policies/${apiId}`,
          toUpdatePayload(data),
          ifMatchHeader(previous.updatedAt),
        )
        const updated = mapRow(row, optimistic)
        set((s) => ({
          policies: s.policies.map((p) => (p.id === id ? updated : p)),
          byId: { ...s.byId, [id]: updated },
          selectedPolicy: s.selectedPolicy?.id === id ? updated : s.selectedPolicy,
          isMutating: false,
        }))
      } catch (e) {
        // Roll back the optimistic patch + surface a keyed toast (412 →
        // conflict; everything else → generic revert).
        set((s) => ({
          policies: s.policies.map((p) => (p.id === id ? previous : p)),
          byId: { ...s.byId, [id]: previous },
          selectedPolicy: s.selectedPolicy?.id === id ? previous : s.selectedPolicy,
          error: errorMessage(e, 'Failed to update policy'),
          isMutating: false,
        }))
        pushToast(revertMessage(e), 'error')
      }
    })()
  },

  delete: (id) => {
    // P3-D1: wait for server confirmation before removing from local state.
    // Avoids ghost entries disappearing before the DELETE actually completes.
    const previous = get().byId[id]
    if (!previous) return
    set({ isMutating: true, error: null })

    void (async () => {
      try {
        // W18 / SEC-1: optimistic-concurrency guard on delete too.
        // Wave-19.3 / P18-BUG-1 — route takes the canonical UUID.
        const apiId = previous.uuid ?? id
        await api.delete(`/policies/${apiId}`, ifMatchHeader(previous.updatedAt))
        set((s) => {
          const { [id]: _drop, ...rest } = s.byId
          return {
            policies: s.policies.filter((p) => p.id !== id),
            byId: rest,
            selectedPolicy: s.selectedPolicy?.id === id ? null : s.selectedPolicy,
            isMutating: false,
          }
        })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to delete policy'), isMutating: false })
        pushToast(revertMessage(e), 'error')
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
    const step = policy.workflowTimeline[stepIndex]
    const previous = step.deadline
    const newTimeline = policy.workflowTimeline.map((s, i) =>
      i === stepIndex ? { ...s, deadline: deadline || undefined } : s,
    )
    const today = new Date().toISOString().split('T')[0]
    const stepLabel = step.step
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
    // Optimistic local update immediately (keeps UI responsive).
    set((s) => {
      const cur = s.byId[policyId]
      if (!cur) return {}
      const next: Policy = { ...cur, workflowTimeline: newTimeline, activityLog: [...(cur.activityLog ?? []), entry] }
      return {
        byId: { ...s.byId, [policyId]: next },
        policies: s.policies.map((p) => (p.id === policyId ? next : p)),
        selectedPolicy: s.selectedPolicy?.id === policyId ? next : s.selectedPolicy,
      }
    })

    // P1-fix: fire POST /workflow/set-phase-deadline so the deadline column
    // on policy_workflow_steps is actually written. Requires the step UUID.
    const stepId = step.id
    if (stepId && isPersistedId(stepId)) {
      const apiId = policy.uuid ?? policyId
      void (async () => {
        try {
          await api.post(
            `/policies/${apiId}/workflow/set-phase-deadline`,
            { step_id: stepId, deadline: deadline ?? null },
          )
        } catch (e) {
          // Roll back the optimistic update on failure.
          set((s) => {
            const cur = s.byId[policyId]
            if (!cur) return {}
            const rolled: Policy = {
              ...cur,
              workflowTimeline: cur.workflowTimeline.map((st, i) =>
                i === stepIndex ? { ...st, deadline: previous } : st,
              ),
            }
            return {
              byId: { ...s.byId, [policyId]: rolled },
              policies: s.policies.map((p) => (p.id === policyId ? rolled : p)),
              selectedPolicy: s.selectedPolicy?.id === policyId ? rolled : s.selectedPolicy,
            }
          })
          pushToast(revertMessage(e), 'error')
        }
      })()
    }
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

  // Wave-19.3 / P18-BUG-1 — load the NEXT page of `policy_activity_log` rows
  // for the open detail modal. Mirrors `loadMoreTimeline` in circular-store:
  // newest-first, append older rows below, dedupe by id, `loadingMore` flag
  // drives the on-button spinner. The first page is already shipped by the
  // detail GET via `getPolicyDetail`.
  loadMorePolicyActivity: async (policyId: string) => {
    const policy = get().byId[policyId] ?? get().policies.find((p) => p.id === policyId)
    if (!policy) return
    const apiId = policy.uuid ?? policyId
    const page = get().policyActivityPagination[policyId] ?? {
      offset: (policy.activityLog ?? []).length,
      hasMore: true,
      loadingMore: false,
    }
    if (page.loadingMore || !page.hasMore) return
    set((s) => ({
      policyActivityPagination: {
        ...s.policyActivityPagination,
        [policyId]: { ...page, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{
        items: PolicyActivityApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>(`/policies/${apiId}/activity`, { page: Math.floor(page.offset / 10) + 1, pageSize: 10 })
      const newRows = (res.items ?? []).map(mapPolicyActivityRow)
      set((s) => {
        const updated = (s.byId[policyId] ?? policy)
        const existing = new Set((updated.activityLog ?? []).map((e) => e.id))
        const merged = [
          ...(updated.activityLog ?? []),
          ...newRows.filter((e) => !existing.has(e.id)),
        ]
        const next: Policy = { ...updated, activityLog: merged }
        return {
          byId: { ...s.byId, [policyId]: next },
          policies: s.policies.map((p) => (p.id === policyId ? next : p)),
          selectedPolicy: s.selectedPolicy?.id === policyId ? next : s.selectedPolicy,
          policyActivityPagination: {
            ...s.policyActivityPagination,
            [policyId]: {
              offset: merged.length,
              hasMore: merged.length < (res.total ?? 0),
              loadingMore: false,
            },
          },
        }
      })
    } catch (e) {
      set((s) => ({
        policyActivityPagination: {
          ...s.policyActivityPagination,
          [policyId]: { ...page, loadingMore: false },
        },
      }))
      pushToast(revertMessage(e), 'error')
      // eslint-disable-next-line no-console
      console.error('[loadMorePolicyActivity] failed —', e)
    }
  },

  // Wave-19.3 / Task-B — Policy Leader change. Optimistic owner update +
  // PATCH /policies/{uuid}; the server PATCH route writes the
  // `leader_changed` / `leader_assigned` activity-log row (dual-store).
  // After the response lands, fetchById is called so the Activity tab picks
  // up the new entry on the next render.
  updateLeader: (policyId, ownerId, ownerName, ownerDepartment) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const optimistic: Policy = {
      ...previous,
      ownerId: ownerId ?? undefined,
      owner: {
        name: ownerName ?? '',
        avatar: ownerName ?? '',
        department: ownerDepartment ?? previous.owner?.department ?? '',
      },
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === policyId ? optimistic : p)),
      byId: { ...s.byId, [policyId]: optimistic },
      selectedPolicy: s.selectedPolicy?.id === policyId ? optimistic : s.selectedPolicy,
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const apiId = previous.uuid ?? policyId
        const payload: Record<string, unknown> = {
          owner_id: ownerId,
          owner_name: ownerName,
        }
        if (ownerDepartment !== undefined) payload.owner_department = ownerDepartment
        const row = await api.patch<PolicyApiRow>(
          `/policies/${apiId}`,
          payload,
          ifMatchHeader(previous.updatedAt),
        )
        const updated = mapRow(row, optimistic)
        set((s) => ({
          policies: s.policies.map((p) => (p.id === policyId ? updated : p)),
          byId: { ...s.byId, [policyId]: updated },
          selectedPolicy: s.selectedPolicy?.id === policyId ? updated : s.selectedPolicy,
          isMutating: false,
        }))
        // Refresh the detail so the new `leader_changed` activity row lands
        // on the Activity tab (the PATCH response itself only carries the
        // top-level policy row, not the activity-log children).
        get().fetchById(policyId)
      } catch (e) {
        // Roll back the optimistic owner update + surface a keyed toast.
        set((s) => ({
          policies: s.policies.map((p) => (p.id === policyId ? previous : p)),
          byId: { ...s.byId, [policyId]: previous },
          selectedPolicy: s.selectedPolicy?.id === policyId ? previous : s.selectedPolicy,
          error: errorMessage(e, 'Failed to update policy leader'),
          isMutating: false,
        }))
        pushToast(revertMessage(e), 'error')
      }
    })()
  },

  // A7 fix — POST /api/policies/{id}/workflow/steps.
  // Optimistic local insert into workflowTimeline; fires the server POST
  // in the background; rolls back and surfaces a toast on failure.
  addWorkflowStep: (policyId, { step, description, actionType, deadline }) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const isApproved = previous.status === 'approved'
    const newStep: PolicyWorkflowStep = {
      step,
      description,
      actionType,
      deadline,
      date: '',
      user: '',
      status: isApproved ? ('current' as const) : ('pending' as const),
    }
    const today = new Date().toISOString().split('T')[0]
    const entry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'step_added',
      textEn: `Workflow step "${step}" added`,
      textAr: `تمت إضافة خطوة "${step}"`,
    }
    const optimistic: Policy = {
      ...previous,
      workflowTimeline: [...(previous.workflowTimeline ?? []), newStep],
      ...(isApproved ? { status: 'under-review' as PolicyStatus } : {}),
      activityLog: [...(previous.activityLog ?? []), entry],
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === policyId ? optimistic : p)),
      byId: { ...s.byId, [policyId]: optimistic },
      selectedPolicy: s.selectedPolicy?.id === policyId ? optimistic : s.selectedPolicy,
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const apiId = previous.uuid ?? policyId
        const row = await api.post<PolicyWorkflowStepApiRow>(
          `/policies/${apiId}/workflow/steps`,
          {
            step,
            description: description ?? null,
            action_type: actionType ?? null,
            deadline: deadline ?? null,
          },
        )
        // Map the server response back — the server assigns id/sort_order.
        const serverStep = mapPolicyWorkflowStepRow(row)
        // Reconcile: replace the last-added step (tail) with the server-issued one.
        set((s) => {
          const policy = s.byId[policyId] ?? optimistic
          const timeline = [...(policy.workflowTimeline ?? [])]
          // Find and replace the optimistic step (the tail pending step).
          const idx = timeline.findLastIndex(
            (st) => st.step === step && st.status !== 'completed' && !st.date,
          )
          if (idx >= 0) timeline[idx] = serverStep
          const reconciled: Policy = { ...policy, workflowTimeline: timeline }
          return {
            policies: s.policies.map((p) => (p.id === policyId ? reconciled : p)),
            byId: { ...s.byId, [policyId]: reconciled },
            selectedPolicy: s.selectedPolicy?.id === policyId ? reconciled : s.selectedPolicy,
            isMutating: false,
          }
        })
        // Refresh the detail so the Activity tab picks up the new row.
        get().fetchById(policyId)
      } catch (e) {
        // Roll back the optimistic insert + surface a keyed toast.
        set((s) => ({
          policies: s.policies.map((p) => (p.id === policyId ? previous : p)),
          byId: { ...s.byId, [policyId]: previous },
          selectedPolicy: s.selectedPolicy?.id === policyId ? previous : s.selectedPolicy,
          error: errorMessage(e, 'Failed to add workflow step'),
          isMutating: false,
        }))
        pushToast(revertMessage(e), 'error')
      }
    })()
  },

  // A6: optimistic attachment upload — POST /api/policies/{id}/attachments.
  // Uses the same dataUrl-as-storage_path pattern as circular attachments.
  addAttachment: async (policyId, { name, dataUrl, size, uploadedBy }) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: PolicyAttachment = {
      id: tempId,
      name,
      dataUrl,
      size,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    }
    const applyToState = (policy: Policy | undefined, atts: PolicyAttachment[]) => {
      if (!policy) return
      const next: Policy = { ...policy, attachments: atts }
      set((s) => ({
        policies: s.policies.map((p) => (p.id === policyId ? next : p)),
        byId: { ...s.byId, [policyId]: next },
        selectedPolicy: s.selectedPolicy?.id === policyId ? next : s.selectedPolicy,
      }))
    }
    applyToState(previous, [optimistic, ...(previous.attachments ?? [])])
    try {
      const apiId = previous.uuid ?? policyId
      const row = await api.post<PolicyAttachmentApiRow>(
        `/policies/${apiId}/attachments`,
        { name, storage_path: dataUrl, size },
      )
      const real = mapPolicyAttachmentRow(row)
      const current = get().byId[policyId] ?? previous
      applyToState(current, (current.attachments ?? []).map((a) => (a.id === tempId ? real : a)))
    } catch (e) {
      // Roll back on failure
      applyToState(get().byId[policyId] ?? previous, (previous.attachments ?? []))
      pushToast(revertMessage(e), 'error')
      // eslint-disable-next-line no-console
      console.error('[addAttachment] failed —', e)
      throw e
    }
  },

  removeAttachment: (policyId, attachmentId) => {
    const policy = get().byId[policyId]
    if (!policy) return
    const next: Policy = {
      ...policy,
      attachments: (policy.attachments ?? []).filter((a) => a.id !== attachmentId),
    }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === policyId ? next : p)),
      byId: { ...s.byId, [policyId]: next },
      selectedPolicy: s.selectedPolicy?.id === policyId ? next : s.selectedPolicy,
    }))
  },

  // P2 fix — POST /api/policies/{id}/evidence.
  // Uses dataUrl-as-storage_path pattern matching addAttachment above.
  addEvidence: async (policyId, { name, dataUrl, uploadedBy, reviewCycleId, reviewCycleLabel }) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: PolicyEvidence = {
      id: tempId,
      name,
      dataUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      reviewCycleId,
      reviewCycleLabel,
    }
    // P7-residual-a (W31): if the policy has no open review cycle yet, the first
    // upload must also pin currentReviewCycleId locally — the server (P10) pins
    // it to this same cycle, but the client never learned about it, so the
    // "Current Review" filter (e.reviewCycleId === currentReviewCycleId) hid the
    // very first evidence row. Pinning here makes it render immediately.
    const pinCycle = !previous.currentReviewCycleId
    const applyToState = (
      policy: Policy | undefined,
      evs: PolicyEvidence[],
      cycle: { id: string | null; label: string | null } | undefined,
    ) => {
      if (!policy) return
      const next: Policy = {
        ...policy,
        evidence: evs,
        ...(cycle ? { currentReviewCycleId: cycle.id ?? undefined, currentReviewCycleLabel: cycle.label ?? undefined } : {}),
      }
      set((s) => ({
        policies: s.policies.map((p) => (p.id === policyId ? next : p)),
        byId: { ...s.byId, [policyId]: next },
        selectedPolicy: s.selectedPolicy?.id === policyId ? next : s.selectedPolicy,
      }))
    }
    const cyclePatch = pinCycle ? { id: reviewCycleId, label: reviewCycleLabel } : undefined
    applyToState(previous, [optimistic, ...(previous.evidence ?? [])], cyclePatch)
    try {
      const apiId = previous.uuid ?? policyId
      const row = await api.post<PolicyEvidenceApiRow>(
        `/policies/${apiId}/evidence`,
        {
          name,
          storage_path: dataUrl,
          review_cycle_id: reviewCycleId,
          review_cycle_label: reviewCycleLabel,
        },
      )
      const real = mapPolicyEvidenceRow(row)
      const current = get().byId[policyId] ?? previous
      applyToState(
        current,
        (current.evidence ?? []).map((e) => (e.id === tempId ? real : e)),
        pinCycle ? { id: real.reviewCycleId, label: real.reviewCycleLabel } : undefined,
      )
    } catch (e) {
      // Roll back on failure — also restore the prior (unpinned) cycle.
      applyToState(
        get().byId[policyId] ?? previous,
        previous.evidence ?? [],
        pinCycle ? { id: previous.currentReviewCycleId ?? null, label: previous.currentReviewCycleLabel ?? null } : undefined,
      )
      pushToast(revertMessage(e), 'error')
      // eslint-disable-next-line no-console
      console.error('[addEvidence] failed —', e)
      throw e
    }
  },

  // P6 (W29): archive / unarchive a policy by PATCHing archived_at.
  // Optimistic archivedAt update; roll back on failure.
  archivePolicy: async (policyId, actorName) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const now = new Date().toISOString()
    const optimistic: Policy = { ...previous, archivedAt: now, updatedAt: now }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === policyId ? optimistic : p)),
      byId: { ...s.byId, [policyId]: optimistic },
      selectedPolicy: s.selectedPolicy?.id === policyId ? optimistic : s.selectedPolicy,
      isMutating: true,
    }))
    try {
      const apiId = previous.uuid ?? policyId
      await api.patch(`/policies/${apiId}`, { archived_at: now }, ifMatchHeader(previous.updatedAt))
    } catch (e) {
      set((s) => ({
        policies: s.policies.map((p) => (p.id === policyId ? previous : p)),
        byId: { ...s.byId, [policyId]: previous },
        selectedPolicy: s.selectedPolicy?.id === policyId ? previous : s.selectedPolicy,
        isMutating: false,
      }))
      pushToast(revertMessage(e), 'error')
      throw e
    }
    set({ isMutating: false })
  },

  unarchivePolicy: async (policyId, actorName) => {
    const previous = get().byId[policyId]
    if (!previous) return
    const optimistic: Policy = { ...previous, archivedAt: null, updatedAt: new Date().toISOString() }
    set((s) => ({
      policies: s.policies.map((p) => (p.id === policyId ? optimistic : p)),
      byId: { ...s.byId, [policyId]: optimistic },
      selectedPolicy: s.selectedPolicy?.id === policyId ? optimistic : s.selectedPolicy,
      isMutating: true,
    }))
    try {
      const apiId = previous.uuid ?? policyId
      await api.patch(`/policies/${apiId}`, { archived_at: null }, ifMatchHeader(previous.updatedAt))
    } catch (e) {
      set((s) => ({
        policies: s.policies.map((p) => (p.id === policyId ? previous : p)),
        byId: { ...s.byId, [policyId]: previous },
        selectedPolicy: s.selectedPolicy?.id === policyId ? previous : s.selectedPolicy,
        isMutating: false,
      }))
      pushToast(revertMessage(e), 'error')
      throw e
    }
    set({ isMutating: false })
  },

  setArchiveFilter: (f) => set({ archiveFilter: f }),

  // P1 (W29): persist workflow step advancement to the server.
  // Mirrors the circular-store advanceStep pattern. Fires AFTER the optimistic
  // local update in handleConfirmAction (PolicyDetailsContent) so the step state
  // is already reflected in the UI. A server error surfaces a toast but does NOT
  // roll back the local state (the local update is the "truth" for the session;
  // the next fetchById will reconcile if the server rejects).
  advanceWorkflowStep: async (policyId, { action, stepId, note, userName }) => {
    const policy = get().byId[policyId]
    if (!policy) return
    const apiId = policy.uuid ?? policyId
    try {
      await api.post<PolicyApiRow>(`/policies/${apiId}/workflow/advance`, {
        action,
        ...(stepId ? { step_id: stepId } : {}),
        ...(note ? { note } : {}),
        ...(userName ? { user_name: userName } : {}),
      })
      // Refresh detail so activity log picks up the server-emitted entry.
      get().fetchById(policyId)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[advanceWorkflowStep] server persist failed —', action, e)
      pushToast(revertMessage(e), 'error')
    }
  },

  clearError: () => set({ error: null }),
}))
