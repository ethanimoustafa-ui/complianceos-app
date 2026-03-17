import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Audit, AuditFilters, PaginationState, SortState, AuditDocument, AuditTeamMember, AuditComment, RegulatoryBodyId } from '@/types'
import { computeNextReview } from '@/lib/review-schedule'
import { useAuditLogStore } from './audit-log-store'
import { useAuthStore } from './auth-store'

interface AuditState {
  audits: Audit[]
  selectedAudit: Audit | null
  filters: AuditFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Audit | null>
  create: (data: Omit<Audit, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Audit>
  update: (id: string, data: Partial<Audit>) => Promise<Audit>
  delete: (id: string) => Promise<void>
  setFilters: (filters: AuditFilters) => void
  clearFilters: () => void
  setSelected: (audit: Audit | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  // Document management
  addDocument: (auditId: string, document: Omit<AuditDocument, 'id' | 'uploadedAt'>, user?: { name: string }) => AuditDocument | null
  removeDocument: (auditId: string, documentId: string) => void
  // Team management
  addTeamMember: (auditId: string, member: Omit<AuditTeamMember, 'addedAt'>) => AuditTeamMember | null
  removeTeamMember: (auditId: string, memberId: string) => void
  // Comment management
  addComment: (auditId: string, content: string, author: { id: string; name: string; avatar: string }) => AuditComment | null
  editComment: (auditId: string, commentId: string, newContent: string, editor: { name: string }) => void
  deleteComment: (auditId: string, commentId: string, deleter: { name: string }) => void
  // Status management
  updateStatus: (auditId: string, newStatus: Audit['status'], user: { name: string }) => Promise<void>
}

// Helper to get current user for logging
const getCurrentUser = () => {
  const user = useAuthStore.getState().user
  return {
    name: user?.name || 'System',
    avatar: user?.avatar || '',
  }
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      audits: [],
      selectedAudit: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'dueDate',
        direction: 'asc',
      },
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Preserve existing audits from persistence - don't overwrite with empty mock data
          const existingAudits = get().audits

          set({
            pagination: {
              ...get().pagination,
              total: existingAudits.length,
              totalPages: Math.ceil(existingAudits.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch audits',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 300))

          const audit = get().audits.find((a) => a.id === id) || null
          set({ selectedAudit: audit, isLoading: false })
          return audit
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch audit',
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

          const dueDate = data.reviewSchedule
            ? computeNextReview(data.reviewSchedule)
            : data.dueDate
          const newAudit: Audit = {
            ...data,
            id: crypto.randomUUID(),
            dueDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          set((state) => ({
            audits: [newAudit, ...state.audits],
            isLoading: false,
          }))

          // Log the creation action
          const user = getCurrentUser()
          useAuditLogStore.getState().addLog({
            user,
            action: 'created',
            audit: newAudit.title,
            auditId: newAudit.id,
            description: `Created new audit: ${newAudit.title}`,
            descriptionKey: 'auditDetail.activityCreatedAudit',
            descriptionParams: { title: newAudit.title },
            status: 'completed',
          })

          return newAudit
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create audit',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Audit>) => {
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))

          let updatedAudit: Audit | null = null

          const computedDueDate = data.reviewSchedule
            ? computeNextReview(data.reviewSchedule)
            : data.dueDate
          const updatePayload = computedDueDate !== undefined
            ? { ...data, dueDate: computedDueDate }
            : data
          set((state) => ({
            audits: state.audits.map((a) => {
              if (a.id === id) {
                updatedAudit = { ...a, ...updatePayload, updatedAt: new Date().toISOString() }
                return updatedAudit
              }
              return a
            }),
            selectedAudit:
              state.selectedAudit?.id === id
                ? { ...state.selectedAudit, ...updatePayload, updatedAt: new Date().toISOString() }
                : state.selectedAudit,
            isLoading: false,
          }))

          if (!updatedAudit) {
            throw new Error('Audit not found')
          }

          // Log the update action
          const user = getCurrentUser()
          const auditForLog = updatedAudit as Audit
          useAuditLogStore.getState().addLog({
            user,
            action: 'updated',
            audit: auditForLog.title,
            auditId: auditForLog.id,
            description: `Updated audit: ${auditForLog.title}`,
            descriptionKey: 'auditDetail.activityUpdatedAudit',
            descriptionParams: { title: auditForLog.title },
            status: 'completed',
          })

          return auditForLog
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update audit',
            isLoading: false,
          })
          throw error
        }
      },

