// Observation store — Phase 5 server-state migration.
//
// CRUD goes through /api/observations. Nested mutations (comments, checklist,
// documents, remediation, closure, leadership) map to the sub-routes under
// /api/observations/[id]/*. Where a corresponding endpoint does not yet exist
// (e.g. update-comment, delete-comment, edit-checklist, transfer-leader as a
// dedicated action) we fall back to local-only state patches that still write
// to `observation.timeline[]` so the activity feed renders. TODOs flag each
// fallback for Phase 6.
//
// Legacy method names and signatures are preserved verbatim so consumer pages
// (observation-detail-modal, add-observation-modal, correspondence/observations
// page, …) keep compiling.
//
// SKELETON-LOADING NOTE: consumer pages render a skeleton when
// `isLoading && observations.length === 0` (first-fetch). On refetch the stale
// list stays visible while `isLoading` flips to true.

import { create } from 'zustand'
import type {
  Observation,
  ObservationFilters,
  PaginationState,
  SortState,
  Comment,
  User,
  ObservationTimelineEntry,
  RemediationPlan,
  ClosureRequest,
  ClosureReview,
  RegulatoryBodyId,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { requirePermission } from '@/lib/rbac-store-gate'
import { newTempId, optimisticMutation } from '@/lib/optimistic'
// Wave-20.cleanup — the `optimisticMutation` helper calls `pushToast`
// internally with the keyed `errorMessage`; we just supply the key spec.
import type { ToastMessage } from '@/stores/toast-store'

// Wave-20.cleanup — UUID guard for child-route PATCH/DELETE. Mirrors
// `isPersistedId` from circular-store: a freshly-created child row may carry
// a `temp-…` client id; we must never PATCH that against the server.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isPersistedId(id: string): boolean {
  return UUID_RE.test(id)
}

// Wave-20.cleanup / RTL-8 — friendly toast for a reverted optimistic mutation.
// Returns a `{key,params}` translation spec so `<ToastHost />` localises at
// render time (the store lives outside React and has no `t()`). 412 →
// dedicated conflict copy; everything else falls back to the generic revert
// key. Mirror of the policy/circular helper so the three stores stay aligned.
function revertMessage(e: unknown): ToastMessage {
  if (e instanceof ApiClientError) {
    if (e.status === 412 || e.code === 'precondition_failed') {
      return { key: 'regulatoryUpdates.optimisticConflict' }
    }
  }
  return { key: 'regulatoryUpdates.optimisticRevert' }
}

interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

// Extended observation type with comments for the detail modal
export interface ObservationWithComments extends Observation {
  comments?: Comment[]
  checklist?: ChecklistItem[]
}

// ---------- API row shapes --------------------------------------------------

interface ObservationApiRow {
  id: string
  reference: string
  title: string
  sub_title: string | null
  description?: string
  source: string
  severity: string
  status: string
  due_date: string
  remediation_submission_due?: string | null
  department: string | null
  leader_id: string | null
  creator_id: string | null
  progress: number
  framework_ids: string[]
  // Wave-20 — derived state from migration 060.
  is_overdue?: boolean
  created_at: string
  updated_at: string
}

// Wave-20 / PORTING-TEMPLATE §2.12 — `If-Match: W/"<updatedAt>"` builder.
// Returns undefined when no token is available so callers can spread the
// result into a header object without leaking an empty header.
function ifMatchHeader(updatedAt: string | undefined): Record<string, string> | undefined {
  if (!updatedAt) return undefined
  return { 'If-Match': `W/"${updatedAt}"` }
}

interface ObservationTimelineRow {
  id: string
  observation_id: string
  date: string
  // Wave-20 / migration 059 — dual-store. `description` / `description_ar`
  // retired in favour of `text_en` / `text_ar` (mirror of the platform
  // convention used by policy_activity_log / circular_timeline).
  text_en: string
  text_ar: string
  action_type: string
  user_id: string | null
  user_name: string | null
  target_id: string | null
  metadata: unknown
}

function mapTimelineRow(row: ObservationTimelineRow): ObservationTimelineEntry {
  // Wave-20.cleanup — canonical reader shape. Server rows populate the
  // dual-store columns `textEn` / `textAr` (mirror of Policy + Rules);
  // `description` / `descriptionAr` are kept as a back-compat mirror of
  // `textEn` so any legacy reader that hasn't migrated still renders. New
  // readers should pick `entry.textEn` / `entry.textAr` directly.
  return {
    id: row.id,
    date: row.date,
    textEn: row.text_en,
    textAr: row.text_ar,
    // Legacy compat — reader fallback only; do not add new consumers.
    description: row.text_en,
    descriptionAr: row.text_ar,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    actionType: row.action_type as ObservationTimelineEntry['actionType'],
    targetId: row.target_id ?? undefined,
  }
}

