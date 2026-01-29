import { create } from 'zustand'
import type { Report, PaginationState, SortState } from '@/types'

interface ReportFilters {
  type?: Report['type'][]
  status?: Report['status'][]
  format?: Report['format'][]
  dateRange?: { from: string; to: string }
}

interface ReportState {
  reports: Report[]
  selectedReport: Report | null
  filters: ReportFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  isGenerating: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Report | null>
  create: (data: Omit<Report, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Report>
  update: (id: string, data: Partial<Report>) => Promise<Report>
  delete: (id: string) => Promise<void>
  generate: (id: string) => Promise<Report>
  schedule: (id: string, scheduledFor: string) => Promise<Report>
  download: (id: string) => Promise<string>
  setFilters: (filters: ReportFilters) => void
  clearFilters: () => void
  setSelected: (report: Report | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  selectedReport: null,
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
  isGenerating: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Mock data for now - will be replaced with API response
      const mockReports: Report[] = []

      set({
        reports: mockReports,
        pagination: {
          ...get().pagination,
          total: mockReports.length,
          totalPages: Math.ceil(mockReports.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch reports',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const report = get().reports.find((r) => r.id === id) || null
      set({ selectedReport: report, isLoading: false })
      return report
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch report',
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

      const newReport: Report = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        reports: [newReport, ...state.reports],
        isLoading: false,
      }))

      return newReport
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create report',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<Report>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedReport: Report | null = null

      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id === id) {
            updatedReport = { ...r, ...data, updatedAt: new Date().toISOString() }
            return updatedReport
          }
          return r
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? { ...state.selectedReport, ...data, updatedAt: new Date().toISOString() }
            : state.selectedReport,
        isLoading: false,
      }))

      if (!updatedReport) {
        throw new Error('Report not found')
      }

      return updatedReport
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update report',
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
        reports: state.reports.filter((r) => r.id !== id),
        selectedReport: state.selectedReport?.id === id ? null : state.selectedReport,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete report',
        isLoading: false,
      })
      throw error
    }
  },

  generate: async (id: string) => {
    set({ isGenerating: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 2000)) // Simulate report generation

      let generatedReport: Report | null = null

      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id === id) {
            generatedReport = {
              ...r,
              status: 'ready',
              generatedAt: new Date().toISOString(),
              url: `/api/reports/${id}/download`,
              updatedAt: new Date().toISOString(),
            }
            return generatedReport
          }
          return r
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? {
                ...state.selectedReport,
                status: 'ready',
                generatedAt: new Date().toISOString(),
                url: `/api/reports/${id}/download`,
                updatedAt: new Date().toISOString(),
              }
            : state.selectedReport,
        isGenerating: false,
      }))

      if (!generatedReport) {
        throw new Error('Report not found')
      }

      return generatedReport
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to generate report',
        isGenerating: false,
      })
      throw error
    }
  },

  schedule: async (id: string, scheduledFor: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let scheduledReport: Report | null = null

      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id === id) {
            scheduledReport = {
              ...r,
              status: 'scheduled',
              scheduledFor,
              updatedAt: new Date().toISOString(),
            }
            return scheduledReport
          }
          return r
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? {
                ...state.selectedReport,
                status: 'scheduled',
                scheduledFor,
                updatedAt: new Date().toISOString(),
              }
            : state.selectedReport,
        isLoading: false,
      }))

      if (!scheduledReport) {
        throw new Error('Report not found')
      }

      return scheduledReport
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to schedule report',
        isLoading: false,
      })
      throw error
    }
  },

  download: async (id: string) => {
    try {
      const report = get().reports.find((r) => r.id === id)
      if (!report?.url) {
        throw new Error('Report not available for download')
      }
      // TODO: Replace with actual download logic
      return report.url
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download report',
      })
      throw error
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (report) => set({ selectedReport: report }),
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
