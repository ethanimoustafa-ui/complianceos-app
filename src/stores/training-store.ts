import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Training, TrainingFilters, PaginationState, SortState } from '@/types'

interface TrainingState {
  trainings: Training[]
  selectedTraining: Training | null
  filters: TrainingFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Training | null>
  create: (data: Omit<Training, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Training>
  update: (id: string, data: Partial<Training>) => Promise<Training>
  delete: (id: string) => Promise<void>
  setFilters: (filters: TrainingFilters) => void
  clearFilters: () => void
  setSelected: (training: Training | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      trainings: [],
      selectedTraining: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'deadline',
        direction: 'asc',
      },
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Preserve existing trainings from persistence
          const existingTrainings = get().trainings

          set({
            pagination: {
              ...get().pagination,
              total: existingTrainings.length,
              totalPages: Math.ceil(existingTrainings.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch trainings',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))

          const training = get().trainings.find((t) => t.id === id) || null
          set({ selectedTraining: training, isLoading: false })
          return training
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch training',
            isLoading: false,
          })
          return null
        }
      },

      create: async (data) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          const now = new Date().toISOString()
          const newTraining: Training = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          }

          set((state) => ({
            trainings: [newTraining, ...state.trainings],
            isLoading: false,
          }))

          return newTraining
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create training',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Training>) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          let updatedTraining: Training | null = null

          set((state) => ({
            trainings: state.trainings.map((t) => {
              if (t.id === id) {
                updatedTraining = { ...t, ...data, updatedAt: new Date().toISOString() }
                return updatedTraining
              }
              return t
            }),
            selectedTraining:
              state.selectedTraining?.id === id
                ? { ...state.selectedTraining, ...data, updatedAt: new Date().toISOString() }
                : state.selectedTraining,
            isLoading: false,
          }))

          if (!updatedTraining) {
            throw new Error('Training not found')
          }

          return updatedTraining
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update training',
            isLoading: false,
          })
          throw error
        }
      },

      delete: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          set((state) => ({
            trainings: state.trainings.filter((t) => t.id !== id),
            selectedTraining: state.selectedTraining?.id === id ? null : state.selectedTraining,
            isLoading: false,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete training',
            isLoading: false,
          })
          throw error
        }
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (training) => set({ selectedTraining: training }),
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
      name: 'training-storage',
      partialize: (state) => ({
        trainings: state.trainings,
      }),
    }
  )
)
