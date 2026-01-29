import { create } from 'zustand'
import type { Observation, ObservationFilters, PaginationState, SortState, Comment, User, ObservationTimelineEntry } from '@/types'

interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

// Sample data for initial state
const sampleObservations: Observation[] = [
  {
    id: 'OBS-2024-101',
    title: 'MFA Implementation Gap in Corporate Banking',
    description:
      'The audit revealed that corporate banking customers are currently able to perform high-value transactions without Mandatory Multi-Factor Authentication (MFA) under certain browser configurations. This violates the SAMA Cybersecurity Framework update 4.2 regarding critical transaction security.',
    source: 'sama',
    severity: 'critical',
    status: 'in_progress',
    dueDate: 'Oct 24, 2024',
    department: 'IT Security',
    reference: 'Cybersecurity Framework - Rule 4.2',
    team: [
      { name: 'Michael Scott', avatar: 'Michael', role: 'Lead Assignee' },
      { name: 'Felix Henderson', avatar: 'Felix', role: 'Compliance Officer' },
    ],
    progress: 40,
    checklist: [
      { id: '1', text: 'Identify affected browser engine configurations', completed: true },
      { id: '2', text: 'Draft technical requirement for MFA enforcement', completed: true },
      { id: '3', text: 'Implement session hijacking prevention measures', completed: false },
      { id: '4', text: 'QA Testing - Sandbox environment', completed: false },
      { id: '5', text: 'Verification by Internal Audit team', completed: false },
    ],
    updates: [
      {
        id: '1',
        author: { name: 'Sarah Connor', avatar: 'Sarah' },
        text: 'The middleware team has confirmed the fix will be ready for staging by Friday. We need Legal to review the updated T&Cs for customers.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
    ],
    documents: [
      { id: '1', name: 'SAMA_Cyber_Audit_2024.pdf', type: 'pdf' },
      { id: '2', name: 'Error_Screen_MFA.png', type: 'image' },
    ],
    timeline: [
      {
        id: '1',
        date: 'Today',
        dateKey: 'today',
        description: "Checklist item 'Audit Verification' marked as pending",
        descriptionAr: "عنصر قائمة التحقق 'التحقق من التدقيق' تم تحديده كمعلق",
        descriptionKey: 'observations.detail.timeline.checklistMarkedPending',
        descriptionParams: { item: 'Audit Verification' }
      },
      {
        id: '2',
        date: 'Yesterday',
        dateKey: 'yesterday',
        description: 'Sarah Henderson added a new document',
        descriptionAr: 'سارة هندرسون أضافت مستنداً جديداً',
        descriptionKey: 'observations.detail.timeline.documentAdded',
        descriptionParams: { name: 'Sarah Henderson' },
        userName: 'Sarah Henderson',
        userAvatar: 'Sarah',
        userRole: 'Compliance Officer',
        userDepartment: 'Compliance'
      },
    ],
  },
  {
    id: 'OBS-2024-102',
    title: 'Untrained Staff in Fraud Detection Module',
    description:
      'Internal audit identified that 15% of customer service staff have not completed the mandatory fraud detection training module. This creates compliance risk with regulatory training requirements.',
    source: 'internal',
    severity: 'medium',
    status: 'open',
    dueDate: 'Nov 12, 2024',
    department: 'Compliance',
    reference: 'Compliance Training Audit 2024',
    team: [{ name: 'Ahmed Khan', avatar: 'Ahmed', role: 'Training Coordinator' }],
    checklist: [
      { id: '1', text: 'Identify all untrained staff members', completed: false },
      { id: '2', text: 'Schedule mandatory training sessions', completed: false },
      { id: '3', text: 'Track completion and update records', completed: false },
    ],
    timeline: [
      {
        id: '1',
        date: 'Oct 15, 2024',
        description: 'Observation created from internal audit',
        descriptionAr: 'تم إنشاء الملاحظة من التدقيق الداخلي',
        descriptionKey: 'observations.detail.timeline.observationCreated',
        actionType: 'created'
      },
    ],
  },
  {
    id: 'OBS-2024-103',
    title: 'Contractual Ambiguity in Murabaha Clauses',
    description:
      'Sharia board review identified ambiguous language in several Murabaha contract templates that could lead to non-compliance with Islamic financing principles.',
    source: 'sharia',
    severity: 'high',
    status: 'resolved',
    dueDate: 'Oct 30, 2024',
    department: 'Legal',
    reference: 'Sharia Product Review',
    team: [
      { name: 'Dr. Hassan Ali', avatar: 'Hassan', role: 'Sharia Advisor' },
      { name: 'Lisa Martinez', avatar: 'Lisa', role: 'Legal Counsel' },
    ],
    checklist: [
      { id: '1', text: 'Review all affected contract templates', completed: true },
      { id: '2', text: 'Draft revised language with Sharia board', completed: true },
      { id: '3', text: 'Legal review of proposed changes', completed: true },
      { id: '4', text: 'Final approval from Sharia board', completed: false },
    ],
    timeline: [
      {
        id: '1',
        date: 'Oct 20, 2024',
        description: 'Submitted for Sharia board review',
        descriptionAr: 'تم تقديمه لمراجعة الهيئة الشرعية'
      },
      {
        id: '2',
        date: 'Oct 18, 2024',
        description: 'Legal review completed',
        descriptionAr: 'اكتملت المراجعة القانونية'
      },
    ],
  },
  {
    id: 'OBS-2024-098',
    title: 'Outdated AML Screening Parameters',
    description:
      'Annual compliance audit found that AML screening parameters had not been updated to reflect the latest SAMA sanctions list changes.',
    source: 'sama',
    severity: 'medium',
    status: 'closed',
    dueDate: 'Sep 15, 2024',
    department: 'Compliance',
    reference: 'Annual Compliance Audit',
    team: [{ name: 'Omar Al-Rashid', avatar: 'Omar', role: 'AML Officer' }],
    checklist: [
      { id: '1', text: 'Update AML screening parameters', completed: true },
      { id: '2', text: 'Test updated screening rules', completed: true },
      { id: '3', text: 'Document changes and obtain sign-off', completed: true },
    ],
    timeline: [
      {
        id: '1',
        date: 'Sep 15, 2024',
        description: 'Observation verified and closed',
        descriptionAr: 'تم التحقق من الملاحظة وإغلاقها',
        descriptionKey: 'observations.detail.timeline.observationClosed',
        actionType: 'status_change'
      },
      {
        id: '2',
        date: 'Sep 10, 2024',
        description: 'All remediation tasks completed',
        descriptionAr: 'اكتملت جميع مهام المعالجة',
        descriptionKey: 'observations.detail.timeline.tasksCompleted',
        actionType: 'checklist_complete'
      },
    ],
  },
]

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
  create: (data: Omit<Observation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Observation>
  update: (id: string, data: Partial<Observation>) => Promise<Observation>
  delete: (id: string) => Promise<void>
  addComment: (observationId: string, content: string, author: User) => Promise<Comment>
  addChecklistItem: (observationId: string, text: string, user?: User) => Promise<ChecklistItem>
  removeChecklistItem: (observationId: string, itemId: string, itemText?: string, user?: User) => Promise<void>
  getNextReference: () => string
  setFilters: (filters: ObservationFilters) => void
  clearFilters: () => void
  setSelected: (observation: ObservationWithComments | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useObservationStore = create<ObservationState>((set, get) => ({
  observations: sampleObservations,
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
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Mock data for now - will be replaced with API response
      const mockObservations: Observation[] = []

      set({
        observations: mockObservations,
        pagination: {
          ...get().pagination,
          total: mockObservations.length,
          totalPages: Math.ceil(mockObservations.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch observations',
        isLoading: false,
      })
    }
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

  create: async (data) => {
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

      const newObservation: Observation = {
        ...data,
        id,
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

  update: async (id: string, data: Partial<Observation>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedObservation: Observation | null = null

      set((state) => ({
        observations: state.observations.map((o) => {
          if (o.id === id) {
            updatedObservation = { ...o, ...data, updatedAt: new Date().toISOString() }
            return updatedObservation
          }
          return o
        }),
        selectedObservation:
          state.selectedObservation?.id === id
            ? { ...state.selectedObservation, ...data, updatedAt: new Date().toISOString() }
            : state.selectedObservation,
        isLoading: false,
      }))

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
        // Update selected observation if it matches
        if (state.selectedObservation?.id === observationId) {
          const existingComments = state.selectedObservation.comments || []
          const timeline = state.selectedObservation.timeline || []
          return {
            selectedObservation: {
              ...state.selectedObservation,
              comments: [...existingComments, newComment],
              timeline: [timelineEntry, ...timeline],
            },
          }
        }
        return state
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
      if (state.selectedObservation?.id === observationId) {
        const checklist = state.selectedObservation.checklist || []
        const timeline = state.selectedObservation.timeline || []
        return {
          selectedObservation: {
            ...state.selectedObservation,
            checklist: [...checklist, newItem],
            timeline: [timelineEntry, ...timeline],
          },
        }
      }
      return state
    })
    return newItem
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
      if (state.selectedObservation?.id === observationId) {
        const timeline = state.selectedObservation.timeline || []
        return {
          selectedObservation: {
            ...state.selectedObservation,
            checklist: state.selectedObservation.checklist?.filter(
              (item) => item.id !== itemId
            ),
            timeline: [timelineEntry, ...timeline],
          },
        }
      }
      return state
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
        totalPages: Math.ceil(state.pagination.total / pageSize),
      },
    })),
}))
