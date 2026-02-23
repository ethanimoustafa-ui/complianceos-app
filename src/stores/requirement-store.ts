import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Requirement, RequirementFilters, RequirementStatus, PaginationState, SortState } from '@/types'

interface RequirementState {
  requirements: Requirement[]
  selectedRequirement: Requirement | null
  filters: RequirementFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => void
  create: (data: Omit<Requirement, 'id' | 'createdAt' | 'updatedAt'>) => Requirement
  update: (id: string, data: Partial<Requirement>) => Requirement
  updateStatus: (id: string, status: RequirementStatus) => void
  delete: (id: string) => void
  setFilters: (filters: RequirementFilters) => void
  clearFilters: () => void
  setSelected: (requirement: Requirement | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  getNextId: () => string
}

const seedRequirements: Requirement[] = [
  { id: 'REQ-001', name: 'SAMA Circular 44321/2024 - Cybersecurity Framework Update', category: 'Cybersecurity', releaseDate: '2024-08-15', status: 'implementing', dueDate: '2024-10-30', description: 'Cybersecurity Framework - Update 4', progress: 80, createdAt: '2024-08-15T08:00:00.000Z', updatedAt: '2024-10-20T08:00:00.000Z' },
  { id: 'REQ-002', name: 'AML/CTF Periodic Review Requirements', category: 'AML/CTF', releaseDate: '2024-09-01', status: 'drafting', dueDate: '2024-11-14', description: 'KYC Update Requirements for Corporates', progress: 30, createdAt: '2024-09-01T08:00:00.000Z', updatedAt: '2024-10-10T08:00:00.000Z' },
  { id: 'REQ-003', name: 'Consumer Protection Rulebook V2.1', category: 'Consumer Protection', releaseDate: '2024-07-20', status: 'completed', dueDate: '2024-09-30', description: 'Rulebook V2.1 Implementation', progress: 100, createdAt: '2024-07-20T08:00:00.000Z', updatedAt: '2024-09-30T08:00:00.000Z' },
  { id: 'REQ-004', name: 'Risk Management Framework - Update 3', category: 'Risk Management', releaseDate: '2024-08-10', status: 'implementing', dueDate: '2024-11-15', progress: 55, createdAt: '2024-08-10T08:00:00.000Z', updatedAt: '2024-10-15T08:00:00.000Z' },
  { id: 'REQ-005', name: 'Data Privacy and Protection Standards', category: 'Data Protection', releaseDate: '2024-06-25', status: 'completed', dueDate: '2024-08-31', progress: 100, createdAt: '2024-06-25T08:00:00.000Z', updatedAt: '2024-08-31T08:00:00.000Z' },
  { id: 'REQ-006', name: 'Business Continuity Planning Requirements', category: 'Operational Risk', releaseDate: '2024-09-15', status: 'pending', dueDate: '2024-12-01', progress: 0, createdAt: '2024-09-15T08:00:00.000Z', updatedAt: '2024-09-15T08:00:00.000Z' },
  { id: 'REQ-007', name: 'Corporate Governance Guidelines Update', category: 'Governance', releaseDate: '2024-07-05', status: 'implementing', dueDate: '2024-10-15', progress: 65, createdAt: '2024-07-05T08:00:00.000Z', updatedAt: '2024-10-10T08:00:00.000Z' },
  { id: 'REQ-008', name: 'Customer Due Diligence Enhancement', category: 'AML/CTF', releaseDate: '2024-08-20', status: 'drafting', dueDate: '2024-11-30', progress: 20, createdAt: '2024-08-20T08:00:00.000Z', updatedAt: '2024-10-05T08:00:00.000Z' },
  { id: 'REQ-009', name: 'IT Security Controls - Baseline Standards', category: 'Cybersecurity', releaseDate: '2024-09-10', status: 'implementing', dueDate: '2024-12-15', progress: 40, createdAt: '2024-09-10T08:00:00.000Z', updatedAt: '2024-10-18T08:00:00.000Z' },
  { id: 'REQ-010', name: 'Financial Crime Prevention Measures', category: 'AML/CTF', releaseDate: '2024-07-30', status: 'completed', dueDate: '2024-09-15', progress: 100, createdAt: '2024-07-30T08:00:00.000Z', updatedAt: '2024-09-15T08:00:00.000Z' },
  { id: 'REQ-011', name: 'Saudization Policy Implementation', category: 'HR Compliance', releaseDate: '2024-06-15', status: 'implementing', dueDate: '2024-11-01', progress: 70, createdAt: '2024-06-15T08:00:00.000Z', updatedAt: '2024-10-12T08:00:00.000Z' },
  { id: 'REQ-012', name: 'Third-Party Risk Management Framework', category: 'Risk Management', releaseDate: '2024-08-25', status: 'drafting', dueDate: '2024-12-30', progress: 15, createdAt: '2024-08-25T08:00:00.000Z', updatedAt: '2024-10-08T08:00:00.000Z' },
  { id: 'REQ-013', name: 'Internal Audit Standards Update', category: 'Governance', releaseDate: '2024-09-20', status: 'pending', dueDate: '2025-01-15', progress: 0, createdAt: '2024-09-20T08:00:00.000Z', updatedAt: '2024-09-20T08:00:00.000Z' },
  { id: 'REQ-014', name: 'Payment Services Regulations', category: 'Consumer Protection', releaseDate: '2024-08-05', status: 'implementing', dueDate: '2024-11-20', progress: 50, createdAt: '2024-08-05T08:00:00.000Z', updatedAt: '2024-10-14T08:00:00.000Z' },
  { id: 'REQ-015', name: 'Cloud Computing Compliance Framework', category: 'Cybersecurity', releaseDate: '2024-10-01', status: 'drafting', dueDate: '2025-02-28', progress: 10, createdAt: '2024-10-01T08:00:00.000Z', updatedAt: '2024-10-18T08:00:00.000Z' },
]

export const useRequirementStore = create<RequirementState>()(
  persist(
    (set, get) => ({
      requirements: seedRequirements,
      selectedRequirement: null,
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

      fetchAll: () => {
        const existing = get().requirements
        set({
          pagination: {
            ...get().pagination,
            total: existing.length,
            totalPages: Math.ceil(existing.length / get().pagination.pageSize),
          },
        })
      },

      create: (data) => {
        const now = new Date().toISOString()
        const id = get().getNextId()
        const newReq: Requirement = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          requirements: [newReq, ...state.requirements],
        }))

        return newReq
      },

      update: (id: string, data: Partial<Requirement>) => {
        let updated: Requirement | null = null

        set((state) => ({
          requirements: state.requirements.map((r) => {
            if (r.id === id) {
              updated = { ...r, ...data, updatedAt: new Date().toISOString() }
              return updated
            }
            return r
          }),
          selectedRequirement:
            state.selectedRequirement?.id === id
              ? { ...state.selectedRequirement, ...data, updatedAt: new Date().toISOString() }
              : state.selectedRequirement,
        }))

        if (!updated) throw new Error('Requirement not found')
        return updated
      },

      updateStatus: (id: string, status: RequirementStatus) => {
        set((state) => ({
          requirements: state.requirements.map((r) => {
            if (r.id === id) {
              return { ...r, status, updatedAt: new Date().toISOString() }
            }
            return r
          }),
          selectedRequirement:
            state.selectedRequirement?.id === id
              ? { ...state.selectedRequirement, status, updatedAt: new Date().toISOString() }
              : state.selectedRequirement,
        }))
      },

      delete: (id: string) => {
        set((state) => ({
          requirements: state.requirements.filter((r) => r.id !== id),
          selectedRequirement:
            state.selectedRequirement?.id === id ? null : state.selectedRequirement,
        }))
      },

      getNextId: () => {
        const existing = get().requirements
          .map(r => r.id.match(/^REQ-(\d+)$/))
          .filter(Boolean)
          .map(m => parseInt(m![1], 10))
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
        return `REQ-${String(next).padStart(3, '0')}`
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (requirement) => set({ selectedRequirement: requirement }),
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
      name: 'requirement-storage',
      partialize: (state) => ({
        requirements: state.requirements,
      }),
    }
  )
)
