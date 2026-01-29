import { create } from 'zustand'
import type { SAMALetter, PaginationState, SortState } from '@/types'

interface SAMALetterFilters {
  type?: SAMALetter['type'][]
  status?: SAMALetter['status'][]
  dateRange?: { from: string; to: string }
  search?: string
}

interface SAMALetterState {
  letters: SAMALetter[]
  selectedLetter: SAMALetter | null
  filters: SAMALetterFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<SAMALetter | null>
  create: (data: Omit<SAMALetter, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SAMALetter>
  update: (id: string, data: Partial<SAMALetter>) => Promise<SAMALetter>
  delete: (id: string) => Promise<void>
  send: (id: string) => Promise<SAMALetter>
  setFilters: (filters: SAMALetterFilters) => void
  clearFilters: () => void
  setSelected: (letter: SAMALetter | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useSAMALetterStore = create<SAMALetterState>((set, get) => ({
  letters: [],
  selectedLetter: null,
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
      const mockLetters: SAMALetter[] = []

      set({
        letters: mockLetters,
        pagination: {
          ...get().pagination,
          total: mockLetters.length,
          totalPages: Math.ceil(mockLetters.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch SAMA letters',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const letter = get().letters.find((l) => l.id === id) || null
      set({ selectedLetter: letter, isLoading: false })
      return letter
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch SAMA letter',
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

      const newLetter: SAMALetter = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        letters: [newLetter, ...state.letters],
        isLoading: false,
      }))

      return newLetter
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create SAMA letter',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<SAMALetter>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedLetter: SAMALetter | null = null

      set((state) => ({
        letters: state.letters.map((l) => {
          if (l.id === id) {
            updatedLetter = { ...l, ...data, updatedAt: new Date().toISOString() }
            return updatedLetter
          }
          return l
        }),
        selectedLetter:
          state.selectedLetter?.id === id
            ? { ...state.selectedLetter, ...data, updatedAt: new Date().toISOString() }
            : state.selectedLetter,
        isLoading: false,
      }))

      if (!updatedLetter) {
        throw new Error('SAMA letter not found')
      }

      return updatedLetter
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update SAMA letter',
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
        letters: state.letters.filter((l) => l.id !== id),
        selectedLetter: state.selectedLetter?.id === id ? null : state.selectedLetter,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete SAMA letter',
        isLoading: false,
      })
      throw error
    }
  },

  send: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let sentLetter: SAMALetter | null = null

      set((state) => ({
        letters: state.letters.map((l) => {
          if (l.id === id) {
            sentLetter = {
              ...l,
              status: 'sent',
              sentDate: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            return sentLetter
          }
          return l
        }),
        selectedLetter:
          state.selectedLetter?.id === id
            ? {
                ...state.selectedLetter,
                status: 'sent',
                sentDate: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : state.selectedLetter,
        isLoading: false,
      }))

      if (!sentLetter) {
        throw new Error('SAMA letter not found')
      }

      return sentLetter
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to send SAMA letter',
        isLoading: false,
      })
      throw error
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (letter) => set({ selectedLetter: letter }),
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