function mapRow(row: ObservationApiRow, previous?: Observation): Observation {
  // Wave-20 / §1.6.a — every previous-fallback ends in `?? []` so a list
  // response that omits a nested array can never collapse a hydrated row
  // back to undefined (the P1 / P18-BUG-1 / Wave-19.3 trap). When the
  // detail response carries the nested array (`fetchById`) that path takes
  // precedence over `previous`.
  return {
    id: row.reference || row.id,
    title: row.title,
    subTitle: row.sub_title ?? previous?.subTitle,
    description: row.description ?? previous?.description ?? '',
    source: row.source as Observation['source'],
    severity: row.severity as Observation['severity'],
    status: row.status as Observation['status'],
    dueDate: row.due_date,
    remediationSubmissionDueDate: row.remediation_submission_due ?? previous?.remediationSubmissionDueDate,
    department: row.department ?? previous?.department ?? '',
    reference: row.reference,
    assignee: previous?.assignee,
    assignees: previous?.assignees ?? [],
    team: previous?.team,
    progress: row.progress ?? previous?.progress ?? 0,
    checklist: previous?.checklist ?? [],
    updates: previous?.updates ?? [],
    documents: previous?.documents ?? [],
    timeline: previous?.timeline ?? [],
    creatorId: row.creator_id ?? previous?.creatorId,
    leaderId: row.leader_id ?? previous?.leaderId,
    remediationPlan: previous?.remediationPlan,
    closureRequest: previous?.closureRequest,
    closureReview: previous?.closureReview,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    isOverdue: row.is_overdue ?? previous?.isOverdue ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(
  data: Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>,
  // `reference` is intentionally dropped — the POST /api/observations route
  // generates the reference server-side via `insertWithRefCode`. Sending it
  // would cause a 400 (CreateObservationSchema uses .strict() and rejects
  // unknown keys). W20-BUG-1 fix.
  _reference: string,
): Record<string, unknown> {
  return {
    title: data.title,
    sub_title: data.subTitle ?? undefined,
    description: data.description,
    source: data.source,
    severity: data.severity,
    due_date: data.dueDate,
    remediation_submission_due: data.remediationSubmissionDueDate ?? undefined,
    department: data.department || undefined,
    leader_id: data.leaderId ?? undefined,
    framework_ids: data.frameworkIds ?? [],
  }
}

function toUpdatePayload(patch: Partial<Observation>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.subTitle !== undefined) out.sub_title = patch.subTitle
  if (patch.description !== undefined) out.description = patch.description
  if (patch.source !== undefined) out.source = patch.source
  if (patch.severity !== undefined) out.severity = patch.severity
  if (patch.status !== undefined) out.status = patch.status
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate
  if (patch.remediationSubmissionDueDate !== undefined)
    out.remediation_submission_due = patch.remediationSubmissionDueDate
  if (patch.department !== undefined) out.department = patch.department
  if (patch.leaderId !== undefined) out.leader_id = patch.leaderId
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  if (patch.progress !== undefined) out.progress = patch.progress
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store -----------------------------------------------------------

interface ObservationState {
  observations: Observation[]
  byId: Record<string, ObservationWithComments>
  selectedObservation: ObservationWithComments | null
  filters: ObservationFilters
  pagination: PaginationState
  sort: SortState

  // First-fetch skeleton detector: `isLoading && observations.length === 0`
  // → render skeleton. Refetches keep stale data visible.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Detail-fetch tracker — populated once `fetchById(id)` resolves. The list
  // response carries summary columns, but detail-only sub-resources
  // (checklist, documents, updates, assignees, remediation plans, closure
  // request/review, timeline) only appear after a detail fetch. UI uses
  // `isDetailLoaded(id)` to gate skeleton vs real content on those sections.
  detailLoadedIds: Record<string, true>

  fetchAll: (force?: boolean) => Promise<void>
  fetchById: (id: string) => Promise<Observation | null>
  fetchTimeline: (id: string) => Promise<ObservationTimelineEntry[]>
  create: (data: Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>, creator?: User) => Promise<Observation>
  update: (id: string, data: Partial<Observation>, editor?: User) => Promise<Observation>
  delete: (id: string) => Promise<void>

  addComment: (observationId: string, content: string, author: User) => Promise<Comment>
  editComment: (observationId: string, commentId: string, newText: string, editor: User) => Promise<void>
  deleteComment: (observationId: string, commentId: string, deleter: User) => Promise<void>

  addChecklistItem: (observationId: string, text: string, user?: User) => Promise<ChecklistItem>
  editChecklistItem: (observationId: string, itemId: string, newText: string, user?: User) => Promise<void>
  toggleChecklistItem: (observationId: string, itemId: string, completed: boolean, user?: User) => Promise<void>
  removeChecklistItem: (observationId: string, itemId: string, itemText?: string, user?: User) => Promise<void>

  transferLeadership: (observationId: string, newLeaderId: string, newLeaderName: string, currentUser: User) => Promise<void>
  submitRemediationPlan: (
    observationId: string,
    plan: Omit<RemediationPlan, 'id' | 'status' | 'createdAt' | 'submittedAt' | 'submittedBy'>,
    submitter: User,
    observationLeaderId?: string,
  ) => Promise<void>
  reviewRemediationPlan: (observationId: string, approved: boolean, reviewer: User, notes?: string) => Promise<void>
  requestClosure: (observationId: string, requester: User, notes?: string) => Promise<void>
  reviewClosure: (observationId: string, approved: boolean, reviewer: User, notes?: string) => Promise<void>

  addDocument: (
    observationId: string,
    document: { name: string; type: 'pdf' | 'image' | 'doc'; storage_path?: string },
    uploader: User,
    addToRemediationPlan?: boolean,
  ) => Promise<void>
  removeDocument: (observationId: string, documentId: string, documentName: string, user: User) => Promise<void>

  setFilters: (filters: ObservationFilters) => void
  clearFilters: () => void
  setSelected: (observation: ObservationWithComments | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  /**
   * Returns `true` after `fetchById(id)` has resolved successfully for this
   * observation. Use to gate skeleton state on detail-only sections
   * (checklist, comments, documents, remediation, closure, timeline). List
   * rows alone do not carry those relations.
   */
  isDetailLoaded: (id: string) => boolean
  clearError: () => void
}

const INITIAL_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
}

const INITIAL_SORT: SortState = {
  field: 'createdAt',
  direction: 'desc',
}

function patchObservation(
  state: ObservationState,
  observationId: string,
  patch: (obs: Observation) => Observation,
): Pick<ObservationState, 'observations' | 'byId' | 'selectedObservation'> {
  const observations = state.observations.map((o) => (o.id === observationId ? patch(o) : o))
  const previous = state.byId[observationId]
  const updated = previous ? patch(previous) : undefined
  const byId = updated ? { ...state.byId, [observationId]: updated } : state.byId
  const selectedObservation =
    state.selectedObservation?.id === observationId
      ? ({ ...state.selectedObservation, ...patch(state.selectedObservation) } as ObservationWithComments)
      : state.selectedObservation
  return { observations, byId, selectedObservation }
}

export const useObservationStore = create<ObservationState>()((set, get) => ({
  observations: [],
  byId: {},
  selectedObservation: null,
  filters: {},
  pagination: INITIAL_PAGINATION,
  sort: INITIAL_SORT,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,
  detailLoadedIds: {},

  fetchAll: async (force = false) => {
    const state = get()
    // Skip if a fresh fetch completed in the last 30s, unless force=true.
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) {
      return
    }
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: ObservationApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/observations', { page: 1, pageSize: 100 })
      const previousById = get().byId
      const observations = result.items.map((r) => mapRow(r, previousById[r.reference || r.id]))
      const byId: Record<string, ObservationWithComments> = {}
      for (const o of observations) byId[o.id] = o as ObservationWithComments
      set({
        observations,
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
      set({ error: errorMessage(e, 'Failed to fetch observations'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    // WAVE2-A: GET /api/observations/[id] returns the row PLUS nested
    // children (`checklist`, `documents`, `updates`, `assignees`, `remediation_plans`,
    // `closure_request`, `closure_review`). The legacy mapper only handled the
    // top-level columns, which left every modal child-resource empty after
    // refresh. Capture the nested arrays here so the modal can read them from
    // the store directly.
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<ObservationApiRow & {
        checklist?: Array<{ id: string; text: string; completed: boolean; sort_order?: number }>
        documents?: Array<{ id: string; name: string; type: string }>
        updates?: Array<{
          id: string
          author_id: string
          text: string
          is_edited: boolean
          edited_at: string | null
          created_at: string
        }>
        assignees?: Array<{ id: string; user_id: string | null; name: string; role: string | null }>
        remediation_plans?: Array<{
          id: string
          title: string
          description: string
          due_date: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          review_notes: string | null
          created_at: string
        }>
        closure_request?: {
          requested_at: string
          requested_by: string
          notes: string | null
        } | null
        closure_review?: {
          reviewed_at: string
          reviewed_by: string
          approved: boolean
          notes: string | null
        } | null
      }>(`/observations/${id}`)
      const previous = get().byId[id]
      const observation = mapRow(row, previous) as ObservationWithComments
      // Hydrate nested children from the detail response.
      if (row.checklist) {
        observation.checklist = row.checklist.map((c) => ({
          id: c.id,
          text: c.text,
          completed: c.completed,
        }))
      }
      if (row.documents) {
        observation.documents = row.documents.map((d) => ({
          id: d.id,
          name: d.name,
          type: (d.type === 'pdf' || d.type === 'image' || d.type === 'doc'
            ? d.type
            : 'doc') as 'pdf' | 'image' | 'doc',
        }))
      }
      if (row.updates) {
        // Build the Comment[] view the modal reads via `storeObservation.comments`.
        // The author field on Comment is typed as the full User; we only have an id +
        // best-effort name from the assignee list, so we cast through unknown.
        observation.comments = row.updates.map((u) => {
          const authorName = previous?.assignees?.find((a) => a.id === u.author_id)?.name ?? 'User'
          return {
            id: u.id,
            content: u.text,
            author: {
              id: u.author_id,
              name: authorName,
              avatar: authorName,
            } as unknown as Comment['author'],
            createdAt: u.created_at,
          }
        })
        // Also map into observation.updates so legacy paths keep working.
        observation.updates = row.updates.map((u) => {
          const authorName = previous?.assignees?.find((a) => a.id === u.author_id)?.name ?? 'User'
          return {
            id: u.id,
            authorId: u.author_id,
            author: { name: authorName, avatar: authorName },
            text: u.text,
            createdAt: u.created_at,
            isEdited: u.is_edited ?? false,
            editedAt: u.edited_at ?? undefined,
          }
        })
      }
      if (row.assignees) {
        observation.assignees = row.assignees.map((a) => ({
          id: a.user_id ?? a.id,
          name: a.name,
          avatar: a.name,
          role: a.role ?? '',
        }))
      }
      if (row.remediation_plans && row.remediation_plans.length > 0) {
        const latest = row.remediation_plans[0]
        observation.remediationPlan = {
          id: latest.id,
          title: latest.title,
          description: latest.description,
          dueDate: latest.due_date,
          status: latest.status as RemediationPlan['status'],
          submittedAt: latest.submitted_at ?? undefined,
          submittedBy: latest.submitted_by ?? undefined,
          reviewedAt: latest.reviewed_at ?? undefined,
          reviewedBy: latest.reviewed_by ?? undefined,
          reviewNotes: latest.review_notes ?? undefined,
          createdAt: latest.created_at,
          documents: previous?.remediationPlan?.documents ?? [],
        }
      }
      if (row.closure_request) {
        observation.closureRequest = {
          requestedAt: row.closure_request.requested_at,
          requestedBy: row.closure_request.requested_by,
          requestedByName: previous?.closureRequest?.requestedByName ?? '',
          notes: row.closure_request.notes ?? undefined,
        }
      }
      if (row.closure_review) {
        observation.closureReview = {
          reviewedAt: row.closure_review.reviewed_at,
          reviewedBy: row.closure_review.reviewed_by,
          reviewedByName: previous?.closureReview?.reviewedByName ?? '',
          approved: row.closure_review.approved,
          notes: row.closure_review.notes ?? undefined,
        }
      }
      // Also fetch the timeline so the activity feed renders.
      const timeline = await get().fetchTimeline(id)
      observation.timeline = timeline.length > 0 ? timeline : (previous?.timeline ?? [])

      set((s) => ({
        byId: { ...s.byId, [id]: observation },
        observations: s.observations.some((o) => o.id === id)
          ? s.observations.map((o) => (o.id === id ? observation : o))
          : s.observations,
        selectedObservation: observation,
        detailLoadedIds: { ...s.detailLoadedIds, [id]: true },
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return observation
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch observation'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  fetchTimeline: async (id) => {
    try {
      const result = await api.get<{
        items: ObservationTimelineRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>(`/observations/${id}/timeline`, { page: 1, pageSize: 100 })
      return result.items.map(mapTimelineRow)
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch timeline') })
      return []
    }
  },

  create: async (data, creator) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'create' })
    // W24-6b: reference is always generated server-side; use any user-provided
    // value as the optimistic placeholder, or fall back to a temp marker.
    const reference = data.reference || 'OBS-…'
    // Auto-add creator as assignee in the local mirror so the UI shows it.
    const assignees = [...(data.assignees || [])]
    if (creator && !assignees.some((a) => a.id === creator.id)) {
      assignees.unshift({
        id: creator.id,
        name: creator.name,
        avatar: creator.avatar || creator.name,
        role: creator.role,
      })
    }
    // Wave-20.cleanup — canonical `optimisticMutation` lifecycle (apply +
    // request + reconcile + revert + keyed toast). `apply()` inserts a temp
    // row at the TOP of the list; `reconcile()` swaps the temp id for the
    // server-assigned UUID; `revert()` drops the temp row and surfaces a
    // localised toast.
    const tempId = newTempId('temp-obs')
    const now = new Date().toISOString()
    const optimistic: Observation = {
      ...(data as Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>),
      id: tempId,
      reference,
      assignees,
      creatorId: creator?.id,
      leaderId: data.leaderId ?? creator?.id,
      documents: data.documents || [],
      createdAt: now,
      updatedAt: now,
    } as Observation
    let created: Observation | null = null
    try {
      await optimisticMutation<ObservationApiRow>({
        context: 'observation.create',
        // RTL-8 — keyed toast; the helper picks the conflict key for 412 and
        // the generic revert key for everything else.
        errorMessage: revertMessage,
        apply: () => {
          set((s) => ({
            observations: [optimistic, ...s.observations],
            byId: { ...s.byId, [tempId]: optimistic },
            isMutating: true,
            error: null,
          }))
        },
        request: () =>
          api.post<ObservationApiRow>(
            '/observations',
            toCreatePayload({ ...data, reference }, reference),
          ),
        reconcile: (row) => {
          const real = mapRow(row)
          real.assignees = assignees
          real.documents = data.documents || []
          real.creatorId = creator?.id
          real.leaderId = real.leaderId ?? creator?.id
          created = real
          set((s) => {
            const { [tempId]: _drop, ...restById } = s.byId
            return {
              observations: s.observations.map((o) => (o.id === tempId ? real : o)),
              byId: { ...restById, [real.id]: real },
              isMutating: false,
            }
          })
          void get().fetchAll()
        },
        revert: () => {
          set((s) => {
            const { [tempId]: _drop, ...rest } = s.byId
            return {
              observations: s.observations.filter((o) => o.id !== tempId),
              byId: rest,
              isMutating: false,
            }
          })
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create observation') })
      throw e
    }
    if (!created) throw new Error('Failed to create observation')
    return created
  },

  update: async (id, data, editor) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'update', id })
    // Wave-20.cleanup — canonical `optimisticMutation` lifecycle.
    // ENTITY-GRANULAR SNAPSHOT: capture only the affected observation's
    // state (Wave-11 lesson). On revert, just that row is restored — never
    // the whole store.
    const snapshot = get().byId[id]
    const prevSelected = get().selectedObservation?.id === id ? get().selectedObservation : null
    let updated: Observation | null = null
    try {
      await optimisticMutation<ObservationApiRow>({
        context: 'observation.update',
        errorMessage: revertMessage,
        apply: () => {
          if (snapshot) {
            const localPatch = { ...snapshot, ...data, updatedAt: new Date().toISOString() } as Observation
            set((s) => ({
              observations: s.observations.map((o) => (o.id === id ? localPatch : o)),
              byId: { ...s.byId, [id]: localPatch },
              selectedObservation:
                s.selectedObservation?.id === id
                  ? ({ ...s.selectedObservation, ...localPatch } as ObservationWithComments)
                  : s.selectedObservation,
              isMutating: true,
              error: null,
            }))
          } else {
            set({ isMutating: true, error: null })
          }
        },
        request: async () => {
          const payload = toUpdatePayload(data)
          // Some fields the legacy code patched (assignees, remediationPlan,
          // checklist, documents) aren't accepted by the PATCH route. Send only the
          // top-level scalars; nested arrays stay local for now.
          // §2.12 — thread the row's last-known `updatedAt` as `If-Match`.
          return Object.keys(payload).length > 0
            ? await api.patch<ObservationApiRow>(
                `/observations/${id}`,
                payload,
                ifMatchHeader(snapshot?.updatedAt),
              )
            : await api.get<ObservationApiRow>(`/observations/${id}`)
        },
        reconcile: (row) => {
          const previous = get().byId[id]
          const next = mapRow(row, previous)
          // Re-apply patches that the API doesn't accept yet.
          if (data.assignees !== undefined) next.assignees = data.assignees
          if (data.assignee !== undefined) next.assignee = data.assignee
          if (data.documents !== undefined) next.documents = data.documents
          if (data.checklist !== undefined) next.checklist = data.checklist
          if (data.updates !== undefined) next.updates = data.updates
          if (data.remediationPlan !== undefined) next.remediationPlan = data.remediationPlan

          // Build the per-field timeline entries the legacy store emitted.
          const timelineEntries: ObservationTimelineEntry[] = []
          if (editor && previous) {
            if (data.status && data.status !== previous.status) {
              timelineEntries.push({
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                dateKey: 'today',
                description: `Status changed from ${previous.status} to ${data.status}`,
                descriptionAr: `تم تغيير الحالة من ${previous.status} إلى ${data.status}`,
                descriptionKey: 'observations.detail.timeline.statusChanged',
                descriptionParams: { from: previous.status, to: data.status },
                userId: editor.id,
                userName: editor.name,
                userAvatar: editor.avatar,
                actionType: 'status_change',
              })
            }
            if (data.severity && data.severity !== previous.severity) {
              timelineEntries.push({
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                dateKey: 'today',
                description: `Severity changed from ${previous.severity} to ${data.severity}`,
                descriptionAr: `تم تغيير الخطورة من ${previous.severity} إلى ${data.severity}`,
                descriptionKey: 'observations.detail.timeline.severityChanged',
                descriptionParams: { from: previous.severity, to: data.severity },
                userId: editor.id,
                userName: editor.name,
                userAvatar: editor.avatar,
                actionType: 'severity_change',
              })
            }
          }
          next.timeline = [...timelineEntries, ...(previous?.timeline || [])]
          updated = next

          set((s) => ({
            observations: s.observations.map((o) => (o.id === id ? next : o)),
            byId: { ...s.byId, [id]: next },
            selectedObservation:
              s.selectedObservation?.id === id
                ? ({ ...s.selectedObservation, ...next } as ObservationWithComments)
                : s.selectedObservation,
            isMutating: false,
          }))
        },
        revert: () => {
          if (snapshot) {
            set((s) => ({
              observations: s.observations.map((o) => (o.id === id ? snapshot : o)),
              byId: { ...s.byId, [id]: snapshot },
              selectedObservation:
                s.selectedObservation?.id === id && prevSelected
                  ? prevSelected
                  : s.selectedObservation,
              isMutating: false,
            }))
          } else {
            set({ isMutating: false })
          }
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update observation') })
      throw e
    }
    if (!updated) throw new Error('Failed to update observation')
    return updated
  },

  delete: async (id) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'delete', id })
    // Wave-20.cleanup — canonical `optimisticMutation` lifecycle.
    // Entity-granular snapshot (Wave-11): capture the row + its position +
    // selection + detail-loaded flag so revert restores the exact prior
    // state without touching unrelated entities.
    const snapshot = get().byId[id]
    const prevIndex = get().observations.findIndex((o) => o.id === id)
    const wasSelected = get().selectedObservation?.id === id
    const previousSelected = wasSelected ? get().selectedObservation : null
    const wasDetailLoaded = Boolean(get().detailLoadedIds[id])
    try {
      await optimisticMutation<void>({
        context: 'observation.delete',
        errorMessage: revertMessage,
        apply: () => {
          set((s) => {
            const { [id]: _drop, ...rest } = s.byId
            const { [id]: _dropDetail, ...restDetail } = s.detailLoadedIds
            return {
              observations: s.observations.filter((o) => o.id !== id),
              byId: rest,
              selectedObservation: wasSelected ? null : s.selectedObservation,
              detailLoadedIds: restDetail,
              isMutating: true,
              error: null,
            }
          })
        },
        request: async () => {
          await api.delete(`/observations/${id}`, ifMatchHeader(snapshot?.updatedAt))
        },
        reconcile: () => {
          set({ isMutating: false })
        },
        revert: () => {
          if (snapshot) {
            set((s) => {
              const list = [...s.observations]
              const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
              list.splice(insertAt, 0, snapshot)
              return {
                observations: list,
                byId: { ...s.byId, [id]: snapshot },
                selectedObservation: wasSelected ? previousSelected : s.selectedObservation,
                detailLoadedIds: wasDetailLoaded
                  ? { ...s.detailLoadedIds, [id]: true }
                  : s.detailLoadedIds,
                isMutating: false,
              }
            })
          } else {
            set({ isMutating: false })
          }
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete observation') })
      throw e
    }
  },

  // ---- comments ----------------------------------------------------------
  // POST /comments is wired. PATCH/DELETE per-comment endpoints don't exist
  // yet — those edits stay local-only with a timeline entry.

  addComment: async (observationId, content, author) => {
    // Wave-20.cleanup — canonical `optimisticMutation` lifecycle.
    const tempId = newTempId('temp-comment')
    const optimisticComment: Comment = {
      id: tempId,
      content,
      author,
      createdAt: new Date().toISOString(),
    }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${author.name} added a comment`,
      descriptionAr: `أضاف ${author.name} تعليقاً`,
      descriptionKey: 'observations.detail.timeline.commentAdded',
      descriptionParams: { name: author.name },
      userId: author.id,
      userName: author.name,
      userAvatar: author.avatar,
      actionType: 'comment_add',
    }
    let newComment: Comment | null = null
    try {
      await optimisticMutation<{
        id: string
        observation_id: string
        author_id: string
        text: string
        is_edited: boolean
        edited_at: string | null
        created_at: string
      }>({
        context: 'observation.addComment',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) =>
              obs.id === observationId
                ? { ...obs, timeline: [timelineEntry, ...(obs.timeline || [])] }
                : obs,
            )
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const existingComments = selectedObservation.comments || []
              selectedObservation = {
                ...selectedObservation,
                comments: [...existingComments, optimisticComment],
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            // B1 fix: also update byId so the modal's useEffect (which syncs
            // from storeObservation / byId) reflects the new comment immediately
            // without requiring a page refresh.
            const previous = state.byId[observationId]
            const byId = previous
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...previous,
                    comments: [...(previous.comments || []), optimisticComment],
                    timeline: [timelineEntry, ...(previous.timeline || [])],
                  },
                }
              : state.byId
            return { observations, byId, selectedObservation, isMutating: true, error: null }
          })
        },
        request: () =>
          api.post(`/observations/${observationId}/comments`, { text: content }),
        reconcile: (created) => {
          newComment = {
            id: created.id,
            content,
            author,
            createdAt: created.created_at,
          }
          // Swap the temp comment for the server response.
          set((state) => {
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                comments: selectedObservation.comments?.map((c) =>
                  c.id === tempId && newComment ? newComment : c,
                ),
              }
            }
            const prevById = state.byId[observationId]
            const byId = prevById && newComment
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...prevById,
                    comments: prevById.comments?.map((c) =>
                      c.id === tempId && newComment ? newComment : c,
                    ),
                  },
                }
              : state.byId
            return { selectedObservation, byId, isMutating: false }
          })
        },
        revert: () => {
          set((state) => {
            const observations = state.observations.map((obs) =>
              obs.id === observationId
                ? { ...obs, timeline: (obs.timeline || []).filter((t) => t.id !== timelineEntry.id) }
                : obs,
            )
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                comments: selectedObservation.comments?.filter((c) => c.id !== tempId),
                timeline: (selectedObservation.timeline || []).filter((t) => t.id !== timelineEntry.id),
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...previous,
                    timeline: (previous.timeline || []).filter((t) => t.id !== timelineEntry.id),
                  },
                }
              : state.byId
            return {
              observations,
              byId,
              selectedObservation,
              isMutating: false,
            }
          })
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add comment') })
      throw e
    }
    if (!newComment) throw new Error('Failed to add comment')
    return newComment
  },

  // PATCH /api/observations/[id]/comments/[commentId]. Wave-20.cleanup —
  // canonical `optimisticMutation` lifecycle + If-Match thread + temp-id
  // guard.
  editComment: async (observationId, commentId, newText, editor) => {
    // §2.12 — capture the comment's last-known `updatedAt` for If-Match.
    const sourceObs = get().selectedObservation?.id === observationId
      ? get().selectedObservation
      : get().byId[observationId]
    const commentUpdates = sourceObs?.updates?.find((u) => u.id === commentId)
    const commentUpdatedAt = (commentUpdates as { updatedAt?: string } | undefined)?.updatedAt
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${editor.name} edited a comment`,
      descriptionAr: `عدّل ${editor.name} تعليقاً`,
      descriptionKey: 'observations.detail.timeline.commentEdited',
      descriptionParams: { name: editor.name },
      userId: editor.id,
      userName: editor.name,
      userAvatar: editor.avatar,
      actionType: 'comment_edit',
      targetId: commentId,
    }
    // Entity-granular snapshot for rollback (Wave-11).
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<{
        id: string
        text: string
        is_edited: boolean
        edited_at: string | null
        created_at: string
      }>({
        context: 'observation.editComment',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const patchUpdates = (
              list: Observation['updates'] | undefined,
            ): Observation['updates'] | undefined =>
              list?.map((u) =>
                u.id === commentId
                  ? { ...u, text: newText, isEdited: true, editedAt: new Date().toISOString() }
                  : u,
              )
            const patchComments = (list: Comment[] | undefined): Comment[] | undefined =>
              list?.map((c) => (c.id === commentId ? { ...c, content: newText } : c))

            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                updates: patchUpdates(selectedObservation.updates),
                comments: patchComments(selectedObservation.comments),
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, updates: patchUpdates(previous.updates) } }
              : state.byId
            return { byId, selectedObservation, isMutating: true, error: null }
          })
        },
        request: () => {
          // GAP-20 — never PATCH a non-persisted temp id.
          if (!isPersistedId(commentId)) {
            return Promise.resolve({
              id: commentId,
              text: newText,
              is_edited: true,
              edited_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            })
          }
          return api.patch(
            `/observations/${observationId}/comments/${commentId}`,
            { text: newText },
            ifMatchHeader(commentUpdatedAt),
          )
        },
        reconcile: (updated) => {
          set((state) => {
            const patchUpdates = (
              list: Observation['updates'] | undefined,
            ): Observation['updates'] | undefined =>
              list?.map((u) =>
                u.id === commentId
                  ? {
                      ...u,
                      text: updated.text,
                      isEdited: updated.is_edited,
                      editedAt: updated.edited_at ?? undefined,
                    }
                  : u,
              )
            const patchComments = (list: Comment[] | undefined): Comment[] | undefined =>
              list?.map((c) => (c.id === commentId ? { ...c, content: updated.text } : c))

            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                updates: patchUpdates(selectedObservation.updates),
                comments: patchComments(selectedObservation.comments),
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, updates: patchUpdates(previous.updates) } }
              : state.byId
            return { byId, selectedObservation, isMutating: false }
          })
        },
        revert: () => {
          set((state) => ({
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
            isMutating: false,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to edit comment') })
      throw e
    }
  },

  // DELETE /api/observations/[id]/comments/[commentId]. Wave-20.cleanup —
  // canonical `optimisticMutation` lifecycle + If-Match thread + temp-id
  // guard.
  deleteComment: async (observationId, commentId, deleter) => {
    const sourceObs = get().selectedObservation?.id === observationId
      ? get().selectedObservation
      : get().byId[observationId]
    const commentUpdates = sourceObs?.updates?.find((u) => u.id === commentId)
    const commentUpdatedAt = (commentUpdates as { updatedAt?: string } | undefined)?.updatedAt
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${deleter.name} deleted a comment`,
      descriptionAr: `حذف ${deleter.name} تعليقاً`,
      descriptionKey: 'observations.detail.timeline.commentDeleted',
      descriptionParams: { name: deleter.name },
      userId: deleter.id,
      userName: deleter.name,
      userAvatar: deleter.avatar,
      actionType: 'comment_delete',
      targetId: commentId,
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<void>({
        context: 'observation.deleteComment',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                updates: selectedObservation.updates?.filter((u) => u.id !== commentId),
                comments: selectedObservation.comments?.filter((c) => c.id !== commentId),
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...previous,
                    updates: previous.updates?.filter((u) => u.id !== commentId),
                  },
                }
              : state.byId
            return { byId, selectedObservation, isMutating: true, error: null }
          })
        },
        request: async () => {
          // Skip the server DELETE for a non-persisted temp id.
          if (!isPersistedId(commentId)) return
          await api.delete(
            `/observations/${observationId}/comments/${commentId}`,
            ifMatchHeader(commentUpdatedAt),
          )
        },
        reconcile: () => {
          set({ isMutating: false })
        },
        revert: () => {
          set((state) => ({
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
            isMutating: false,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete comment') })
      throw e
    }
  },

  // ---- checklist ---------------------------------------------------------
  // POST and PATCH/DELETE per-item endpoints exist. We wire add and toggle to
  // the server; edit and remove also call the API.

  addChecklistItem: async (observationId, text, user) => {
    // Wave-20.cleanup — canonical optimistic add via the helper. The item
    // is inserted with a temp id immediately; on success we swap to the
    // server id; on failure we drop it + restore the snapshot.
    const tempId = newTempId('temp-cl')
    const newItem: ChecklistItem = { id: tempId, text, completed: false }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `Added checklist item: "${text}"`,
      descriptionAr: `تمت إضافة عنصر قائمة التحقق: "${text}"`,
      descriptionKey: 'observations.detail.timeline.checklistAdded',
      descriptionParams: { item: text },
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
      actionType: 'checklist_add',
      targetId: tempId,
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<{ id: string; text: string; completed: boolean; sort_order: number }>({
        context: 'observation.addChecklistItem',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const checklist = obs.checklist || []
              return { ...obs, checklist: [...checklist, newItem] }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const checklist = selectedObservation.checklist || []
              selectedObservation = {
                ...selectedObservation,
                checklist: [...checklist, newItem],
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, checklist: [...(previous.checklist || []), newItem] } }
              : state.byId
            return { observations, byId, selectedObservation }
          })
        },
        request: () =>
          api.post<{ id: string; text: string; completed: boolean; sort_order: number }>(
            `/observations/${observationId}/checklist`,
            { text },
          ),
        reconcile: (row) => {
          // Swap the temp id for the server id.
          set((state) => {
            const swap = <T extends { id: string }>(list: T[] | undefined): T[] | undefined =>
              list?.map((i) => (i.id === tempId ? { ...i, id: row.id, completed: row.completed } : i))
            const observations = state.observations.map((obs) =>
              obs.id === observationId ? { ...obs, checklist: swap(obs.checklist) } : obs,
            )
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = { ...selectedObservation, checklist: swap(selectedObservation.checklist) }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, checklist: swap(previous.checklist) } }
              : state.byId
            return { observations, byId, selectedObservation }
          })
          newItem.id = row.id
          newItem.completed = row.completed
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add checklist item') })
      throw e
    }
    return newItem
  },

  editChecklistItem: async (observationId, itemId, newText, user) => {
    const state = get()
    const item = state.selectedObservation?.checklist?.find((i) => i.id === itemId)
      || state.byId[observationId]?.checklist?.find((i) => i.id === itemId)
    const oldText = item?.text || ''
    const itemUpdatedAt = (item as { updatedAt?: string } | undefined)?.updatedAt
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `Edited checklist item: "${oldText}" → "${newText}"`,
      descriptionAr: `تم تعديل عنصر قائمة التحقق: "${oldText}" ← "${newText}"`,
      descriptionKey: 'observations.detail.timeline.checklistEdited',
      descriptionParams: { oldText, newText },
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
      actionType: 'checklist_edit',
      targetId: itemId,
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<void>({
        context: 'observation.editChecklistItem',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const checklist = obs.checklist?.map((it) => (it.id === itemId ? { ...it, text: newText } : it))
              return { ...obs, checklist }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const checklist = selectedObservation.checklist?.map((it) =>
                it.id === itemId ? { ...it, text: newText } : it,
              )
              selectedObservation = {
                ...selectedObservation,
                checklist,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            return { observations, selectedObservation }
          })
        },
        request: async () => {
          // GAP-20 — skip server call for a non-persisted temp id.
          if (!isPersistedId(itemId)) return
          await api.patch(
            `/observations/${observationId}/checklist/${itemId}`,
            { text: newText },
            ifMatchHeader(itemUpdatedAt),
          )
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to edit checklist item') })
      throw e
    }
  },

  toggleChecklistItem: async (observationId, itemId, completed, user) => {
    const currentState = get()
    const obsFromArray = currentState.byId[observationId]
    const item = currentState.selectedObservation?.checklist?.find((i) => i.id === itemId)
      || obsFromArray?.checklist?.find((i) => i.id === itemId)
    const itemText = item?.text || 'item'
    const itemUpdatedAt = (item as { updatedAt?: string } | undefined)?.updatedAt
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: completed
        ? `Marked '${itemText}' as complete`
        : `Unmarked '${itemText}'`,
      descriptionAr: completed
        ? `تم تحديد '${itemText}' كمكتمل`
        : `تم إلغاء تحديد '${itemText}'`,
      descriptionKey: completed
        ? 'observations.detail.timeline.checklistMarkedComplete'
        : 'observations.detail.timeline.checklistUnmarked',
      descriptionParams: { item: itemText },
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
      actionType: 'checklist_update',
      targetId: itemId,
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<void>({
        context: 'observation.toggleChecklistItem',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const checklist = obs.checklist?.map((i) => (i.id === itemId ? { ...i, completed } : i))
              return { ...obs, checklist }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const checklist = selectedObservation.checklist?.map((i) =>
                i.id === itemId ? { ...i, completed } : i,
              )
              selectedObservation = {
                ...selectedObservation,
                checklist,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            // B2 fix: also update byId so the activity timeline reflects the
            // toggle immediately without a page refresh
            const prevByIdEntry = state.byId[observationId]
            const byId = prevByIdEntry
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...prevByIdEntry,
                    checklist: prevByIdEntry.checklist?.map((i) =>
                      i.id === itemId ? { ...i, completed } : i,
                    ),
                    timeline: [timelineEntry, ...(prevByIdEntry.timeline || [])],
                  },
                }
              : state.byId
            return { observations, selectedObservation, byId }
          })
        },
        request: async () => {
          if (!isPersistedId(itemId)) return
          await api.patch(
            `/observations/${observationId}/checklist/${itemId}`,
            { completed },
            ifMatchHeader(itemUpdatedAt),
          )
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to toggle checklist item') })
      throw e
    }
  },

  removeChecklistItem: async (observationId, itemId, itemText, user) => {
    const currentState = get()
    const item = currentState.selectedObservation?.checklist?.find((i) => i.id === itemId)
      || currentState.byId[observationId]?.checklist?.find((i) => i.id === itemId)
    const itemUpdatedAt = (item as { updatedAt?: string } | undefined)?.updatedAt
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `Removed checklist item${itemText ? `: "${itemText}"` : ''}`,
      descriptionAr: `تم حذف عنصر قائمة التحقق${itemText ? `: "${itemText}"` : ''}`,
      descriptionKey: 'observations.detail.timeline.checklistRemoved',
      descriptionParams: itemText ? { item: itemText } : undefined,
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
      actionType: 'checklist_delete',
      targetId: itemId,
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<void>({
        context: 'observation.removeChecklistItem',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              return { ...obs, checklist: obs.checklist?.filter((item) => item.id !== itemId) }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                checklist: selectedObservation.checklist?.filter((item) => item.id !== itemId),
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            return { observations, selectedObservation }
          })
        },
        request: async () => {
          if (!isPersistedId(itemId)) return
          await api.delete(
            `/observations/${observationId}/checklist/${itemId}`,
            ifMatchHeader(itemUpdatedAt),
          )
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to remove checklist item') })
      throw e
    }
  },

  // ---- workflow (leadership / closure / remediation) --------------------

  transferLeadership: async (observationId, newLeaderId, newLeaderName, currentUser) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'transferLeadership', id: observationId })
    // Wave-20.cleanup — canonical optimistic via the helper. The leader id
    // flips immediately so the sidebar re-renders; POST /assign carries the
    // parent's `If-Match` for the W17.2 atomic guard added in this pass.
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    const parentUpdatedAt = prevById?.updatedAt
    // O6a: capture old leader id so we keep them in assignees list after transfer.
    const oldLeaderId = prevById?.leaderId
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${currentUser.name} transferred leadership to ${newLeaderName}`,
      descriptionAr: `نقل ${currentUser.name} القيادة إلى ${newLeaderName}`,
      descriptionKey: 'observations.detail.timeline.leaderTransferred',
      descriptionParams: { from: currentUser.name, to: newLeaderName },
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      actionType: 'leader_transfer',
    }
    try {
      await optimisticMutation<void>({
        context: 'observation.transferLeadership',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            // O6a: ensure old leader stays in assignees after transfer.
            function ensureOldLeaderInAssignees(
              assignees: Observation['assignees'],
              prevObs: Observation | undefined,
            ): Observation['assignees'] {
              if (!oldLeaderId || !prevObs) return assignees ?? []
              const list = [...(assignees ?? [])]
              if (!list.some((a) => a.id === oldLeaderId)) {
                const oldLeaderMember =
                  prevObs.assignees?.find((a) => a.id === oldLeaderId) ??
                  (prevObs.leaderId === oldLeaderId
                    ? { id: oldLeaderId, name: currentUser.name, avatar: currentUser.avatar || currentUser.name, role: currentUser.role }
                    : null)
                if (oldLeaderMember) list.push(oldLeaderMember)
              }
              return list
            }

            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              return {
                ...obs,
                leaderId: newLeaderId,
                assignees: ensureOldLeaderInAssignees(obs.assignees, obs),
                timeline: [timelineEntry, ...(obs.timeline || [])],
              }
            })
            const previous = state.byId[observationId]
            const byId = previous
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...previous,
                    leaderId: newLeaderId,
                    assignees: ensureOldLeaderInAssignees(previous.assignees, previous),
                  },
                }
              : state.byId
            const selectedObservation = state.selectedObservation?.id === observationId
              ? {
                  ...state.selectedObservation,
                  leaderId: newLeaderId,
                  assignees: ensureOldLeaderInAssignees(
                    state.selectedObservation.assignees,
                    state.selectedObservation,
                  ),
                  timeline: [timelineEntry, ...(state.selectedObservation.timeline || [])],
                }
              : state.selectedObservation
            return { observations, byId, selectedObservation }
          })
        },
        request: async () => {
          // O6d: pass from/to names for i18n interpolation in the server timeline write.
          await api.post(
            `/observations/${observationId}/assign`,
            {
              leader_id: newLeaderId,
              from_leader_name: currentUser.name,
              to_leader_name: newLeaderName,
            },
            ifMatchHeader(parentUpdatedAt),
          )
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to transfer leadership') })
      throw e
    }
  },

  submitRemediationPlan: async (observationId, plan, submitter, observationLeaderId) => {
    // Wave-20.cleanup — canonical optimistic via the helper. The plan is
    // inserted with a temp id; on success we swap the temp for the server
    // id; on failure we revert + raise the keyed toast.
    const isLeader = observationLeaderId && submitter.id === observationLeaderId
    const planStatus = isLeader ? 'approved' : 'submitted'
    const tempPlanId = newTempId('temp-plan')
    const optimisticPlan: RemediationPlan = {
      ...plan,
      id: tempPlanId,
      status: planStatus,
      submittedAt: new Date().toISOString(),
      submittedBy: submitter.id,
      createdAt: new Date().toISOString(),
      ...(isLeader && {
        reviewedAt: new Date().toISOString(),
        reviewedBy: submitter.id,
      }),
    }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: isLeader
        ? `${submitter.name} submitted and auto-approved remediation plan`
        : `${submitter.name} submitted a remediation plan`,
      descriptionAr: isLeader
        ? `قدّم ${submitter.name} خطة المعالجة ووافق عليها تلقائياً`
        : `قدّم ${submitter.name} خطة المعالجة`,
      descriptionKey: isLeader
        ? 'observations.detail.timeline.remediationAutoApproved'
        : 'observations.detail.timeline.remediationSubmitted',
      descriptionParams: { name: submitter.name },
      userId: submitter.id,
      userName: submitter.name,
      userAvatar: submitter.avatar,
      actionType: isLeader ? 'remediation_approved' : 'remediation_submitted',
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    try {
      await optimisticMutation<{ id: string }>({
        context: 'observation.submitRemediationPlan',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const newStatus = isLeader && obs.status === 'open' ? 'in_progress' : obs.status
              return { ...obs, remediationPlan: optimisticPlan, status: newStatus }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const newStatus = isLeader && selectedObservation.status === 'open' ? 'in_progress' : selectedObservation.status
              selectedObservation = {
                ...selectedObservation,
                remediationPlan: optimisticPlan,
                status: newStatus,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            return { observations, selectedObservation }
          })
        },
        request: () =>
          api.post<{ id: string }>(`/observations/${observationId}/remediation`, {
            title: plan.title,
            description: plan.description,
            due_date: plan.dueDate,
          }),
        reconcile: (row) => {
          // Swap the temp plan id for the server id.
          set((state) => {
            const swapPlanId = (p: RemediationPlan | undefined): RemediationPlan | undefined =>
              p && p.id === tempPlanId ? { ...p, id: row.id } : p
            const observations = state.observations.map((obs) =>
              obs.id === observationId ? { ...obs, remediationPlan: swapPlanId(obs.remediationPlan) } : obs,
            )
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = { ...selectedObservation, remediationPlan: swapPlanId(selectedObservation.remediationPlan) }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, remediationPlan: swapPlanId(previous.remediationPlan) } }
              : state.byId
            return { observations, byId, selectedObservation }
          })
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to submit remediation plan') })
      throw e
    }
  },

  // PATCH /api/observations/[id]/remediation/[planId]. Wave-20.cleanup —
  // canonical `optimisticMutation` lifecycle. The plan is stamped locally
  // immediately; on success we reconcile with the server row; on failure
  // we restore the entity-granular snapshot.
  reviewRemediationPlan: async (observationId, approved, reviewer, notes) => {
    const observation = get().byId[observationId]
    if (!observation?.remediationPlan) return
    const plan = observation.remediationPlan
    // Entity-granular snapshot (Wave-11).
    const prevByIdRow = get().byId[observationId]
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const optimisticPlan: RemediationPlan = {
      ...plan,
      status: approved ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer.id,
      reviewNotes: notes,
    }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: approved
        ? `${reviewer.name} approved the remediation plan`
        : `${reviewer.name} rejected the remediation plan`,
      descriptionAr: approved
        ? `وافق ${reviewer.name} على خطة المعالجة`
        : `رفض ${reviewer.name} خطة المعالجة`,
      descriptionKey: approved
        ? 'observations.detail.timeline.remediationApproved'
        : 'observations.detail.timeline.remediationRejected',
      descriptionParams: { name: reviewer.name },
      userId: reviewer.id,
      userName: reviewer.name,
      userAvatar: reviewer.avatar,
      actionType: approved ? 'remediation_approved' : 'remediation_rejected',
    }
    // §2.12 — thread the parent's `updatedAt` (the plan row has no
    // `updated_at` column; server falls back to the parent token).
    const parentUpdatedAt = prevByIdRow?.updatedAt
    try {
      await optimisticMutation<{
        id: string
        status: string
        reviewed_at: string | null
        reviewed_by: string | null
        review_notes: string | null
      }>({
        context: 'observation.reviewRemediationPlan',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const newStatus = approved && obs.status === 'open' ? 'in_progress' : obs.status
              return { ...obs, remediationPlan: optimisticPlan, status: newStatus }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const newStatus = approved && selectedObservation.status === 'open' ? 'in_progress' : selectedObservation.status
              selectedObservation = {
                ...selectedObservation,
                remediationPlan: optimisticPlan,
                status: newStatus,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            const byId = prevByIdRow
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...prevByIdRow,
                    remediationPlan: optimisticPlan,
                    status: approved && prevByIdRow.status === 'open' ? 'in_progress' : prevByIdRow.status,
                  },
                }
              : state.byId
            return { observations, byId, selectedObservation, isMutating: true, error: null }
          })
        },
        request: () => {
          // GAP-20 — skip server call for a non-persisted temp id (e.g. a
          // remediation plan still in its temp state from submitRemediationPlan).
          if (!isPersistedId(plan.id)) {
            return Promise.resolve({
              id: plan.id,
              status: approved ? 'approved' : 'rejected',
              reviewed_at: optimisticPlan.reviewedAt ?? null,
              reviewed_by: optimisticPlan.reviewedBy ?? null,
              review_notes: optimisticPlan.reviewNotes ?? null,
            })
          }
          return api.patch(
            `/observations/${observationId}/remediation/${plan.id}`,
            { approved, ...(notes !== undefined ? { notes } : {}) },
            ifMatchHeader(parentUpdatedAt),
          )
        },
        reconcile: (row) => {
          const reconciled: RemediationPlan = {
            ...optimisticPlan,
            status: row.status as RemediationPlan['status'],
            reviewedAt: row.reviewed_at ?? optimisticPlan.reviewedAt,
            reviewedBy: row.reviewed_by ?? optimisticPlan.reviewedBy,
            reviewNotes: row.review_notes ?? optimisticPlan.reviewNotes,
          }
          set((state) => {
            const observations = state.observations.map((obs) =>
              obs.id === observationId ? { ...obs, remediationPlan: reconciled } : obs,
            )
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = { ...selectedObservation, remediationPlan: reconciled }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, remediationPlan: reconciled } }
              : state.byId
            return { observations, byId, selectedObservation, isMutating: false }
          })
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevByIdRow ? prevByIdRow : o)),
            byId: prevByIdRow ? { ...state.byId, [observationId]: prevByIdRow } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
            isMutating: false,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to review remediation plan') })
      throw e
    }
  },

  requestClosure: async (observationId, requester, notes) => {
    // Wave-20.cleanup — canonical optimistic via the helper.
    const closureRequest: ClosureRequest = {
      requestedAt: new Date().toISOString(),
      requestedBy: requester.id,
      requestedByName: requester.name,
      notes,
    }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${requester.name} requested closure`,
      descriptionAr: `طلب ${requester.name} إغلاق الملاحظة`,
      descriptionKey: 'observations.detail.timeline.closureRequested',
      descriptionParams: { name: requester.name },
      userId: requester.id,
      userName: requester.name,
      userAvatar: requester.avatar,
      actionType: 'status_change',
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    const parentUpdatedAt = prevById?.updatedAt
    try {
      await optimisticMutation<void>({
        context: 'observation.requestClosure',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              return {
                ...obs,
                status: 'resolved' as const,
                closureRequest,
                closureReview: undefined,
                timeline: [timelineEntry, ...(obs.timeline || [])],
              }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                status: 'resolved' as const,
                closureRequest,
                closureReview: undefined,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            return { observations, selectedObservation }
          })
        },
        request: async () => {
          // /close transitions status to 'closed' on the server; the legacy UI
          // flow expected status='resolved' (pending review). The status is
          // re-set locally in apply() so the modal renders Pending Review.
          await api.post(
            `/observations/${observationId}/close`,
            { notes },
            ifMatchHeader(parentUpdatedAt),
          )
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to request closure') })
      throw e
    }
  },

  reviewClosure: async (observationId, approved, reviewer, notes) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: `reviewClosure:${approved ? 'approved' : 'rejected'}`, id: observationId })
    // Wave-20.cleanup — canonical optimistic via the helper.
    const closureReview: ClosureReview = {
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer.id,
      reviewedByName: reviewer.name,
      approved,
      notes,
    }
    const newStatus = approved ? 'closed' : 'in_progress'
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: approved
        ? `${reviewer.name} approved closure`
        : `${reviewer.name} rejected closure request`,
      descriptionAr: approved
        ? `وافق ${reviewer.name} على إغلاق الملاحظة`
        : `رفض ${reviewer.name} طلب الإغلاق`,
      descriptionKey: approved
        ? 'observations.detail.timeline.closureApproved'
        : 'observations.detail.timeline.closureRejected',
      descriptionParams: { name: reviewer.name },
      userId: reviewer.id,
      userName: reviewer.name,
      userAvatar: reviewer.avatar,
      actionType: 'status_change',
    }
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    const prevById = get().byId[observationId]
    const parentUpdatedAt = prevById?.updatedAt
    try {
      await optimisticMutation<void>({
        context: 'observation.reviewClosure',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              return {
                ...obs,
                status: newStatus as 'closed' | 'in_progress',
                closureReview,
                closureRequest: approved ? obs.closureRequest : undefined,
                timeline: [timelineEntry, ...(obs.timeline || [])],
              }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                status: newStatus as 'closed' | 'in_progress',
                closureReview,
                closureRequest: approved ? selectedObservation.closureRequest : undefined,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            return { observations, selectedObservation }
          })
        },
        request: async () => {
          if (approved) {
            await api.patch(
              `/observations/${observationId}`,
              { status: 'closed' },
              ifMatchHeader(parentUpdatedAt),
            )
          } else {
            await api.post(
              `/observations/${observationId}/reopen`,
              undefined,
              ifMatchHeader(parentUpdatedAt),
            )
          }
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevById ? prevById : o)),
            byId: prevById ? { ...state.byId, [observationId]: prevById } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to review closure') })
      throw e
    }
  },

  // ---- documents ---------------------------------------------------------

  addDocument: async (observationId, doc, uploader, addToRemediationPlan) => {
    // Wave-20.cleanup — canonical optimistic via the helper. Entity-granular
    // snapshot (Wave-11): just the affected observation slot is restored on
    // failure.
    const tempId = newTempId('temp-doc')
    const optimisticDocument = { id: tempId, name: doc.name, type: doc.type }
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: addToRemediationPlan
        ? `${uploader.name} uploaded remediation document: ${doc.name}`
        : `${uploader.name} uploaded a document: ${doc.name}`,
      descriptionAr: addToRemediationPlan
        ? `${uploader.name} رفع مستند معالجة: ${doc.name}`
        : `رفع ${uploader.name} مستند: ${doc.name}`,
      descriptionKey: addToRemediationPlan
        ? 'observations.detail.timeline.remediationDocumentUploaded'
        : 'observations.detail.timeline.documentUploaded',
      descriptionParams: { name: uploader.name, document: doc.name },
      userId: uploader.id,
      userName: uploader.name,
      userAvatar: uploader.avatar,
      actionType: 'document_add',
    }
    // Entity-granular snapshot for rollback (Wave-11).
    const prevByIdRow = get().byId[observationId]
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    try {
      await optimisticMutation<{ id: string; name: string; type: 'pdf' | 'image' | 'doc' }>({
        context: 'observation.addDocument',
        errorMessage: revertMessage,
        apply: () => {
    set((state) => {
      const observations = state.observations.map((obs) => {
        if (obs.id !== observationId) return obs
        const documents = [...(obs.documents || []), optimisticDocument]
        let remediationPlan = obs.remediationPlan
        if (addToRemediationPlan) {
          if (remediationPlan) {
            remediationPlan = {
              ...remediationPlan,
              documents: [...(remediationPlan.documents || []), optimisticDocument],
            }
          } else {
            remediationPlan = {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              dueDate: obs.dueDate || new Date().toISOString(),
              status: 'draft' as const,
              documents: [optimisticDocument],
              createdAt: new Date().toISOString(),
            }
          }
        }
        return { ...obs, documents, remediationPlan }
      })
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const documents = [...(selectedObservation.documents || []), optimisticDocument]
        let remediationPlan = selectedObservation.remediationPlan
        if (addToRemediationPlan) {
          if (remediationPlan) {
            remediationPlan = {
              ...remediationPlan,
              documents: [...(remediationPlan.documents || []), optimisticDocument],
            }
          } else {
            remediationPlan = {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              dueDate: selectedObservation.dueDate || new Date().toISOString(),
              status: 'draft' as const,
              documents: [optimisticDocument],
              createdAt: new Date().toISOString(),
            }
          }
        }
        selectedObservation = {
          ...selectedObservation,
          documents,
          remediationPlan,
          timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
        }
      }
      const byId = prevByIdRow
        ? {
            ...state.byId,
            [observationId]: {
              ...prevByIdRow,
              documents: [...(prevByIdRow.documents || []), optimisticDocument],
            },
          }
        : state.byId
      return { observations, byId, selectedObservation, isMutating: true, error: null }
    })
        },
        request: () =>
          api.post<{ id: string; name: string; type: 'pdf' | 'image' | 'doc' }>(
            `/observations/${observationId}/evidence`,
            {
              name: doc.name,
              type: doc.type,
              storage_path: doc.storage_path ?? `observations/${observationId}/${doc.name}`,
            },
          ),
        reconcile: (row) => {
          // Swap the temp id for the server id everywhere it appears.
          const swapId = <T extends { id: string }>(list: T[] | undefined): T[] | undefined =>
            list?.map((d) => (d.id === tempId ? { ...d, id: row.id } : d))
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              return {
                ...obs,
                documents: swapId(obs.documents),
                remediationPlan: obs.remediationPlan
                  ? { ...obs.remediationPlan, documents: swapId(obs.remediationPlan.documents) }
                  : obs.remediationPlan,
              }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              selectedObservation = {
                ...selectedObservation,
                documents: swapId(selectedObservation.documents),
                remediationPlan: selectedObservation.remediationPlan
                  ? {
                      ...selectedObservation.remediationPlan,
                      documents: swapId(selectedObservation.remediationPlan.documents),
                    }
                  : selectedObservation.remediationPlan,
              }
            }
            const previous = state.byId[observationId]
            const byId = previous
              ? { ...state.byId, [observationId]: { ...previous, documents: swapId(previous.documents) } }
              : state.byId
            return { observations, byId, selectedObservation, isMutating: false }
          })
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevByIdRow ? prevByIdRow : o)),
            byId: prevByIdRow ? { ...state.byId, [observationId]: prevByIdRow } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
            isMutating: false,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add document') })
      // addDocument historically did not throw — keep the call-site contract
      // intact (callers don't await/handle a rejection here).
    }
  },

  // DELETE /api/observations/[id]/evidence/[docId]. Wave-20.cleanup —
  // canonical `optimisticMutation` lifecycle. Skips the server DELETE for a
  // non-persisted temp id.
  removeDocument: async (observationId, documentId, documentName, user) => {
    const timelineEntry: ObservationTimelineEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      dateKey: 'today',
      description: `${user.name} deleted document: ${documentName}`,
      descriptionAr: `${user.name} حذف مستند: ${documentName}`,
      descriptionKey: 'observations.detail.timeline.documentDeleted',
      descriptionParams: { name: user.name, document: documentName },
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar,
      actionType: 'document_delete',
      targetId: documentId,
    }
    // Entity-granular snapshot (Wave-11).
    const prevByIdRow = get().byId[observationId]
    const prevSelected = get().selectedObservation?.id === observationId ? get().selectedObservation : null
    // §2.12 — capture document's last-known updatedAt if available.
    const docRecord = prevByIdRow?.documents?.find((d) => d.id === documentId)
    const docUpdatedAt = (docRecord as { updatedAt?: string } | undefined)?.updatedAt
    try {
      await optimisticMutation<void>({
        context: 'observation.removeDocument',
        errorMessage: revertMessage,
        apply: () => {
          set((state) => {
            const observations = state.observations.map((obs) => {
              if (obs.id !== observationId) return obs
              const documents = (obs.documents || []).filter((doc) => doc.id !== documentId)
              let remediationPlan = obs.remediationPlan
              if (remediationPlan?.documents) {
                remediationPlan = {
                  ...remediationPlan,
                  documents: remediationPlan.documents.filter((doc) => doc.id !== documentId),
                }
              }
              return { ...obs, documents, remediationPlan }
            })
            let selectedObservation = state.selectedObservation
            if (selectedObservation?.id === observationId) {
              const documents = (selectedObservation.documents || []).filter((doc) => doc.id !== documentId)
              let remediationPlan = selectedObservation.remediationPlan
              if (remediationPlan?.documents) {
                remediationPlan = {
                  ...remediationPlan,
                  documents: remediationPlan.documents.filter((doc) => doc.id !== documentId),
                }
              }
              selectedObservation = {
                ...selectedObservation,
                documents,
                remediationPlan,
                timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
              }
            }
            const byId = prevByIdRow
              ? {
                  ...state.byId,
                  [observationId]: {
                    ...prevByIdRow,
                    documents: (prevByIdRow.documents || []).filter((d) => d.id !== documentId),
                  },
                }
              : state.byId
            return { observations, byId, selectedObservation, isMutating: true, error: null }
          })
        },
        request: async () => {
          // GAP-20 — skip server DELETE for a non-persisted temp id.
          if (!isPersistedId(documentId)) return
          await api.delete(
            `/observations/${observationId}/evidence/${documentId}`,
            ifMatchHeader(docUpdatedAt),
          )
        },
        reconcile: () => {
          set({ isMutating: false })
        },
        revert: () => {
          set((state) => ({
            observations: state.observations.map((o) => (o.id === observationId && prevByIdRow ? prevByIdRow : o)),
            byId: prevByIdRow ? { ...state.byId, [observationId]: prevByIdRow } : state.byId,
            selectedObservation:
              state.selectedObservation?.id === observationId && prevSelected
                ? prevSelected
                : state.selectedObservation,
            isMutating: false,
          }))
        },
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to remove document') })
      // Historic call-site contract: no throw.
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (observation) => set({ selectedObservation: observation }),
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
  isDetailLoaded: (id) => Boolean(get().detailLoadedIds[id]),
  clearError: () => set({ error: null }),
}))
