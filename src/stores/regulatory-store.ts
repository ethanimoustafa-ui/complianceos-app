import { create } from 'zustand'
import type { RegulatoryUpdate, PaginationState, SortState } from '@/types'

interface RegulatoryFilters {
  source?: RegulatoryUpdate['source'][]
  impact?: RegulatoryUpdate['impact'][]
  status?: RegulatoryUpdate['status'][]
  dateRange?: { from: string; to: string }
  search?: string
}

interface RegulatoryState {
  updates: RegulatoryUpdate[]
  selectedUpdate: RegulatoryUpdate | null
  filters: RegulatoryFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<RegulatoryUpdate | null>
  create: (data: Omit<RegulatoryUpdate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<RegulatoryUpdate>
  update: (id: string, data: Partial<RegulatoryUpdate>) => Promise<RegulatoryUpdate>
  delete: (id: string) => Promise<void>
  markAsReviewing: (id: string) => Promise<RegulatoryUpdate>
  markAsImplemented: (id: string) => Promise<RegulatoryUpdate>
  setFilters: (filters: RegulatoryFilters) => void
  clearFilters: () => void
  setSelected: (update: RegulatoryUpdate | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useRegulatoryStore = create<RegulatoryState>((set, get) => ({
  updates: [],
  selectedUpdate: null,
  filters: {},
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  },
  sort: {
    field: 'publishDate',
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
      const mockUpdates: RegulatoryUpdate[] = []

      set({
        updates: mockUpdates,
        pagination: {
          ...get().pagination,
          total: mockUpdates.length,
          totalPages: Math.ceil(mockUpdates.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch regulatory updates',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const update = get().updates.find((u) => u.id === id) || null
      set({ selectedUpdate: update, isLoading: false })
      return update
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch regulatory update',
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

      const newUpdate: RegulatoryUpdate = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        updates: [newUpdate, ...state.updates],
        isLoading: false,
      }))

      return newUpdate
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create regulatory update',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<RegulatoryUpdate>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedItem: RegulatoryUpdate | null = null

      set((state) => ({
        updates: state.updates.map((u) => {
          if (u.id === id) {
            updatedItem = { ...u, ...data, updatedAt: new Date().toISOString() }
            return updatedItem
          }
          return u
        }),
        selectedUpdate:
          state.selectedUpdate?.id === id
            ? { ...state.selectedUpdate, ...data, updatedAt: new Date().toISOString() }
            : state.selectedUpdate,
        isLoading: false,
      }))

      if (!updatedItem) {
        throw new Error('Regulatory update not found')
      }

      return updatedItem
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update regulatory update',
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
        updates: state.updates.filter((u) => u.id !== id),
        selectedUpdate: state.selectedUpdate?.id === id ? null : state.selectedUpdate,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete regulatory update',
        isLoading: false,
      })
      throw error
    }
  },

  markAsReviewing: async (id: string) => {
    return get().update(id, { status: 'reviewing' })
  },

  markAsImplemented: async (id: string) => {
    return get().update(id, { status: 'implemented' })
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (update) => set({ selectedUpdate: update }),
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
