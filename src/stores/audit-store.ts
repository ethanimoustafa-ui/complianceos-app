import { create } from 'zustand'
import type { Audit, AuditFilters, PaginationState, SortState } from '@/types'

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
}

export const useAuditStore = create<AuditState>((set, get) => ({
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

      // Mock data for now - will be replaced with API response
      const mockAudits: Audit[] = []

      set({
        audits: mockAudits,
        pagination: {
          ...get().pagination,
          total: mockAudits.length,
          totalPages: Math.ceil(mockAudits.length / get().pagination.pageSize),
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

      const newAudit: Audit = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        audits: [newAudit, ...state.audits],
        isLoading: false,
      }))

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

      set((state) => ({
        audits: state.audits.map((a) => {
          if (a.id === id) {
            updatedAudit = { ...a, ...data, updatedAt: new Date().toISOString() }
            return updatedAudit
          }
          return a
        }),
        selectedAudit:
          state.selectedAudit?.id === id
            ? { ...state.selectedAudit, ...data, updatedAt: new Date().toISOString() }
            : state.selectedAudit,
        isLoading: false,
      }))

      if (!updatedAudit) {
        throw new Error('Audit not found')
      }

      return updatedAudit
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
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      set((state) => ({
        audits: state.audits.filter((a) => a.id !== id),
        selectedAudit: state.selectedAudit?.id === id ? null : state.selectedAudit,
        isLoading: false,
      }))
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
}))