      delete: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          // Get the audit before deleting for logging
          const auditToDelete = get().audits.find((a) => a.id === id)

          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))

          set((state) => ({
            audits: state.audits.filter((a) => a.id !== id),
            selectedAudit: state.selectedAudit?.id === id ? null : state.selectedAudit,
            isLoading: false,
          }))

          // Log the deletion/closure action
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
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete audit',
            isLoading: false,
          })
          throw error
        }
      },

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
            totalPages: Math.ceil(state.pagination.total / pageSize),
          },
        })),

      // Document management
      addDocument: (auditId: string, documentData: Omit<AuditDocument, 'id' | 'uploadedAt'>, user?: { name: string }) => {
        const newDocument: AuditDocument = {
          ...documentData,
          id: crypto.randomUUID(),
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.name,
        }

        let addedDocument: AuditDocument | null = null

        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              addedDocument = newDocument
              return {
                ...a,
                documents: [...(a.documents || []), newDocument],
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  documents: [...(state.selectedAudit.documents || []), newDocument],
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))

        // Log the upload action
        if (addedDocument) {
          const currentUser = getCurrentUser()
          useAuditLogStore.getState().addLog({
            user: currentUser,
            action: 'uploaded',
            audit: get().audits.find((a) => a.id === auditId)?.title || '',
            auditId,
            description: `Uploaded document: ${newDocument.name}`,
            descriptionKey: 'auditDetail.activityUploadedDocument',
            descriptionParams: { name: newDocument.name },
            status: 'completed',
          })
        }

        return addedDocument
      },

      removeDocument: (auditId: string, documentId: string) => {
        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              return {
                ...a,
                documents: (a.documents || []).filter((d) => d.id !== documentId),
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  documents: (state.selectedAudit.documents || []).filter((d) => d.id !== documentId),
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))
      },

      // Team management
      addTeamMember: (auditId: string, memberData: Omit<AuditTeamMember, 'addedAt'>) => {
        const newMember: AuditTeamMember = {
          ...memberData,
          addedAt: new Date().toISOString(),
        }

        let addedMember: AuditTeamMember | null = null

        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              // Check if member already exists
              if (a.team?.some((m) => m.id === memberData.id)) {
                return a
              }
              addedMember = newMember
              return {
                ...a,
                team: [...(a.team || []), newMember],
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  team: [...(state.selectedAudit.team || []), newMember],
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))

        return addedMember
      },

      removeTeamMember: (auditId: string, memberId: string) => {
        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              return {
                ...a,
                team: (a.team || []).filter((m) => m.id !== memberId),
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  team: (state.selectedAudit.team || []).filter((m) => m.id !== memberId),
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))
      },

      // Comment management
      addComment: (auditId: string, content: string, author: { id: string; name: string; avatar: string }) => {
        const newComment: AuditComment = {
          id: crypto.randomUUID(),
          auditId,
          content,
          author,
          createdAt: new Date().toISOString(),
          isEdited: false,
        }

        let addedComment: AuditComment | null = null

        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              addedComment = newComment
              return {
                ...a,
                comments: [...(a.comments || []), newComment],
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  comments: [...(state.selectedAudit.comments || []), newComment],
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))

        // Log the comment action
        if (addedComment) {
          const audit = get().audits.find((a) => a.id === auditId)
          const truncatedComment = `${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`
          useAuditLogStore.getState().addLog({
            user: { name: author.name, avatar: author.avatar },
            action: 'commented',
            audit: audit?.title || '',
            auditId,
            description: `Added comment: "${truncatedComment}"`,
            descriptionKey: 'auditDetail.activityAddedComment',
            descriptionParams: { comment: truncatedComment },
            status: 'completed',
          })
        }

        return addedComment
      },

      editComment: (auditId: string, commentId: string, newContent: string, editor: { name: string }) => {
        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              return {
                ...a,
                comments: (a.comments || []).map((c) =>
                  c.id === commentId
                    ? { ...c, content: newContent, updatedAt: new Date().toISOString(), isEdited: true }
                    : c
                ),
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  comments: (state.selectedAudit.comments || []).map((c) =>
                    c.id === commentId
                      ? { ...c, content: newContent, updatedAt: new Date().toISOString(), isEdited: true }
                      : c
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))

        // Log the edit action
        const audit = get().audits.find((a) => a.id === auditId)
        const currentUser = getCurrentUser()
        const truncatedComment = `${newContent.substring(0, 50)}${newContent.length > 50 ? '...' : ''}`
        useAuditLogStore.getState().addLog({
          user: currentUser,
          action: 'updated',
          audit: audit?.title || '',
          auditId,
          description: `Edited comment: "${truncatedComment}"`,
          descriptionKey: 'auditDetail.activityEditedComment',
          descriptionParams: { comment: truncatedComment },
          status: 'completed',
        })
      },

      deleteComment: (auditId: string, commentId: string, deleter: { name: string }) => {
        const audit = get().audits.find((a) => a.id === auditId)
        const comment = audit?.comments?.find((c) => c.id === commentId)

        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              return {
                ...a,
                comments: (a.comments || []).filter((c) => c.id !== commentId),
                updatedAt: new Date().toISOString(),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  comments: (state.selectedAudit.comments || []).filter((c) => c.id !== commentId),
                  updatedAt: new Date().toISOString(),
                }
              : state.selectedAudit,
        }))

        // Log the deletion
        const currentUser = getCurrentUser()
        const truncatedComment = `${comment?.content.substring(0, 30) || ''}...`
        useAuditLogStore.getState().addLog({
          user: currentUser,
          action: 'updated',
          audit: audit?.title || '',
          auditId,
          description: `Deleted comment: "${truncatedComment}"`,
          descriptionKey: 'auditDetail.activityDeletedComment',
          descriptionParams: { comment: truncatedComment },
          status: 'completed',
        })
      },

      // Status management
      updateStatus: async (auditId: string, newStatus: Audit['status'], user: { name: string }) => {
        const audit = get().audits.find((a) => a.id === auditId)
        const oldStatus = audit?.status

        // Check if audit is overdue (due date has passed)
        const isOverdue = audit?.dueDate ? new Date(audit.dueDate) < new Date() : false

        // When completing, check if it's being closed overdue
        const isClosingOverdue = newStatus === 'completed' && isOverdue
        const now = new Date().toISOString()

        set((state) => ({
          audits: state.audits.map((a) => {
            if (a.id === auditId) {
              return {
                ...a,
                status: newStatus,
                updatedAt: now,
                ...(newStatus === 'completed' && {
                  completedAt: now,
                  closedOverdue: isClosingOverdue,
                }),
              }
            }
            return a
          }),
          selectedAudit:
            state.selectedAudit?.id === auditId
              ? {
                  ...state.selectedAudit,
                  status: newStatus,
                  updatedAt: now,
                  ...(newStatus === 'completed' && {
                    completedAt: now,
                    closedOverdue: isClosingOverdue,
                  }),
                }
              : state.selectedAudit,
        }))

        // Log the status change
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
          : `Changed status from ${statusLabels[oldStatus || 'pending']} to ${statusLabels[newStatus]}`

        const descriptionKey = isClosingOverdue
          ? 'auditDetail.activityClosedOverdue'
          : 'auditDetail.activityStatusChanged'

        const descriptionParams: Record<string, string> = isClosingOverdue
          ? { date: dueDate }
          : { from: oldStatus || 'pending', to: newStatus }

        useAuditLogStore.getState().addLog({
          user: currentUser,
          action: 'updated',
          audit: audit?.title || '',
          auditId,
          description,
          descriptionKey,
          descriptionParams,
          status: 'completed',
        })
      },
    }),
    {
      name: 'audit-storage',
      version: 1,
      partialize: (state) => ({
        audits: state.audits,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { audits?: any[] }
        if (version < 1) {
          const AUDIT_TYPE_TO_FW: Record<string, string[]> = {
            sama: ['sama'],
            sharia: ['sharia-board'],
            internal: [],
          }
          return {
            ...state,
            audits: (state.audits ?? []).map((a: any) => ({
              ...a,
              frameworkIds: a.frameworkIds ?? (AUDIT_TYPE_TO_FW[a.type] ?? []),
            })),
          }
        }
        return persistedState
      },
    }
  )
)
