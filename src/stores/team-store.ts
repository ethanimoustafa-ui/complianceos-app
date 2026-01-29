import { create } from 'zustand'
import type { TeamMember, PaginationState, SortState } from '@/types'

// Sample team members for dropdown and display
const sampleMembers: TeamMember[] = [
  { id: '1', name: 'Sarah Connor', email: 'sarah@company.com', role: 'manager', department: 'Compliance', avatar: 'Sarah', workload: 65, status: 'active', joinedAt: '2023-01-15' },
  { id: '2', name: 'Ahmed Khan', email: 'ahmed@company.com', role: 'officer', department: 'Risk Management', avatar: 'Ahmed', workload: 45, status: 'active', joinedAt: '2023-03-20' },
  { id: '3', name: 'Lisa Martinez', email: 'lisa@company.com', role: 'officer', department: 'Legal', avatar: 'Lisa', workload: 80, status: 'active', joinedAt: '2022-11-01' },
  { id: '4', name: 'Michael Scott', email: 'michael@company.com', role: 'admin', department: 'IT & Cybersecurity', avatar: 'Michael', workload: 55, status: 'active', joinedAt: '2022-06-10' },
  { id: '5', name: 'Dr. Hassan Ali', email: 'hassan@company.com', role: 'manager', department: 'Compliance', avatar: 'Hassan', workload: 70, status: 'active', joinedAt: '2021-09-05' },
]

interface TeamFilters {
  role?: TeamMember['role'][]
  department?: string[]
  status?: TeamMember['status'][]
  search?: string
}

interface TeamState {
  members: TeamMember[]
  selectedMember: TeamMember | null
  filters: TeamFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<TeamMember | null>
  invite: (data: { email: string; role: TeamMember['role']; department: string }) => Promise<TeamMember>
  update: (id: string, data: Partial<TeamMember>) => Promise<TeamMember>
  remove: (id: string) => Promise<void>
  resendInvite: (id: string) => Promise<void>
  setFilters: (filters: TeamFilters) => void
  clearFilters: () => void
  setSelected: (member: TeamMember | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useTeamStore = create<TeamState>((set, get) => ({
  members: sampleMembers,
  selectedMember: null,
  filters: {},
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  },
  sort: {
    field: 'name',
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
      const mockMembers: TeamMember[] = []

      set({
        members: mockMembers,
        pagination: {
          ...get().pagination,
          total: mockMembers.length,
          totalPages: Math.ceil(mockMembers.length / get().pagination.pageSize),
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch team members',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const member = get().members.find((m) => m.id === id) || null
      set({ selectedMember: member, isLoading: false })
      return member
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch team member',
        isLoading: false,
      })
      return null
    }
  },

  invite: async (data) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      const newMember: TeamMember = {
        id: crypto.randomUUID(),
        name: data.email.split('@')[0], // Placeholder name from email
        email: data.email,
        role: data.role,
        department: data.department,
        workload: 0,
        status: 'pending',
        joinedAt: new Date().toISOString(),
      }

      set((state) => ({
        members: [...state.members, newMember],
        isLoading: false,
      }))

      return newMember
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to invite team member',
        isLoading: false,
      })
      throw error
    }
  },

  update: async (id: string, data: Partial<TeamMember>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      let updatedMember: TeamMember | null = null

      set((state) => ({
        members: state.members.map((m) => {
          if (m.id === id) {
            updatedMember = { ...m, ...data }
            return updatedMember
          }
          return m
        }),
        selectedMember:
          state.selectedMember?.id === id
            ? { ...state.selectedMember, ...data }
            : state.selectedMember,
        isLoading: false,
      }))

      if (!updatedMember) {
        throw new Error('Team member not found')
      }

      return updatedMember
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update team member',
        isLoading: false,
      })
      throw error
    }
  },

  remove: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      set((state) => ({
        members: state.members.filter((m) => m.id !== id),
        selectedMember: state.selectedMember?.id === id ? null : state.selectedMember,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove team member',
        isLoading: false,
      })
      throw error
    }
  },

  resendInvite: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))
      set({ isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resend invite',
        isLoading: false,
      })
      throw error
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (member) => set({ selectedMember: member }),
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
