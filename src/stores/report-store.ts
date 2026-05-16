// Report store — Phase 5 server-state migration.
//
// **Mostly UI state.** The Phase 4 API does not expose a generic Reports CRUD
// endpoint — actual compliance / audit / risk numbers come from
// `/api/reports/compliance-evaluations`, `/api/compliance/score`, and the
// per-resource list endpoints (cross-store aggregation happens client-side).
//
// What this store still holds (kept after migration):
//   - `selectedReport` / `filters` / `sort` / `pagination` — UI cursor state.
//   - `reports` — in-memory list of locally created/scheduled report metadata
//     records. There is no backend persistence yet; pages that schedule a
//     report drop a tracking record here so subsequent renders can show it.
//   - `isGenerating` / `isLoading` — lifecycle flags.
//
// What was removed:
//   - seed `mockReports` arrays (there were never any seeds anyway).
//   - artificial `setTimeout` delays.

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

  // First-fetch rule: `isLoading && reports.length === 0` → render skeleton.
  isLoading: boolean
  isGenerating: boolean
  error: string | null

  fetchAll(): Promise<void>
  fetchById(id: string): Promise<Report | null>
  create(data: Omit<Report, 'id' | 'createdAt' | 'updatedAt'>): Promise<Report>
  update(id: string, data: Partial<Report>): Promise<Report>
  delete(id: string): Promise<void>
  generate(id: string): Promise<Report>
  schedule(id: string, scheduledFor: string): Promise<Report>
  download(id: string): Promise<string>

  setFilters(filters: ReportFilters): void
  clearFilters(): void
  setSelected(report: Report | null): void
  setSort(sort: SortState): void
  setPage(page: number): void
  setPageSize(pageSize: number): void
  clearError(): void
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  selectedReport: null,
  filters: {},
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  sort: { field: 'createdAt', direction: 'desc' },

  isLoading: false,
  isGenerating: false,
  error: null,

  fetchAll: async () => {
    // No backend Reports endpoint yet — the list is just the local in-memory
    // records produced by `create` / `schedule` during this session. We still
    // flip `isLoading` so consumers can render a skeleton on first mount.
    set({ isLoading: true, error: null })
    try {
      const reports = get().reports
      set({
        reports,
        pagination: {
          ...get().pagination,
          total: reports.length,
          totalPages: Math.max(1, Math.ceil(reports.length / get().pagination.pageSize)),
        },
        isLoading: false,
      })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to fetch reports',
        isLoading: false,
      })
    }
  },

  fetchById: async (id) => {
    const report = get().reports.find((r) => r.id === id) ?? null
    set({ selectedReport: report })
    return report
  },

  create: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const now = new Date().toISOString()
      const newReport: Report = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      set((s) => ({ reports: [newReport, ...s.reports], isLoading: false }))
      return newReport
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to create report',
        isLoading: false,
      })
      throw e
    }
  },

  update: async (id, data) => {
    set({ isLoading: true, error: null })
    try {
      const now = new Date().toISOString()
      let updated: Report | null = null
      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id !== id) return r
          updated = { ...r, ...data, updatedAt: now }
          return updated
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? { ...state.selectedReport, ...data, updatedAt: now }
            : state.selectedReport,
        isLoading: false,
      }))
      if (!updated) throw new Error('Report not found')
      return updated
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to update report',
        isLoading: false,
      })
      throw e
    }
  },

  delete: async (id) => {
    set({ isLoading: true, error: null })
    try {
      set((state) => ({
        reports: state.reports.filter((r) => r.id !== id),
        selectedReport: state.selectedReport?.id === id ? null : state.selectedReport,
        isLoading: false,
      }))
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to delete report',
        isLoading: false,
      })
      throw e
    }
  },

  generate: async (id) => {
    set({ isGenerating: true, error: null })
    try {
      const now = new Date().toISOString()
      let generated: Report | null = null
      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id !== id) return r
          generated = {
            ...r,
            status: 'ready',
            generatedAt: now,
            url: `/api/reports/${id}/download`,
            updatedAt: now,
          }
          return generated
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? {
                ...state.selectedReport,
                status: 'ready',
                generatedAt: now,
                url: `/api/reports/${id}/download`,
                updatedAt: now,
              }
            : state.selectedReport,
        isGenerating: false,
      }))
      if (!generated) throw new Error('Report not found')
      return generated
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to generate report',
        isGenerating: false,
      })
      throw e
    }
  },

  schedule: async (id, scheduledFor) => {
    set({ isLoading: true, error: null })
    try {
      const now = new Date().toISOString()
      let scheduled: Report | null = null
      set((state) => ({
        reports: state.reports.map((r) => {
          if (r.id !== id) return r
          scheduled = { ...r, status: 'scheduled', scheduledFor, updatedAt: now }
          return scheduled
        }),
        selectedReport:
          state.selectedReport?.id === id
            ? { ...state.selectedReport, status: 'scheduled', scheduledFor, updatedAt: now }
            : state.selectedReport,
        isLoading: false,
      }))
      if (!scheduled) throw new Error('Report not found')
      return scheduled
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to schedule report',
        isLoading: false,
      })
      throw e
    }
  },

  download: async (id) => {
    const report = get().reports.find((r) => r.id === id)
    if (!report?.url) {
      set({ error: 'Report not available for download' })
      throw new Error('Report not available for download')
    }
    return report.url
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
        totalPages: pageSize > 0 ? Math.max(1, Math.ceil(state.pagination.total / pageSize)) : 1,
      },
    })),
  clearError: () => set({ error: null }),
}))
