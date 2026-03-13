import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Observation, ObservationFilters, PaginationState, SortState, Comment, User, ObservationTimelineEntry, RemediationPlan, ClosureRequest, ClosureReview } from '@/types'

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

interface ObservationState {
  observations: Observation[]
  selectedObservation: ObservationWithComments | null
  filters: ObservationFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Observation | null>
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
  submitRemediationPlan: (observationId: string, plan: Omit<RemediationPlan, 'id' | 'status' | 'createdAt' | 'submittedAt' | 'submittedBy'>, submitter: User, observationLeaderId?: string) => Promise<void>
  reviewRemediationPlan: (observationId: string, approved: boolean, reviewer: User, notes?: string) => Promise<void>
  requestClosure: (observationId: string, requester: User, notes?: string) => Promise<void>
  reviewClosure: (observationId: string, approved: boolean, reviewer: User, notes?: string) => Promise<void>
  addDocument: (observationId: string, document: { name: string; type: 'pdf' | 'image' | 'doc' }, uploader: User, addToRemediationPlan?: boolean) => Promise<void>
  removeDocument: (observationId: string, documentId: string, documentName: string, user: User) => Promise<void>
  getNextReference: () => string
  setFilters: (filters: ObservationFilters) => void
  clearFilters: () => void
  setSelected: (observation: ObservationWithComments | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

const seedObservations: Observation[] = [
  {
    id: 'OBS-2026-0001',
    title: 'Incomplete KYC Documentation',
    description: 'Several corporate accounts found with incomplete KYC records during routine review.',
    source: 'sama',
    severity: 'high',
    status: 'open',
    dueDate: '2026-04-15',
    department: 'Compliance',
    reference: 'OBS-2026-0001',
    assignee: { id: '1', name: 'Sarah Connor', avatar: 'Sarah Connor', role: 'officer' },
    assignees: [
      { id: '1', name: 'Sarah Connor', avatar: 'Sarah Connor', role: 'officer' },
      { id: '2', name: 'Ahmed Khan', avatar: 'Ahmed Khan', role: 'manager' },
    ],
    leaderId: '1',
    createdAt: '2026-02-10T08:00:00.000Z',
    updatedAt: '2026-03-01T10:30:00.000Z',
  },
  {
    id: 'OBS-2026-0002',
    title: 'Cybersecurity Penetration Test Gaps',
    description: 'Quarterly penetration test revealed unpatched vulnerabilities in internal banking portal.',
    source: 'internal',
    severity: 'critical',
    status: 'in_progress',
    dueDate: '2026-03-30',
    department: 'IT & Cybersecurity',
    reference: 'OBS-2026-0002',
    assignee: { id: '4', name: 'Michael Scott', avatar: 'Michael Scott', role: 'officer' },
    assignees: [
      { id: '4', name: 'Michael Scott', avatar: 'Michael Scott', role: 'officer' },
    ],
    leaderId: '4',
    createdAt: '2026-01-20T09:00:00.000Z',
    updatedAt: '2026-02-28T14:00:00.000Z',
  },
  {
    id: 'OBS-2026-0003',
    title: 'Sharia Board Resolution Tracking',
    description: 'Sharia compliance audit identified gaps in tracking board resolutions and their implementation status.',
    source: 'sharia',
    severity: 'medium',
    status: 'open',
    dueDate: '2026-05-01',
    department: 'Compliance',
    reference: 'OBS-2026-0003',
    assignee: { id: '5', name: 'Dr. Hassan Ali', avatar: 'Dr. Hassan Ali', role: 'manager' },
    assignees: [
      { id: '5', name: 'Dr. Hassan Ali', avatar: 'Dr. Hassan Ali', role: 'manager' },
      { id: '1', name: 'Sarah Connor', avatar: 'Sarah Connor', role: 'officer' },
    ],
    leaderId: '5',
    createdAt: '2026-02-05T07:30:00.000Z',
    updatedAt: '2026-03-05T11:00:00.000Z',
  },
  {
    id: 'OBS-2026-0004',
    title: 'Risk Assessment Methodology Update',
    description: 'Current risk assessment methodology does not align with updated SAMA framework requirements.',
    source: 'sama',
    severity: 'high',
    status: 'in_progress',
    dueDate: '2026-04-01',
    department: 'Risk Management',
    reference: 'OBS-2026-0004',
    assignee: { id: '2', name: 'Ahmed Khan', avatar: 'Ahmed Khan', role: 'manager' },
    assignees: [
      { id: '2', name: 'Ahmed Khan', avatar: 'Ahmed Khan', role: 'manager' },
      { id: '3', name: 'Lisa Martinez', avatar: 'Lisa Martinez', role: 'officer' },
    ],
    leaderId: '2',
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-03-10T09:15:00.000Z',
  },
  {
    id: 'OBS-2026-0005',
    title: 'Legal Contract Review Backlog',
    description: 'Internal audit found 15+ vendor contracts pending legal compliance review beyond SLA.',
    source: 'internal',
    severity: 'medium',
    status: 'open',
    dueDate: '2026-04-20',
    department: 'Legal',
    reference: 'OBS-2026-0005',
    assignee: { id: '3', name: 'Lisa Martinez', avatar: 'Lisa Martinez', role: 'officer' },
    assignees: [
      { id: '3', name: 'Lisa Martinez', avatar: 'Lisa Martinez', role: 'officer' },
    ],
    leaderId: '3',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-12T16:00:00.000Z',
  },
]

export const useObservationStore = create<ObservationState>()(
  persist(
    (set, get) => ({
  observations: seedObservations,
  selectedObservation: null,
  filters: {},
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  },
  sort: {
    field: 'createdAt',
    direction: 'desc',
  },
  isLoading: false,
  error: null,

  fetchAll: async () => {
    const existing = get().observations
    set({
      pagination: {
        ...get().pagination,
        total: existing.length,
        totalPages: Math.ceil(existing.length / get().pagination.pageSize),
      },
    })
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const observation = get().observations.find((o) => o.id === id) || null
      set({ selectedObservation: observation, isLoading: false })
      return observation
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch observation',
        isLoading: false,
      })
      return null
    }
  },

  create: async (data, creator) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Generate sequential ID in OBS-YYYY-XXX format
      const year = new Date().getFullYear()
      const existingIds = get().observations
        .map((obs) => obs.id)
        .filter((id) => id.startsWith(`OBS-${year}-`))
        .map((id) => parseInt(id.split('-')[2], 10))
        .filter((n) => !isNaN(n))
      const nextNumber = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1
      const id = `OBS-${year}-${String(nextNumber).padStart(3, '0')}`

      // Auto-add creator as assignee if not already present
      const assignees = [...(data.assignees || [])]
      if (creator && !assignees.some(a => a.id === creator.id)) {
        assignees.unshift({
          id: creator.id,
          name: creator.name,
          avatar: creator.avatar || creator.name,
          role: creator.role,
        })
      }

      const newObservation: Observation = {
        ...data,
        id,
        assignees,
        documents: data.documents || [],  // Ensure documents are preserved
        creatorId: creator?.id,      // Set creator
        leaderId: creator?.id,       // Initially leader = creator
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        observations: [newObservation, ...state.observations],
        isLoading: false,
      }))

      return newObservation
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create observation',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<Observation>, editor?: User) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedObservation: Observation | null = null
      const timelineEntries: ObservationTimelineEntry[] = []

      // Get current observation to compare changes
      const currentObs = get().observations.find(o => o.id === id) || get().selectedObservation

      if (currentObs && editor) {
        // Track status change
        if (data.status && data.status !== currentObs.status) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `Status changed from ${currentObs.status} to ${data.status}`,
            descriptionAr: `تم تغيير الحالة من ${currentObs.status} إلى ${data.status}`,
            descriptionKey: 'observations.detail.timeline.statusChanged',
            descriptionParams: { from: currentObs.status, to: data.status },
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'status_change',
          })
        }

        // Track severity change
        if (data.severity && data.severity !== currentObs.severity) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `Severity changed from ${currentObs.severity} to ${data.severity}`,
            descriptionAr: `تم تغيير الخطورة من ${currentObs.severity} إلى ${data.severity}`,
            descriptionKey: 'observations.detail.timeline.severityChanged',
            descriptionParams: { from: currentObs.severity, to: data.severity },
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'severity_change',
          })
        }

        // Track title change
        if (data.title && data.title !== currentObs.title) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `Title changed to: ${data.title}`,
            descriptionAr: `تم تغيير العنوان إلى: ${data.title}`,
            descriptionKey: 'observations.detail.timeline.titleChanged',
            descriptionParams: { title: data.title },
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'observation_updated',
          })
        }

        // Track description change
        if (data.description && data.description !== currentObs.description) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: 'Description was updated',
            descriptionAr: 'تم تحديث الوصف',
            descriptionKey: 'observations.detail.timeline.descriptionChanged',
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'observation_updated',
          })
        }

        // Track due date change
        if (data.dueDate && data.dueDate !== currentObs.dueDate) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `Due date changed to ${data.dueDate}`,
            descriptionAr: `تم تغيير تاريخ الاستحقاق إلى ${data.dueDate}`,
            descriptionKey: 'observations.detail.timeline.dueDateChanged',
            descriptionParams: { date: data.dueDate },
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'observation_updated',
          })
        }

        // If there were changes but no specific tracking, add a general update entry
        if (timelineEntries.length === 0 && Object.keys(data).length > 0) {
          timelineEntries.push({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `${editor.name} updated the observation`,
            descriptionAr: `${editor.name} حدّث الملاحظة`,
            descriptionKey: 'observations.detail.timeline.observationUpdated',
            descriptionParams: { name: editor.name },
            userId: editor.id,
            userName: editor.name,
            userAvatar: editor.avatar,
            actionType: 'observation_updated',
          })
        }
      }

      set((state) => {
        return {
          observations: state.observations.map((o) => {
            if (o.id === id) {
              // Merge timeline entries with existing timeline from the observation
              const existingObsTimeline = o.timeline || []
              // Explicitly update only fields that are in data, preserving nested arrays
              updatedObservation = {
                ...o,
                // Only overwrite fields that are explicitly in data
                ...(data.title !== undefined && { title: data.title }),
                ...(data.subTitle !== undefined && { subTitle: data.subTitle }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.severity !== undefined && { severity: data.severity }),
                ...(data.source !== undefined && { source: data.source }),
                ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
                ...(data.department !== undefined && { department: data.department }),
                ...(data.reference !== undefined && { reference: data.reference }),
                ...(data.assignee !== undefined && { assignee: data.assignee }),
                ...(data.assignees !== undefined && { assignees: data.assignees }),
                ...(data.leaderId !== undefined && { leaderId: data.leaderId }),
                ...(data.documents !== undefined && { documents: data.documents }),
                ...(data.remediationPlan !== undefined && { remediationPlan: data.remediationPlan }),
                // Preserve checklist, updates, and comments unless explicitly updated
                checklist: data.checklist !== undefined ? data.checklist : o.checklist,
                updates: data.updates !== undefined ? data.updates : o.updates,
                updatedAt: new Date().toISOString(),
                timeline: [...timelineEntries, ...existingObsTimeline],
              }
              return updatedObservation
            }
            return o
          }),
          selectedObservation:
            state.selectedObservation?.id === id
              ? {
                  ...state.selectedObservation,
                  // Only overwrite fields that are explicitly in data
                  ...(data.title !== undefined && { title: data.title }),
                  ...(data.subTitle !== undefined && { subTitle: data.subTitle }),
                  ...(data.description !== undefined && { description: data.description }),
                  ...(data.status !== undefined && { status: data.status }),
                  ...(data.severity !== undefined && { severity: data.severity }),
                  ...(data.source !== undefined && { source: data.source }),
                  ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
                  ...(data.department !== undefined && { department: data.department }),
                  ...(data.reference !== undefined && { reference: data.reference }),
                  ...(data.assignee !== undefined && { assignee: data.assignee }),
                  ...(data.assignees !== undefined && { assignees: data.assignees }),
                  ...(data.leaderId !== undefined && { leaderId: data.leaderId }),
                  ...(data.documents !== undefined && { documents: data.documents }),
                  ...(data.remediationPlan !== undefined && { remediationPlan: data.remediationPlan }),
                  // Preserve checklist, updates, and comments unless explicitly updated
                  checklist: data.checklist !== undefined ? data.checklist : state.selectedObservation.checklist,
                  updates: data.updates !== undefined ? data.updates : state.selectedObservation.updates,
                  comments: state.selectedObservation.comments, // Always preserve comments
                  updatedAt: new Date().toISOString(),
                  timeline: [...timelineEntries, ...(state.selectedObservation.timeline || [])],
                }
              : state.selectedObservation,
          isLoading: false,
        }
      })

      if (!updatedObservation) {
        throw new Error('Observation not found')
      }

      return updatedObservation
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update observation',
        isLoading: false,
      })
      throw error
    }
  },

  delete: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      set((state) => ({
        observations: state.observations.filter((o) => o.id !== id),
        selectedObservation:
          state.selectedObservation?.id === id ? null : state.selectedObservation,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete observation',
        isLoading: false,
      })
      throw error
    }
  },

  addComment: async (observationId: string, content: string, author: User) => {
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const newComment: Comment = {
        id: crypto.randomUUID(),
        content,
        author,
        createdAt: new Date().toISOString(),
      }

      // Create timeline entry for the comment
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
        // Update observations array with timeline entry
        const observations = state.observations.map((obs) =>
          obs.id === observationId
            ? {
                ...obs,
                timeline: [timelineEntry, ...(obs.timeline || [])],
              }
            : obs
        )

        // Update selected observation if it matches
        let selectedObservation = state.selectedObservation
        if (selectedObservation?.id === observationId) {
          const existingComments = selectedObservation.comments || []
          const timeline = selectedObservation.timeline || []
          selectedObservation = {
            ...selectedObservation,
            comments: [...existingComments, newComment],
            timeline: [timelineEntry, ...timeline],
          }
        }

        return { observations, selectedObservation }
      })

      return newComment
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add comment',
      })
      throw error
    }
  },

  addChecklistItem: async (observationId: string, text: string, user?: User) => {
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
    set((state) => {
      // Update observations array
      const observations = state.observations.map((obs) => {
        if (obs.id === observationId) {
          const checklist = obs.checklist || []
          return { ...obs, checklist: [...checklist, newItem] }
        }
        return obs
      })

      // Update selectedObservation
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const checklist = selectedObservation.checklist || []
        const timeline = selectedObservation.timeline || []
        selectedObservation = {
          ...selectedObservation,
          checklist: [...checklist, newItem],
          timeline: [timelineEntry, ...timeline],
        }
      }

      return { observations, selectedObservation }
    })
    return newItem
  },

  editChecklistItem: async (observationId: string, itemId: string, newText: string, user?: User) => {
    const state = get()
    // Find old text for timeline
    const item = state.selectedObservation?.checklist?.find(i => i.id === itemId)
      || state.observations.find(o => o.id === observationId)?.checklist?.find(i => i.id === itemId)
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

    set((state) => {
      // Update observations array
      const observations = state.observations.map((obs) => {
        if (obs.id === observationId) {
          const checklist = obs.checklist?.map(item =>
            item.id === itemId ? { ...item, text: newText } : item
          )
          return { ...obs, checklist }
        }
        return obs
      })

      // Update selectedObservation
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const checklist = selectedObservation.checklist?.map(item =>
          item.id === itemId ? { ...item, text: newText } : item
        )
        const timeline = selectedObservation.timeline || []
        selectedObservation = {
          ...selectedObservation,
          checklist,
          timeline: [timelineEntry, ...timeline],
        }
      }

      return { observations, selectedObservation }
    })
  },

  toggleChecklistItem: async (observationId: string, itemId: string, completed: boolean, user?: User) => {
    const currentState = get()
    // Look in both selectedObservation AND observations array to find the item text
    const obsFromArray = currentState.observations.find(o => o.id === observationId)
    const item = currentState.selectedObservation?.checklist?.find(i => i.id === itemId)
      || obsFromArray?.checklist?.find(i => i.id === itemId)
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

    set((state) => {
      // Update observations array
      const observations = state.observations.map((obs) => {
        if (obs.id === observationId) {
          const checklist = obs.checklist?.map(i =>
            i.id === itemId ? { ...i, completed } : i
          )
          return { ...obs, checklist }
        }
        return obs
      })

      // Update selectedObservation
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const checklist = selectedObservation.checklist?.map(i =>
          i.id === itemId ? { ...i, completed } : i
        )
        const timeline = selectedObservation.timeline || []
        selectedObservation = {
          ...selectedObservation,
          checklist,
          timeline: [timelineEntry, ...timeline],
        }
      }

      return { observations, selectedObservation }
    })
  },

  removeChecklistItem: async (observationId: string, itemId: string, itemText?: string, user?: User) => {
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
    set((state) => {
      // Update observations array
      const observations = state.observations.map((obs) => {
        if (obs.id === observationId) {
          return {
            ...obs,
            checklist: obs.checklist?.filter((item) => item.id !== itemId),
          }
        }
        return obs
      })

      // Update selectedObservation
      let selectedObservation = state.selectedObservation
      if (selectedObservation?.id === observationId) {
        const timeline = selectedObservation.timeline || []
        selectedObservation = {
          ...selectedObservation,
          checklist: selectedObservation.checklist?.filter(
            (item) => item.id !== itemId
          ),
          timeline: [timelineEntry, ...timeline],
        }
      }

      return { observations, selectedObservation }
    })
  },

  editComment: async (observationId: string, commentId: string, newText: string, editor: User) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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
              : update
          )
          const timeline = state.selectedObservation.timeline || []
          return {
            selectedObservation: {
              ...state.selectedObservation,
              updates,
              timeline: [timelineEntry, ...timeline],
            },
          }
        }
        return state
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to edit comment',
      })
      throw error
    }
  },

  deleteComment: async (observationId: string, commentId: string, deleter: User) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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
            (update) => update.id !== commentId
          )
          const timeline = state.selectedObservation.timeline || []
          return {
            selectedObservation: {
              ...state.selectedObservation,
              updates,
              timeline: [timelineEntry, ...timeline],
            },
          }
        }
        return state
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete comment',
      })
      throw error
    }
  },

  transferLeadership: async (observationId: string, newLeaderId: string, newLeaderName: string, currentUser: User) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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

      set((state) => {
        // Get current checklist/documents from selectedObservation to sync to observations array
        const currentChecklist = state.selectedObservation?.checklist
        const currentDocuments = state.selectedObservation?.documents
        const currentRemediationPlan = state.selectedObservation?.remediationPlan

        // Update in observations array - also persist timeline entry and sync data from selectedObservation
        const observations = state.observations.map((obs) =>
          obs.id === observationId
            ? {
                ...obs,
                leaderId: newLeaderId,
                timeline: [timelineEntry, ...(obs.timeline || [])],
                // Sync checklist/documents from selectedObservation to prevent data loss
                checklist: currentChecklist || obs.checklist,
                documents: currentDocuments || obs.documents,
                remediationPlan: currentRemediationPlan || obs.remediationPlan,
              }
            : obs
        )

        // Update selected observation if it matches - explicitly preserve comments and checklist
        const selectedObservation = state.selectedObservation?.id === observationId
          ? {
              ...state.selectedObservation,
              leaderId: newLeaderId,
              timeline: [timelineEntry, ...(state.selectedObservation.timeline || [])],
              // Explicitly preserve these fields to prevent any data loss
              comments: state.selectedObservation.comments,
              checklist: state.selectedObservation.checklist,
              documents: state.selectedObservation.documents,
              remediationPlan: state.selectedObservation.remediationPlan,
            }
          : state.selectedObservation

        return { observations, selectedObservation }
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to transfer leadership',
      })
      throw error
    }
  },

  submitRemediationPlan: async (observationId: string, plan, submitter: User, observationLeaderId?: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Check if submitter is the observation leader for auto-approval
      const isLeader = observationLeaderId && submitter.id === observationLeaderId
      const planStatus = isLeader ? 'approved' : 'submitted'

      const newPlan: RemediationPlan = {
        ...plan,
        id: crypto.randomUUID(),
        status: planStatus,
        submittedAt: new Date().toISOString(),
        submittedBy: submitter.id,
        createdAt: new Date().toISOString(),
        // If auto-approved, also set review fields
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
        // Update in observations array - if auto-approved, also set status to in_progress
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs
          const newStatus = isLeader && obs.status === 'open' ? 'in_progress' : obs.status
          return { ...obs, remediationPlan: newPlan, status: newStatus }
        })

        // Update selected observation if it matches
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to submit remediation plan',
      })
      throw error
    }
  },

  reviewRemediationPlan: async (observationId: string, approved: boolean, reviewer: User, notes?: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

      const state = get()
      const observation = state.observations.find((o) => o.id === observationId)
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
        // Update in observations array - also change status to in_progress if approved and was open
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs
          const newStatus = approved && obs.status === 'open' ? 'in_progress' : obs.status
          return { ...obs, remediationPlan: updatedPlan, status: newStatus }
        })

        // Update selected observation if it matches
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to review remediation plan',
      })
      throw error
    }
  },

  requestClosure: async (observationId: string, requester: User, notes?: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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

      set((state) => {
        // Update in observations array - change status to 'resolved' (Pending Review)
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs
          return {
            ...obs,
            status: 'resolved' as const,
            closureRequest,
            closureReview: undefined, // Clear any previous review
            timeline: [timelineEntry, ...(obs.timeline || [])],
          }
        })

        // Update selected observation if it matches
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to request closure',
      })
      throw error
    }
  },

  reviewClosure: async (observationId: string, approved: boolean, reviewer: User, notes?: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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

      set((state) => {
        // Update in observations array
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs
          return {
            ...obs,
            status: newStatus as 'closed' | 'in_progress',
            closureReview,
            // If rejected, clear the closure request so they can request again
            closureRequest: approved ? obs.closureRequest : undefined,
            timeline: [timelineEntry, ...(obs.timeline || [])],
          }
        })

        // Update selected observation if it matches
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to review closure',
      })
      throw error
    }
  },

  addDocument: async (observationId: string, document: { name: string; type: 'pdf' | 'image' | 'doc' }, uploader: User, addToRemediationPlan?: boolean) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

      const newDocument = {
        id: crypto.randomUUID(),
        name: document.name,
        type: document.type,
      }

      const timelineEntry: ObservationTimelineEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        dateKey: 'today',
        description: addToRemediationPlan
          ? `${uploader.name} uploaded remediation document: ${document.name}`
          : `${uploader.name} uploaded a document: ${document.name}`,
        descriptionAr: addToRemediationPlan
          ? `${uploader.name} رفع مستند معالجة: ${document.name}`
          : `رفع ${uploader.name} مستند: ${document.name}`,
        descriptionKey: addToRemediationPlan
          ? 'observations.detail.timeline.remediationDocumentUploaded'
          : 'observations.detail.timeline.documentUploaded',
        descriptionParams: { name: uploader.name, document: document.name },
        userId: uploader.id,
        userName: uploader.name,
        userAvatar: uploader.avatar,
        actionType: 'document_add',
      }

      set((state) => {
        // Update in observations array
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs

          const documents = [...(obs.documents || []), newDocument]

          // If addToRemediationPlan is true, add to plan documents (create stub plan if needed)
          let remediationPlan = obs.remediationPlan
          if (addToRemediationPlan) {
            if (remediationPlan) {
              remediationPlan = {
                ...remediationPlan,
                documents: [...(remediationPlan.documents || []), newDocument],
              }
            } else {
              // Create a stub remediation plan with just the document
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

        // Update selected observation if it matches
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
              // Create a stub remediation plan with just the document
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add document',
      })
      throw error
    }
  },

  removeDocument: async (observationId: string, documentId: string, documentName: string, user: User) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))

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

      set((state) => {
        // Update in observations array
        const observations = state.observations.map((obs) => {
          if (obs.id !== observationId) return obs

          const documents = (obs.documents || []).filter(doc => doc.id !== documentId)

          // Also remove from remediation plan if exists
          let remediationPlan = obs.remediationPlan
          if (remediationPlan?.documents) {
            remediationPlan = {
              ...remediationPlan,
              documents: remediationPlan.documents.filter(doc => doc.id !== documentId),
            }
          }

          return { ...obs, documents, remediationPlan }
        })

        // Update selected observation if it matches
        let selectedObservation = state.selectedObservation
        if (selectedObservation?.id === observationId) {
          const documents = (selectedObservation.documents || []).filter(doc => doc.id !== documentId)

          let remediationPlan = selectedObservation.remediationPlan
          if (remediationPlan?.documents) {
            remediationPlan = {
              ...remediationPlan,
              documents: remediationPlan.documents.filter(doc => doc.id !== documentId),
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
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove document',
      })
      throw error
    }
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
        totalPages: Math.ceil(state.pagination.total / pageSize),
      },
    })),
    }),
    {
      name: 'observation-storage',
      version: 1,
      partialize: (state) => ({
        observations: state.observations,
      }),
    }
  )
)
