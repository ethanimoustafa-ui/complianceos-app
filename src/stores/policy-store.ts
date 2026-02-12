import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Policy, PolicyFilters, PaginationState, SortState } from '@/types'

interface PolicyState {
  policies: Policy[]
  selectedPolicy: Policy | null
  filters: PolicyFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Policy | null>
  create: (data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Policy>
  update: (id: string, data: Partial<Policy>) => Promise<Policy>
  delete: (id: string) => Promise<void>
  setFilters: (filters: PolicyFilters) => void
  clearFilters: () => void
  setSelected: (policy: Policy | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const usePolicyStore = create<PolicyState>()(
  persist(
    (set, get) => ({
      policies: [],
      selectedPolicy: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'nextReviewDate',
        direction: 'asc',
      },
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Preserve existing policies from persistence
          const existingPolicies = get().policies

          set({
            pagination: {
              ...get().pagination,
              total: existingPolicies.length,
              totalPages: Math.ceil(existingPolicies.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch policies',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))

          const policy = get().policies.find((p) => p.id === id) || null
          set({ selectedPolicy: policy, isLoading: false })
          return policy
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch policy',
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
          const newPolicy: Policy = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          }

          set((state) => ({
            policies: [newPolicy, ...state.policies],
            isLoading: false,
          }))

          return newPolicy
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create policy',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Policy>) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          let updatedPolicy: Policy | null = null

          set((state) => ({
            policies: state.policies.map((p) => {
              if (p.id === id) {
                updatedPolicy = { ...p, ...data, updatedAt: new Date().toISOString() }
                return updatedPolicy
              }
              return p
            }),
            selectedPolicy:
              state.selectedPolicy?.id === id
                ? { ...state.selectedPolicy, ...data, updatedAt: new Date().toISOString() }
                : state.selectedPolicy,
            isLoading: false,
          }))

          if (!updatedPolicy) {
            throw new Error('Policy not found')
          }

          return updatedPolicy
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update policy',
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
            policies: state.policies.filter((p) => p.id !== id),
            selectedPolicy: state.selectedPolicy?.id === id ? null : state.selectedPolicy,
            isLoading: false,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete policy',
            isLoading: false,
          })
          throw error
        }
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (policy) => set({ selectedPolicy: policy }),
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
      name: 'policy-storage',
      partialize: (state) => ({
        policies: state.policies,
      }),
    }
  )
)
