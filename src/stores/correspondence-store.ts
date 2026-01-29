import { create } from 'zustand'
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
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Correspondence | null>
  create: (data: Omit<Correspondence, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Correspondence>
  update: (id: string, data: Partial<Correspondence>) => Promise<Correspondence>
  delete: (id: string) => Promise<void>
  setFilters: (filters: CorrespondenceFilters) => void
  clearFilters: () => void
  setSelected: (correspondence: Correspondence | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useCorrespondenceStore = create<CorrespondenceState>((set, get) => ({
  correspondence: [],
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

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Mock data for now - will be replaced with API response
      const mockCorrespondence: Correspondence[] = []

      set({
        correspondence: mockCorrespondence,
        pagination: {
          ...get().pagination,
          total: mockCorrespondence.length,
          totalPages: Math.ceil(mockCorrespondence.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch correspondence',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const item = get().correspondence.find((c) => c.id === id) || null
      set({ selectedCorrespondence: item, isLoading: false })
      return item
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch correspondence',
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

      const newCorrespondence: Correspondence = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        correspondence: [newCorrespondence, ...state.correspondence],
        isLoading: false,
      }))

      return newCorrespondence
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create correspondence',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<Correspondence>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedCorrespondence: Correspondence | null = null

      set((state) => ({
        correspondence: state.correspondence.map((c) => {
          if (c.id === id) {
            updatedCorrespondence = { ...c, ...data, updatedAt: new Date().toISOString() }
            return updatedCorrespondence
          }
          return c
        }),
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? { ...state.selectedCorrespondence, ...data, updatedAt: new Date().toISOString() }
            : state.selectedCorrespondence,
        isLoading: false,
      }))

      if (!updatedCorrespondence) {
        throw new Error('Correspondence not found')
      }

      return updatedCorrespondence
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update correspondence',
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
        correspondence: state.correspondence.filter((c) => c.id !== id),
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id ? null : state.selectedCorrespondence,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete correspondence',
        isLoading: false,
      })
      throw error
    }
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
}))
