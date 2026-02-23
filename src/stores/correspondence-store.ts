import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Correspondence, PaginationState, SortState } from '@/types'

interface CorrespondenceFilters {
  type?: Correspondence['type'][]
  status?: Correspondence['status'][]
  dateRange?: { from: string; to: string }
  search?: string
}

interface CorrespondenceState {
  correspondence: Correspondence[]
  selectedCorrespondence: Correspondence | null
  filters: CorrespondenceFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => void
  fetchById: (id: string) => Correspondence | null
  create: (data: Omit<Correspondence, 'id' | 'createdAt' | 'updatedAt'>) => Correspondence
  update: (id: string, data: Partial<Correspondence>) => Correspondence
  delete: (id: string) => void
  setFilters: (filters: CorrespondenceFilters) => void
  clearFilters: () => void
  setSelected: (correspondence: Correspondence | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  getNextReference: () => string
}

const seedCorrespondence: Correspondence[] = [
  {
    id: 'COR-001',
    subject: 'Sent to SAMA',
    from: 'Compliance Department',
    to: ['SAMA'],
    date: '2024-10-20T10:00:00.000Z',
    type: 'sama',
    status: 'sent',
    body: 'Clarification on Risk Management Hub',
    attachments: [],
    archived: false,
    reference: 'CM-9942',
    createdAt: '2024-10-20T10:00:00.000Z',
    updatedAt: '2024-10-20T10:00:00.000Z',
  },
  {
    id: 'COR-002',
    subject: 'Draft - Quarterly Filing',
    from: 'Compliance Department',
    to: ['SAMA'],
    date: '2024-10-19T08:00:00.000Z',
    type: 'sama',
    status: 'draft',
    body: 'Q3 Compliance Report Summary',
    attachments: [],
    archived: false,
    reference: 'CM-9943',
    assignee: 'Felix H.',
    createdAt: '2024-10-19T08:00:00.000Z',
    updatedAt: '2024-10-19T08:00:00.000Z',
  },
]

export const useCorrespondenceStore = create<CorrespondenceState>()(
  persist(
    (set, get) => ({
      correspondence: seedCorrespondence,
      selectedCorrespondence: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'date',
        direction: 'desc',
      },
      isLoading: false,
      error: null,

      fetchAll: () => {
        const existing = get().correspondence
        set({
          pagination: {
            ...get().pagination,
            total: existing.length,
            totalPages: Math.ceil(existing.length / get().pagination.pageSize),
          },
        })
      },

      fetchById: (id: string) => {
        const item = get().correspondence.find((c) => c.id === id) || null
        set({ selectedCorrespondence: item })
        return item
      },

      create: (data) => {
        const now = new Date().toISOString()
        const ref = get().getNextReference()
        const newCorrespondence: Correspondence = {
          ...data,
          id: ref,
          reference: data.reference || ref,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          correspondence: [newCorrespondence, ...state.correspondence],
        }))

        return newCorrespondence
      },

      update: (id: string, data: Partial<Correspondence>) => {
        let updated: Correspondence | null = null

        set((state) => ({
          correspondence: state.correspondence.map((c) => {
            if (c.id === id) {
              updated = { ...c, ...data, updatedAt: new Date().toISOString() }
              return updated
            }
            return c
          }),
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? { ...state.selectedCorrespondence, ...data, updatedAt: new Date().toISOString() }
              : state.selectedCorrespondence,
        }))

        if (!updated) {
          throw new Error('Correspondence not found')
        }

        return updated
      },

      delete: (id: string) => {
        set((state) => ({
          correspondence: state.correspondence.filter((c) => c.id !== id),
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id ? null : state.selectedCorrespondence,
        }))
      },

      getNextReference: () => {
        const existing = get().correspondence
          .map(c => c.id.match(/^COR-(\d+)$/))
          .filter(Boolean)
          .map(m => parseInt(m![1], 10))
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
        return `COR-${String(next).padStart(3, '0')}`
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (correspondence) => set({ selectedCorrespondence: correspondence }),
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
      name: 'correspondence-storage',
      partialize: (state) => ({
        correspondence: state.correspondence,
      }),
    }
  )
)
