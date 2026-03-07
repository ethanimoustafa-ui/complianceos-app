import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Risk, RiskFilters, PaginationState, SortState, MonitoringFrequency } from '@/types'
import { computeNextReview } from '@/lib/review-schedule'

function computeNextReviewDate(from: string, frequency: MonitoringFrequency): string {
  const d = new Date(from)
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'semi_annual': d.setMonth(d.getMonth() + 6); break
    case 'annual': d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString()
}

function computeMitigationProgress(checklist?: Array<{ completed: boolean }>): number {
  if (!checklist || checklist.length === 0) return 0
  return Math.round(checklist.filter(i => i.completed).length / checklist.length * 100)
}

interface RiskState {
  risks: Risk[]
  selectedRisk: Risk | null
  filters: RiskFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Risk | null>
  create: (data: Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>) => Promise<Risk>
  update: (id: string, data: Partial<Risk>) => Promise<Risk>
  delete: (id: string) => Promise<void>
  updateStatus: (id: string, newStatus: Risk['status']) => void
  addMitigationItem: (riskId: string, text: string) => void
  editMitigationItem: (riskId: string, itemId: string, newText: string) => void
  toggleMitigationItem: (riskId: string, itemId: string) => void
  removeMitigationItem: (riskId: string, itemId: string) => void
  markReviewed: (riskId: string) => void
  setFilters: (filters: RiskFilters) => void
  clearFilters: () => void
  setSelected: (risk: Risk | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useRiskStore = create<RiskState>()(
  persist(
    (set, get) => ({
      risks: [],
      selectedRisk: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      sort: {
        field: 'riskScore',
        direction: 'desc',
      },
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Preserve existing risks from persistence
          const existingRisks = get().risks

          set({
            pagination: {
              ...get().pagination,
              total: existingRisks.length,
              totalPages: Math.ceil(existingRisks.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch risks',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))

          const risk = get().risks.find((r) => r.id === id) || null
          set({ selectedRisk: risk, isLoading: false })
          return risk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch risk',
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
          // Generate sequential ID like RSK-001, RSK-002, ...
          const existingIds = get().risks
            .map(r => r.id.match(/^RSK-(\d+)$/))
            .filter(Boolean)
            .map(m => parseInt(m![1], 10))
          const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1
          const cadenceToMonitoringFrequency: Record<string, MonitoringFrequency> = {
            monthly: 'monthly', quarterly: 'quarterly', 'semi-annual': 'semi_annual', yearly: 'annual', adhoc: 'monthly',
          }
          const monitoringFrequency = data.reviewSchedule
            ? cadenceToMonitoringFrequency[data.reviewSchedule.cadence] ?? data.monitoringFrequency
            : data.monitoringFrequency
          const nextReviewDate = data.reviewSchedule
            ? computeNextReview(data.reviewSchedule)
            : computeNextReviewDate(now, data.monitoringFrequency)
          const newRisk: Risk = {
            ...data,
            id: `RSK-${String(nextNum).padStart(3, '0')}`,
            riskScore: data.likelihood * data.impact,
            mitigationChecklist: data.mitigationChecklist ?? [],
            mitigationProgress: data.mitigationProgress ?? 0,
            monitoringFrequency,
            lastReviewDate: now,
            nextReviewDate,
            history: [{
              id: crypto.randomUUID(),
              timestamp: now,
              user: data.owner.name,
              action: 'created',
              notes: 'Risk created',
            }],
            createdAt: now,
            updatedAt: now,
          }

          set((state) => ({
            risks: [newRisk, ...state.risks],
            isLoading: false,
          }))

          return newRisk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create risk',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Risk>) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          let updatedRisk: Risk | null = null

          set((state) => ({
            risks: state.risks.map((r) => {
              if (r.id === id) {
                // Recompute riskScore if likelihood or impact changed
                const likelihood = data.likelihood ?? r.likelihood
                const impact = data.impact ?? r.impact
                updatedRisk = {
                  ...r,
                  ...data,
                  riskScore: likelihood * impact,
                  updatedAt: new Date().toISOString(),
                }
                return updatedRisk
              }
              return r
            }),
            selectedRisk:
              state.selectedRisk?.id === id
                ? { ...state.selectedRisk, ...data, updatedAt: new Date().toISOString() }
                : state.selectedRisk,
            isLoading: false,
          }))

          if (!updatedRisk) {
            throw new Error('Risk not found')
          }

          return updatedRisk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update risk',
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
            risks: state.risks.filter((r) => r.id !== id),
            selectedRisk: state.selectedRisk?.id === id ? null : state.selectedRisk,
            isLoading: false,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete risk',
            isLoading: false,
          })
          throw error
        }
      },

      updateStatus: (id: string, newStatus: Risk['status']) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id === id) {
              const now = new Date().toISOString()
              return {
                ...r,
                status: newStatus,
                updatedAt: now,
                history: [
                  ...r.history,
                  {
                    id: crypto.randomUUID(),
                    timestamp: now,
                    user: r.owner.name,
                    action: 'status_changed' as const,
                    previousValue: r.status,
                    newValue: newStatus,
                  },
                ],
              }
            }
            return r
          }),
          selectedRisk:
            state.selectedRisk?.id === id
              ? { ...state.selectedRisk, status: newStatus, updatedAt: new Date().toISOString() }
              : state.selectedRisk,
        }))
      },

      addMitigationItem: (riskId: string, text: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const newItem = { id: crypto.randomUUID(), text, completed: false }
            const checklist = [...(r.mitigationChecklist || []), newItem]
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_added' as const, newValue: text,
              }],
            }
          }),
        }))
      },

      editMitigationItem: (riskId: string, itemId: string, newText: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const checklist = (r.mitigationChecklist || []).map(i =>
              i.id === itemId ? { ...i, text: newText } : i
            )
            return {
              ...r,
              mitigationChecklist: checklist,
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_edited' as const, newValue: newText,
              }],
            }
          }),
        }))
      },

      toggleMitigationItem: (riskId: string, itemId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const checklist = (r.mitigationChecklist || []).map(i =>
              i.id === itemId ? { ...i, completed: !i.completed } : i
            )
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_toggled' as const,
                newValue: checklist.find(i => i.id === itemId)?.text,
              }],
            }
          }),
        }))
      },

      removeMitigationItem: (riskId: string, itemId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const removed = (r.mitigationChecklist || []).find(i => i.id === itemId)
            const checklist = (r.mitigationChecklist || []).filter(i => i.id !== itemId)
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_removed' as const, newValue: removed?.text,
              }],
            }
          }),
        }))
      },

      markReviewed: (riskId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const nextReviewDate = r.reviewSchedule
              ? computeNextReview(r.reviewSchedule, new Date())
              : computeNextReviewDate(now, r.monitoringFrequency)
            return {
              ...r,
              lastReviewDate: now,
              nextReviewDate,
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'reviewed' as const, notes: 'Risk marked as reviewed',
              }],
            }
          }),
        }))
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (risk) => set({ selectedRisk: risk }),
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
      name: 'risk-storage',
      partialize: (state) => ({
        risks: state.risks,
      }),
    }
  )
)
