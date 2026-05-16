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
  created_at: string
  updated_at: string
}

interface ObservationTimelineRow {
  id: string
  observation_id: string
  date: string
  description: string
  description_ar: string | null
  action_type: string
  user_id: string | null
  user_name: string | null
  target_id: string | null
  metadata: unknown
}

function mapTimelineRow(row: ObservationTimelineRow): ObservationTimelineEntry {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    descriptionAr: row.description_ar ?? undefined,
    userId: row.user_id ?? undefined,
    userName: row.user_name ?? undefined,
    actionType: row.action_type as ObservationTimelineEntry['actionType'],
    targetId: row.target_id ?? undefined,
  }
}

function mapRow(row: ObservationApiRow, previous?: Observation): Observation {
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
    checklist: previous?.checklist,
    updates: previous?.updates,
    documents: previous?.documents,
    timeline: previous?.timeline,
    creatorId: row.creator_id ?? previous?.creatorId,
    leaderId: row.leader_id ?? previous?.leaderId,
    remediationPlan: previous?.remediationPlan,
    closureRequest: previous?.closureRequest,
    closureReview: previous?.closureReview,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(
  data: Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>,
  reference: string,
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
    reference,
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
  byId: Record<string, Observation>
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

  fetchAll: () => Promise<void>
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

  getNextReference: () => string
  setFilters: (filters: ObservationFilters) => void
  clearFilters: () => void
  setSelected: (observation: ObservationWithComments | null) => void
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

  fetchAll: async () => {
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
      const byId: Record<string, Observation> = {}
      for (const o of observations) byId[o.id] = o
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
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<ObservationApiRow>(`/observations/${id}`)
      const previous = get().byId[id]
      const observation = mapRow(row, previous)
      set((s) => ({
        byId: { ...s.byId, [id]: observation },
        observations: s.observations.some((o) => o.id === id)
          ? s.observations.map((o) => (o.id === id ? observation : o))
          : s.observations,
        selectedObservation: observation as ObservationWithComments,
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
    set({ isMutating: true, error: null })
    try {
      const reference = data.reference || get().getNextReference()
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
      const row = await api.post<ObservationApiRow>('/observations', toCreatePayload({ ...data, reference }, reference))
      const created = mapRow(row)
      created.assignees = assignees
      created.documents = data.documents || []
      created.creatorId = creator?.id
      created.leaderId = created.leaderId ?? creator?.id
      set((s) => ({
        observations: [created, ...s.observations],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      void get().fetchAll()
      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create observation'), isMutating: false })
      throw e
    }
  },

  update: async (id, data, editor) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'update', id })
    set({ isMutating: true, error: null })
    try {
      const payload = toUpdatePayload(data)
      // Some fields the legacy code patched (assignees, remediationPlan,
      // checklist, documents) aren't accepted by the PATCH route. Send only the
      // top-level scalars; nested arrays stay local for now.
      const row = Object.keys(payload).length > 0
        ? await api.patch<ObservationApiRow>(`/observations/${id}`, payload)
        : (await api.get<ObservationApiRow>(`/observations/${id}`))
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      // Re-apply patches that the API doesn't accept yet.
      if (data.assignees !== undefined) updated.assignees = data.assignees
      if (data.assignee !== undefined) updated.assignee = data.assignee
      if (data.documents !== undefined) updated.documents = data.documents
      if (data.checklist !== undefined) updated.checklist = data.checklist
      if (data.updates !== undefined) updated.updates = data.updates
      if (data.remediationPlan !== undefined) updated.remediationPlan = data.remediationPlan

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
      updated.timeline = [...timelineEntries, ...(previous?.timeline || [])]

      set((s) => ({
        observations: s.observations.map((o) => (o.id === id ? updated : o)),
        byId: { ...s.byId, [id]: updated },
        selectedObservation:
          s.selectedObservation?.id === id
            ? ({ ...s.selectedObservation, ...updated } as ObservationWithComments)
            : s.selectedObservation,
        isMutating: false,
      }))

      return updated
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update observation'), isMutating: false })
      throw e
    }
  },

  delete: async (id) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'delete', id })
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/observations/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        return {
          observations: s.observations.filter((o) => o.id !== id),
          byId: rest,
          selectedObservation: s.selectedObservation?.id === id ? null : s.selectedObservation,
          isMutating: false,
        }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete observation'), isMutating: false })
      throw e
    }
  },

  // ---- comments ----------------------------------------------------------
  // POST /comments is wired. PATCH/DELETE per-comment endpoints don't exist
  // yet — those edits stay local-only with a timeline entry.

  addComment: async (observationId, content, author) => {
    try {
      const created = await api.post<{
        id: string
        observation_id: string
        author_id: string
        text: string
        is_edited: boolean
        edited_at: string | null
        created_at: string
      }>(`/observations/${observationId}/comments`, { text: content })
      const newComment: Comment = {
        id: created.id,
        content,
        author,
        createdAt: created.created_at,
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
            comments: [...existingComments, newComment],
            timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
          }
        }
        const previous = state.byId[observationId]
        const byId = previous
          ? { ...state.byId, [observationId]: { ...previous, timeline: [timelineEntry, ...(previous.timeline || [])] } }
          : state.byId
        return { observations, byId, selectedObservation }
      })
      return newComment
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add comment') })
      throw e
    }
  },

  // TODO(Phase 6): wire PATCH /api/observations/[id]/comments/[commentId].
  editComment: async (observationId, commentId, newText, editor) => {
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
    set((state) => {
      if (state.selectedObservation?.id === observationId) {
        const updates = state.selectedObservation.updates?.map((update) =>
          update.id === commentId
            ? { ...update, text: newText, isEdited: true, editedAt: new Date().toISOString() }
            : update,
        )
        return {
          selectedObservation: {
            ...state.selectedObservation,
            updates,
            timeline: [timelineEntry, ...(state.selectedObservation.timeline || [])],
          },
        }
      }
      return state
    })
  },

  // TODO(Phase 6): wire DELETE /api/observations/[id]/comments/[commentId].
  deleteComment: async (observationId, commentId, deleter) => {
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
    set((state) => {
      if (state.selectedObservation?.id === observationId) {
        const updates = state.selectedObservation.updates?.filter(
          (update) => update.id !== commentId,
        )
        return {
          selectedObservation: {
            ...state.selectedObservation,
            updates,
            timeline: [timelineEntry, ...(state.selectedObservation.timeline || [])],
          },
        }
      }
      return state
    })
  },

  // ---- checklist ---------------------------------------------------------
  // POST and PATCH/DELETE per-item endpoints exist. We wire add and toggle to
  // the server; edit and remove also call the API.

  addChecklistItem: async (observationId, text, user) => {
    const newItem: ChecklistItem = { id: crypto.randomUUID(), text, completed: false }
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
      targetId: newItem.id,
    }
    try {
      const row = await api.post<{ id: string; text: string; completed: boolean; sort_order: number }>(
        `/observations/${observationId}/checklist`,
        { text },
      )
      newItem.id = row.id
      newItem.completed = row.completed
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add checklist item') })
    }
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
    return newItem
  },

  editChecklistItem: async (observationId, itemId, newText, user) => {
    const state = get()
    const item = state.selectedObservation?.checklist?.find((i) => i.id === itemId)
      || state.byId[observationId]?.checklist?.find((i) => i.id === itemId)
    const oldText = item?.text || ''
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
    try {
      await api.patch(`/observations/${observationId}/checklist/${itemId}`, { text: newText })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to edit checklist item') })
    }
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

  toggleChecklistItem: async (observationId, itemId, completed, user) => {
    const currentState = get()
    const obsFromArray = currentState.byId[observationId]
    const item = currentState.selectedObservation?.checklist?.find((i) => i.id === itemId)
      || obsFromArray?.checklist?.find((i) => i.id === itemId)
    const itemText = item?.text || 'item'
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
    try {
      await api.patch(`/observations/${observationId}/checklist/${itemId}`, { completed })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to toggle checklist item') })
    }
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
      return { observations, selectedObservation }
    })
  },

  removeChecklistItem: async (observationId, itemId, itemText, user) => {
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
    try {
      await api.delete(`/observations/${observationId}/checklist/${itemId}`)
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to remove checklist item') })
    }
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

  // ---- workflow (leadership / closure / remediation) --------------------

  transferLeadership: async (observationId, newLeaderId, newLeaderName, currentUser) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: 'transferLeadership', id: observationId })
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
      await api.post(`/observations/${observationId}/assign`, { leader_id: newLeaderId })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to transfer leadership') })
    }
    set((state) => {
      const currentChecklist = state.selectedObservation?.checklist
      const currentDocuments = state.selectedObservation?.documents
      const currentRemediationPlan = state.selectedObservation?.remediationPlan
      const observations = state.observations.map((obs) =>
        obs.id === observationId
          ? {
              ...obs,
              leaderId: newLeaderId,
              timeline: [timelineEntry, ...(obs.timeline || [])],
              checklist: currentChecklist || obs.checklist,
              documents: currentDocuments || obs.documents,
              remediationPlan: currentRemediationPlan || obs.remediationPlan,
            }
          : obs,
      )
      const previous = state.byId[observationId]
      const byId = previous
        ? { ...state.byId, [observationId]: { ...previous, leaderId: newLeaderId } }
        : state.byId
      const selectedObservation = state.selectedObservation?.id === observationId
        ? {
            ...state.selectedObservation,
            leaderId: newLeaderId,
            timeline: [timelineEntry, ...(state.selectedObservation.timeline || [])],
            comments: state.selectedObservation.comments,
            checklist: state.selectedObservation.checklist,
            documents: state.selectedObservation.documents,
            remediationPlan: state.selectedObservation.remediationPlan,
          }
        : state.selectedObservation
      return { observations, byId, selectedObservation }
    })
  },

  submitRemediationPlan: async (observationId, plan, submitter, observationLeaderId) => {
    const isLeader = observationLeaderId && submitter.id === observationLeaderId
    const planStatus = isLeader ? 'approved' : 'submitted'
    let serverPlanId = crypto.randomUUID()
    try {
      const row = await api.post<{ id: string }>(`/observations/${observationId}/remediation`, {
        title: plan.title,
        description: plan.description,
        due_date: plan.dueDate,
      })
      serverPlanId = row.id
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to submit remediation plan') })
    }
    const newPlan: RemediationPlan = {
      ...plan,
      id: serverPlanId,
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
    set((state) => {
      const observations = state.observations.map((obs) => {
        if (obs.id !== observationId) return obs
        const newStatus = isLeader && obs.status === 'open' ? 'in_progress' : obs.status
        return { ...obs, remediationPlan: newPlan, status: newStatus }
      })
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const newStatus = isLeader && selectedObservation.status === 'open' ? 'in_progress' : selectedObservation.status
        selectedObservation = {
          ...selectedObservation,
          remediationPlan: newPlan,
          status: newStatus,
          timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
        }
      }
      return { observations, selectedObservation }
    })
  },

  // TODO(Phase 6): wire PATCH /api/observations/[id]/remediation/[planId] review endpoint.
  reviewRemediationPlan: async (observationId, approved, reviewer, notes) => {
    const observation = get().byId[observationId]
    if (!observation?.remediationPlan) return
    const updatedPlan: RemediationPlan = {
      ...observation.remediationPlan,
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
    set((state) => {
      const observations = state.observations.map((obs) => {
        if (obs.id !== observationId) return obs
        const newStatus = approved && obs.status === 'open' ? 'in_progress' : obs.status
        return { ...obs, remediationPlan: updatedPlan, status: newStatus }
      })
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const newStatus = approved && selectedObservation.status === 'open' ? 'in_progress' : selectedObservation.status
        selectedObservation = {
          ...selectedObservation,
          remediationPlan: updatedPlan,
          status: newStatus,
          timeline: [timelineEntry, ...(selectedObservation.timeline || [])],
        }
      }
      return { observations, selectedObservation }
    })
  },

  requestClosure: async (observationId, requester, notes) => {
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
    try {
      // /close transitions status to 'closed' on the server; the legacy UI
      // flow expected status='resolved' (pending review). We post then immediately
      // re-set status locally so the modal renders the "Pending Review" state.
      await api.post(`/observations/${observationId}/close`, { notes })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to request closure') })
    }
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

  reviewClosure: async (observationId, approved, reviewer, notes) => {
    requirePermission('Manage Audit Findings', { storeName: 'observation', actionName: `reviewClosure:${approved ? 'approved' : 'rejected'}`, id: observationId })
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
    try {
      if (approved) {
        // Already closed server-side via requestClosure; ensure it stays closed.
        await api.patch(`/observations/${observationId}`, { status: 'closed' })
      } else {
        await api.post(`/observations/${observationId}/reopen`)
      }
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to review closure') })
    }
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

  // ---- documents ---------------------------------------------------------

  addDocument: async (observationId, doc, uploader, addToRemediationPlan) => {
    const newDocument = {
      id: crypto.randomUUID(),
      name: doc.name,
      type: doc.type,
    }
    try {
      const row = await api.post<{ id: string; name: string; type: 'pdf' | 'image' | 'doc' }>(
        `/observations/${observationId}/evidence`,
        {
          name: doc.name,
          type: doc.type,
          storage_path: doc.storage_path ?? `observations/${observationId}/${doc.name}`,
        },
      )
      newDocument.id = row.id
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add document') })
    }
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
    set((state) => {
      const observations = state.observations.map((obs) => {
        if (obs.id !== observationId) return obs
        const documents = [...(obs.documents || []), newDocument]
        let remediationPlan = obs.remediationPlan
        if (addToRemediationPlan) {
          if (remediationPlan) {
            remediationPlan = {
              ...remediationPlan,
              documents: [...(remediationPlan.documents || []), newDocument],
            }
          } else {
            remediationPlan = {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              dueDate: obs.dueDate || new Date().toISOString(),
              status: 'draft' as const,
              documents: [newDocument],
              createdAt: new Date().toISOString(),
            }
          }
        }
        return { ...obs, documents, remediationPlan }
      })
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const documents = [...(selectedObservation.documents || []), newDocument]
        let remediationPlan = selectedObservation.remediationPlan
        if (addToRemediationPlan) {
          if (remediationPlan) {
            remediationPlan = {
              ...remediationPlan,
              documents: [...(remediationPlan.documents || []), newDocument],
            }
          } else {
            remediationPlan = {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              dueDate: selectedObservation.dueDate || new Date().toISOString(),
              status: 'draft' as const,
              documents: [newDocument],
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
      return { observations, selectedObservation }
    })
  },

  // TODO(Phase 6): wire DELETE /api/observations/[id]/evidence/[docId] (the route exists).
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
    try {
      await api.delete(`/observations/${observationId}/evidence/${documentId}`)
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to remove document') })
    }
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
      return { observations, selectedObservation }
    })
  },

  getNextReference: () => {
    const year = new Date().getFullYear()
    const existingRefs = get().observations
      .map((obs) => obs.reference)
      .filter((ref) => ref && ref.startsWith(`OBS-${year}-`))
      .map((ref) => parseInt(ref.split('-')[2], 10))
      .filter((n) => !isNaN(n))
    const nextNumber = existingRefs.length > 0 ? Math.max(...existingRefs) + 1 : 1
    return `OBS-${year}-${String(nextNumber).padStart(4, '0')}`
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
  clearError: () => set({ error: null }),
}))
