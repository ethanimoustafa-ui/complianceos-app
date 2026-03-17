import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AdvisoryRequest, AdvisoryNote, AdvisoryFilters, AdvisoryStatus, PaginationState, SortState } from '@/types'

interface AdvisoryState {
  advisoryRequests: AdvisoryRequest[]
  selectedRequest: AdvisoryRequest | null
  filters: AdvisoryFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => void
  fetchById: (id: string) => AdvisoryRequest | null
  create: (data: Omit<AdvisoryRequest, 'id' | 'ref' | 'notes' | 'createdAt' | 'updatedAt'>) => AdvisoryRequest
  update: (id: string, data: Partial<AdvisoryRequest>) => AdvisoryRequest
  delete: (id: string) => void
  addNote: (id: string, note: { author: string; content: string }) => void
  updateStatus: (id: string, status: AdvisoryStatus) => void
  reassign: (id: string, newAssignee: string) => void
  setFilters: (filters: AdvisoryFilters) => void
  clearFilters: () => void
  setSelected: (request: AdvisoryRequest | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  getNextRef: () => string
}

const seedAdvisoryRequests: AdvisoryRequest[] = [
  {
    id: 'ADV-001',
    ref: 'ADV-2024-001',
    subject: 'Investment Product Compliance Query',
    description: 'Need clarification on compliance requirements for new structured investment product targeting retail customers.',
    businessUnit: 'corporate_banking',
    status: 'in_progress',
    priority: 'high',
    requestedBy: 'Ahmed Al-Rashid',
    requestedDate: '2024-10-15',
    assignedTo: 'Sarah Connor',
    notes: [
      { id: 'N-001', author: 'Sarah Connor', content: 'Reviewed initial documentation. Scheduling meeting with product team.', timestamp: '2024-10-16T09:30:00.000Z' },
      { id: 'N-002', author: 'Ahmed Al-Rashid', content: 'Product launch target is Q1 2025. Need preliminary assessment by end of month.', timestamp: '2024-10-16T14:15:00.000Z' },
    ],
    createdAt: '2024-10-15T08:00:00.000Z',
    updatedAt: '2024-10-16T14:15:00.000Z',
  },
  {
    id: 'ADV-002',
    ref: 'ADV-2024-002',
    subject: 'AML Training Requirements',
    description: 'Request for updated AML training curriculum review and approval for 2025 compliance training program.',
    businessUnit: 'compliance',
    status: 'completed',
    priority: 'medium',
    requestedBy: 'Fatima Hassan',
    requestedDate: '2024-09-28',
    assignedTo: 'Michael Scott',
    notes: [
      { id: 'N-003', author: 'Michael Scott', content: 'Training curriculum reviewed and approved. Meets all SAMA requirements.', timestamp: '2024-10-05T11:00:00.000Z' },
      { id: 'N-004', author: 'Fatima Hassan', content: 'Thank you. Will proceed with rollout.', timestamp: '2024-10-05T15:30:00.000Z' },
    ],
    createdAt: '2024-09-28T08:00:00.000Z',
    updatedAt: '2024-10-05T15:30:00.000Z',
  },
  {
    id: 'ADV-003',
    ref: 'ADV-2024-003',
    subject: 'Data Retention Policy Question',
    description: 'Clarification needed on data retention periods for customer transaction logs under new PDPL requirements.',
    businessUnit: 'it',
    status: 'pending',
    priority: 'low',
    requestedBy: 'Omar Khalil',
    requestedDate: '2024-10-18',
    notes: [],
    createdAt: '2024-10-18T08:00:00.000Z',
    updatedAt: '2024-10-18T08:00:00.000Z',
  },
  {
    id: 'ADV-004',
    ref: 'ADV-2024-004',
    subject: 'Third-Party Due Diligence',
    description: 'Urgent review required for new fintech partnership. Need compliance assessment before contract signing.',
    businessUnit: 'risk_management',
    status: 'in_progress',
    priority: 'high',
    requestedBy: 'Layla Mahmoud',
    requestedDate: '2024-10-14',
    assignedTo: 'Sarah Connor',
    notes: [
      { id: 'N-005', author: 'Sarah Connor', content: 'Initial risk assessment completed. Awaiting additional documentation from vendor.', timestamp: '2024-10-15T16:45:00.000Z' },
    ],
    createdAt: '2024-10-14T08:00:00.000Z',
    updatedAt: '2024-10-15T16:45:00.000Z',
  },
  {
    id: 'ADV-005',
    ref: 'ADV-2024-005',
    subject: 'Regulatory Reporting Timeline',
    description: 'Need guidance on submission deadlines for Q4 regulatory reports to SAMA.',
    businessUnit: 'finance',
    status: 'pending',
    priority: 'medium',
    requestedBy: 'Khalid Al-Otaibi',
    requestedDate: '2024-10-17',
    notes: [],
    createdAt: '2024-10-17T08:00:00.000Z',
    updatedAt: '2024-10-17T08:00:00.000Z',
  },
]

export const useAdvisoryStore = create<AdvisoryState>()(
  persist(
    (set, get) => ({
      advisoryRequests: seedAdvisoryRequests,
      selectedRequest: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'requestedDate',
        direction: 'desc',
      },
      isLoading: false,
      error: null,

      fetchAll: () => {
        // TODO: Replace with actual API call
        const existing = get().advisoryRequests
        set({
          pagination: {
            ...get().pagination,
            total: existing.length,
            totalPages: Math.ceil(existing.length / get().pagination.pageSize),
          },
        })
      },

      fetchById: (id) => {
        // TODO: Replace with actual API call
        return get().advisoryRequests.find(r => r.id === id) ?? null
      },

      create: (data) => {
        // TODO: Replace with actual API call
        const now = new Date().toISOString()
        const ref = get().getNextRef()
        const id = ref.replace('ADV-', 'ADV-').replace(/-/g, '-')
        const newRequest: AdvisoryRequest = {
          ...data,
          id: crypto.randomUUID(),
          ref,
          notes: [],
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          advisoryRequests: [newRequest, ...state.advisoryRequests],
        }))

        return newRequest
      },

      update: (id: string, data: Partial<AdvisoryRequest>) => {
        // TODO: Replace with actual API call
        let updated: AdvisoryRequest | null = null

        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((r) => {
            if (r.id === id) {
              updated = { ...r, ...data, updatedAt: new Date().toISOString() }
              return updated
            }
            return r
          }),
          selectedRequest:
            state.selectedRequest?.id === id
              ? { ...state.selectedRequest, ...data, updatedAt: new Date().toISOString() }
              : state.selectedRequest,
        }))

        if (!updated) throw new Error('Advisory request not found')
        return updated
      },

      delete: (id: string) => {
        // TODO: Replace with actual API call
        set((state) => ({
          advisoryRequests: state.advisoryRequests.filter((r) => r.id !== id),
          selectedRequest:
            state.selectedRequest?.id === id ? null : state.selectedRequest,
        }))
      },

      addNote: (id: string, note: { author: string; content: string }) => {
        // TODO: Replace with actual API call
        const newNote: AdvisoryNote = {
          id: crypto.randomUUID(),
          author: note.author,
          content: note.content,
          timestamp: new Date().toISOString(),
        }

        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((r) => {
            if (r.id === id) {
              return { ...r, notes: [...r.notes, newNote], updatedAt: new Date().toISOString() }
            }
            return r
          }),
          selectedRequest:
            state.selectedRequest?.id === id
              ? { ...state.selectedRequest, notes: [...state.selectedRequest.notes, newNote], updatedAt: new Date().toISOString() }
              : state.selectedRequest,
        }))
      },

      updateStatus: (id: string, status: AdvisoryStatus) => {
        // TODO: Replace with actual API call
        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((r) => {
            if (r.id === id) {
              return { ...r, status, updatedAt: new Date().toISOString() }
            }
            return r
          }),
          selectedRequest:
            state.selectedRequest?.id === id
              ? { ...state.selectedRequest, status, updatedAt: new Date().toISOString() }
              : state.selectedRequest,
        }))
      },

      reassign: (id: string, newAssignee: string) => {
        // TODO: Replace with actual API call
        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((r) => {
            if (r.id === id) {
              return { ...r, assignedTo: newAssignee, updatedAt: new Date().toISOString() }
            }
            return r
          }),
          selectedRequest:
            state.selectedRequest?.id === id
              ? { ...state.selectedRequest, assignedTo: newAssignee, updatedAt: new Date().toISOString() }
              : state.selectedRequest,
        }))
      },

      getNextRef: () => {
        const year = new Date().getFullYear()
        const existing = get().advisoryRequests
          .map(r => r.ref.match(/^ADV-\d{4}-(\d+)$/))
          .filter(Boolean)
          .map(m => parseInt(m![1], 10))
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
        return `ADV-${year}-${String(next).padStart(3, '0')}`
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (request) => set({ selectedRequest: request }),
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
      name: 'advisory-storage',
      version: 2,
      partialize: (state) => ({
        advisoryRequests: state.advisoryRequests,
      }),
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as any
        if (version < 2 && state.advisoryRequests) {
          const seenIds = new Set<string>()
          state.advisoryRequests = state.advisoryRequests.map((a: { id: string }) => {
            if (seenIds.has(a.id)) {
              return { ...a, id: crypto.randomUUID() }
            }
            seenIds.add(a.id)
            return a
          })
        }
        return state
      },
    }
  )
)
