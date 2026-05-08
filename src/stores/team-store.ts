import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TeamMember, PaginationState, SortState } from '@/types'
import { STANDARD_PERMISSIONS } from '@/lib/permissions-registry'
import { requirePermission } from '@/lib/rbac-store-gate'

// Re-exported for any direct callers (kept for backwards compat).
export { STANDARD_PERMISSIONS }

function perms(enabled: boolean[]): { label: string; enabled: boolean }[] {
  return STANDARD_PERMISSIONS.map((label, i) => ({ label, enabled: enabled[i] ?? false }))
}

const sampleMembers: TeamMember[] = [
  {
    id: '1', name: 'Sarah Connor', email: 'sarah@company.com', role: 'manager', department: 'Compliance', avatar: 'Sarah', workload: 65, status: 'active', joinedAt: '2023-01-15', nationality: 'Saudi',
    assignments: [
      { title: 'ISO 27001 Annual Review', dueDate: 'Oct 15, 2024' },
      { title: 'SOC2 Internal Audit (Q3)', dueDate: 'Oct 30, 2024' },
    ],
    accessControls: perms([true, true, true, true, false, true, true]),
  },
  {
    id: '2', name: 'Ahmed Khan', email: 'ahmed@company.com', role: 'manager', department: 'Risk Management', avatar: 'Ahmed', workload: 45, status: 'active', joinedAt: '2023-03-20', nationality: 'Saudi',
    assignments: [
      { title: 'Vendor Risk Assessment', dueDate: 'Nov 5, 2024' },
    ],
    accessControls: perms([true, true, true, true, false, true, false]),
  },
  {
    id: '3', name: 'Lisa Martinez', email: 'lisa@company.com', role: 'officer', department: 'Legal', avatar: 'Lisa', workload: 80, status: 'active', joinedAt: '2022-11-01', nationality: 'American',
    assignments: [
      { title: 'GDPR Compliance Check', dueDate: 'Nov 12, 2024' },
    ],
    accessControls: perms([false, false, false, true, true, false, false]),
  },
  {
    id: '4', name: 'Michael Scott', email: 'michael@company.com', role: 'admin', department: 'IT & Cybersecurity', avatar: 'Michael', workload: 55, status: 'active', joinedAt: '2022-06-10', nationality: 'British',
    assignments: [
      { title: 'Q4 Compliance Report', dueDate: 'Dec 1, 2024' },
    ],
    // Admin role grants every permission via `getEffectivePermissions` regardless,
    // but we mirror the full set in accessControls so the member-drawer toggles
    // render as on for transparency.
    accessControls: perms([true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]),
  },
  {
    id: '5', name: 'Dr. Hassan Ali', email: 'hassan@company.com', role: 'manager', department: 'Compliance', avatar: 'Hassan', workload: 70, status: 'active', joinedAt: '2021-09-05', nationality: 'Saudi',
    assignments: [],
    accessControls: perms([true, true, true, false, false, true, true]),
  },
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
  invite: (data: { email: string; role: TeamMember['role']; department: string; fullName?: string }) => Promise<TeamMember>
  update: (id: string, data: Partial<TeamMember>) => Promise<TeamMember>
  updateRole: (memberId: string, newRole: TeamMember['role']) => void
  remove: (id: string) => Promise<void>
  resendInvite: (id: string) => Promise<void>
  setFilters: (filters: TeamFilters) => void
  clearFilters: () => void
  setSelected: (member: TeamMember | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  unassignTask: (memberId: string, assignmentTitle: string) => void
  reassignTask: (fromId: string, toId: string, assignmentTitle: string) => void
  updateBurnoutTimestamps: () => void
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
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
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'invite' })
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))

          const newMember: TeamMember = {
            id: crypto.randomUUID(),
            name: data.fullName || data.email.split('@')[0], // Placeholder name from email
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
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'update', id })
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

      updateRole: (memberId: string, newRole: TeamMember['role']) => {
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: `updateRole:${newRole}`, id: memberId })
        set((state) => ({
          members: state.members.map((m) =>
            m.id === memberId ? { ...m, role: newRole } : m
          ),
          selectedMember:
            state.selectedMember?.id === memberId
              ? { ...state.selectedMember, role: newRole }
              : state.selectedMember,
        }))
      },

      remove: async (id: string) => {
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'remove', id })
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

      unassignTask: (memberId, assignmentTitle) => {
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'unassignTask', id: memberId })
        set((state) => ({
          members: state.members.map((m) =>
            m.id === memberId
              ? { ...m, assignments: (m.assignments || []).filter((a) => a.title !== assignmentTitle) }
              : m
          ),
        }))
      },

      reassignTask: (fromId, toId, assignmentTitle) => {
        requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: `reassignTask:${fromId}->${toId}` })
        set((state) => {
          const fromMember = state.members.find((m) => m.id === fromId)
          const assignment = fromMember?.assignments?.find((a) => a.title === assignmentTitle)
          if (!assignment) return state
          return {
            members: state.members.map((m) => {
              if (m.id === fromId) return { ...m, assignments: (m.assignments || []).filter((a) => a.title !== assignmentTitle) }
              if (m.id === toId) return { ...m, assignments: [...(m.assignments || []), assignment] }
              return m
            }),
          }
        })
      },

      updateBurnoutTimestamps: () =>
        set((state) => ({
          members: state.members.map((m) => {
            const workloadPct = m.workload
            if (workloadPct >= 75) {
              return { ...m, burnoutSince: m.burnoutSince || new Date().toISOString() }
            }
            return { ...m, burnoutSince: undefined }
          }),
        })),
    }),
    {
      name: 'team-storage',
      version: 3,
      partialize: (state) => ({ members: state.members }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { members?: TeamMember[] }
        if (version < 2 && state.members) {
          state.members = state.members.map((m) => {
            const seed = sampleMembers.find((s) => s.id === m.id)
            return {
              ...m,
              accessControls: seed?.accessControls ?? perms([false, false, false, false, false, false, false]),
            }
          })
        }
        if (version < 3) {
          const seedMap = new Map(sampleMembers.map(m => [m.id, m]))
          state.members = (state.members ?? sampleMembers).map(m => {
            const seed = seedMap.get(m.id)
            if (seed && (!m.assignments || m.assignments.length === 0)) {
              return { ...m, assignments: seed.assignments }
            }
            return m
          })
        }
        return state as TeamState
      },
    }
  )
)
