// Team store — Phase 5 server-state migration.
//
// Server-state backed: profiles, roles, and permissions live in Supabase
// (`/api/team/members*`, `/api/team/logs`). Local state mirrors the server
// list so the UI stays snappy between fetches.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && members.length === 0` (first-fetch). Subsequent refetches
//   keep the prior list visible while `isLoading` flips true.
//
// LEGACY-FIELD MAPPING: the TypeScript `TeamMember.role` is the legacy
// `'officer' | 'manager' | 'admin'` union, while the API uses Supabase role
// keys (`'viewer' | 'auditor' | 'compliance_officer' | 'org_admin'`). The
// `roleApiToTs` / `roleTsToApi` helpers translate at the store boundary.
//
// CLIENT-ONLY FIELDS: `accessControls`, `burnoutSince`, and `assignments` are
// not backed by the API yet — they live in store state and are merged into
// the API-derived members so the existing UI keeps working. Once the matching
// endpoints ship, swap these to API-backed reads/writes.

import { create } from 'zustand'
import type { TeamMember, PaginationState, SortState } from '@/types'
import { STANDARD_PERMISSIONS } from '@/lib/permissions-registry'
import { requirePermission } from '@/lib/rbac-store-gate'
import { useUserLogStore } from '@/stores/user-log-store'
import { api, ApiClientError } from '@/lib/api-client'

// Re-exported for any direct callers (kept for backwards compat).
export { STANDARD_PERMISSIONS }

// ---------- role / status translation ---------------------------------------

type TsRole = TeamMember['role'] // 'auditor' | 'officer' | 'manager' | 'admin'
type ApiRole = TsRole // DB keys == client values after migration 108

// Post-108 the DB and client share the same role keys, so this is a pass-through.
// The legacy cases keep old rows / stale tokens working during the transition.
function roleApiToTs(role: string | null | undefined): TsRole {
  switch (role) {
    case 'auditor':
    case 'officer':
    case 'manager':
    case 'admin':
      return role
    case 'org_admin':
      return 'admin'
    case 'compliance_officer':
      return 'officer'
    case 'viewer':
    default:
      return 'auditor'
  }
}

function roleTsToApi(role: TsRole): ApiRole {
  return role
}

// ---------- API row shapes ---------------------------------------------------

interface ProfileApiRow {
  id: string
  email: string | null
  name: string | null
  role: string | null
  department_id: string | null
  phone: string | null
  avatar_seed: string | null
  workload: number | null
  nationality: string | null
  status: string | null
  joined_at: string | null
  last_login: string | null
  preferred_language: 'en' | 'ar' | null
  created_at: string
  updated_at: string
}

function mapProfileRow(row: ProfileApiRow, previous?: TeamMember): TeamMember {
  return {
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    role: roleApiToTs(row.role),
    department: row.department_id ?? previous?.department ?? '',
    avatar: row.avatar_seed ?? previous?.avatar,
    avatarSeed: row.avatar_seed ?? previous?.avatarSeed,
    workload: row.workload ?? 0,
    status: (row.status as TeamMember['status']) ?? 'active',
    joinedAt: row.joined_at ?? row.created_at,
    nationality: row.nationality ?? previous?.nationality,
    // Local-only fields — preserved from prior state until a matching API ships.
    assignments: previous?.assignments,
    accessControls: previous?.accessControls,
    burnoutSince: previous?.burnoutSince,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store -----------------------------------------------------------

interface TeamFilters {
  role?: TeamMember['role'][]
  department?: string[]
  status?: TeamMember['status'][]
  search?: string
}

interface TeamState {
  members: TeamMember[]
  byId: Record<string, TeamMember>
  selectedMember: TeamMember | null
  filters: TeamFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Actions
  fetchAll: (opts?: { page?: number; pageSize?: number; filters?: Partial<TeamFilters> }) => Promise<void>
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
  clearError: () => void
}

export const useTeamStore = create<TeamState>()((set, get) => ({
  members: [],
  byId: {},
  selectedMember: null,
  filters: {},
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  sort: { field: 'name', direction: 'asc' },
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (opts) => {
    const current = get()
    const page = opts?.page ?? current.pagination.page
    const pageSize = opts?.pageSize ?? current.pagination.pageSize
    const filters = opts?.filters ? { ...current.filters, ...opts.filters } : current.filters

    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: ProfileApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/team/members', {
        page,
        pageSize,
        role: filters.role?.[0] ? roleTsToApi(filters.role[0]) : undefined,
        status: filters.status?.[0],
        q: filters.search,
      })
      const previousById = get().byId
      const members = result.items.map((row) => mapProfileRow(row, previousById[row.id]))
      const byId: Record<string, TeamMember> = {}
      for (const m of members) byId[m.id] = m
      set({
        members,
        byId,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
        filters,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch team members'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<ProfileApiRow>(`/team/members/${id}`)
      const member = mapProfileRow(row, get().byId[id])
      set((s) => ({
        byId: { ...s.byId, [id]: member },
        members: s.members.some((m) => m.id === id) ? s.members.map((m) => (m.id === id ? member : m)) : s.members,
        selectedMember: member,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return member
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch team member'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  invite: async (data) => {
    const actor = requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'invite' })
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<{
        id: string
        email: string
        name: string
        role: string
        status: string
      }>('/team/members/invite', {
        email: data.email,
        name: data.fullName || data.email.split('@')[0],
        role_key: roleTsToApi(data.role),
        // The route expects a UUID; pass undefined if the caller hasn't
        // resolved one yet (legacy `department` is a free-form string).
        department_id: undefined,
      })
      const newMember: TeamMember = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: roleApiToTs(row.role),
        department: data.department,
        workload: 0,
        status: (row.status as TeamMember['status']) ?? 'pending',
        joinedAt: new Date().toISOString(),
      }
      set((s) => ({
        members: [...s.members, newMember],
        byId: { ...s.byId, [newMember.id]: newMember },
        isMutating: false,
      }))

      useUserLogStore.getState().log({
        userId: actor.id,
        action: 'team.member_invited',
        target: newMember.id,
        metadata: { email: data.email, role: data.role, department: data.department },
      })
      return newMember
    } catch (e) {
      // The invite endpoint returns 503 when `SUPABASE_SERVICE_ROLE_KEY` is
      // unset. Surface the message verbatim so the toast tells the operator
      // what to configure.
      const message = errorMessage(e, 'Failed to invite team member')
      set({ error: message, isMutating: false })
      throw e
    }
  },

  update: async (id, data) => {
    requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'update', id })
    set({ isMutating: true, error: null })
    try {
      const body: Record<string, unknown> = {}
      if (data.name !== undefined) body.name = data.name
      if (data.phone !== undefined) body.phone = data.phone
      if (data.role !== undefined) body.role = roleTsToApi(data.role)
      if (data.status !== undefined) body.status = data.status
      if (data.workload !== undefined) body.workload = data.workload
      if (data.nationality !== undefined) body.nationality = data.nationality
      if (data.avatarSeed !== undefined) body.avatar_seed = data.avatarSeed

      let updated: TeamMember
      if (Object.keys(body).length > 0) {
        const row = await api.patch<ProfileApiRow>(`/team/members/${id}`, body)
        updated = mapProfileRow(row, get().byId[id])
      } else {
        // Local-only fields (assignments/accessControls/burnoutSince) — patch
        // in-memory without hitting the API (unless accessControls changed).
        const existing = get().byId[id]
        if (!existing) throw new Error('Team member not found')
        updated = { ...existing }
      }

      // Merge client-only fields the API doesn't yet persist.
      if (data.assignments !== undefined) updated.assignments = data.assignments
      if (data.accessControls !== undefined) {
        updated.accessControls = data.accessControls
        // I1: persist accessControls toggles to user_permissions via the
        // permissions endpoint so backend requirePerm() checks are enforced.
        const permsPayload: Record<string, boolean> = {}
        for (const ac of data.accessControls) {
          permsPayload[ac.label] = ac.enabled
        }
        await api.patch(`/team/members/${id}/permissions`, { permissions: permsPayload })
      }
      if (data.burnoutSince !== undefined) updated.burnoutSince = data.burnoutSince
      if (data.department !== undefined) updated.department = data.department
      if (data.avatar !== undefined) updated.avatar = data.avatar

      set((s) => ({
        members: s.members.map((m) => (m.id === id ? updated : m)),
        byId: { ...s.byId, [id]: updated },
        selectedMember: s.selectedMember?.id === id ? updated : s.selectedMember,
        isMutating: false,
      }))
      return updated
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update team member'), isMutating: false })
      throw e
    }
  },

  updateRole: (memberId, newRole) => {
    const actor = requirePermission('Manage Team & Permissions', {
      storeName: 'team',
      actionName: `updateRole:${newRole}`,
      id: memberId,
    })
    // Optimistic update; PATCH /team/members/[userId] in the background.
    set((state) => ({
      members: state.members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
      byId: state.byId[memberId]
        ? { ...state.byId, [memberId]: { ...state.byId[memberId], role: newRole } }
        : state.byId,
      selectedMember:
        state.selectedMember?.id === memberId
          ? { ...state.selectedMember, role: newRole }
          : state.selectedMember,
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        await api.patch(`/team/members/${memberId}`, { role: roleTsToApi(newRole) })
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update role'), isMutating: false })
      }
    })()
    useUserLogStore.getState().log({
      userId: actor.id,
      action: 'team.member_role_changed',
      target: memberId,
      metadata: { newRole },
    })
  },

  remove: async (id) => {
    const actor = requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'remove', id })
    useUserLogStore.getState().log({
      userId: actor.id,
      action: 'team.member_removed',
      target: id,
    })
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/team/members/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        return {
          members: s.members.filter((m) => m.id !== id),
          byId: rest,
          selectedMember: s.selectedMember?.id === id ? null : s.selectedMember,
          isMutating: false,
        }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to remove team member'), isMutating: false })
      throw e
    }
  },

  resendInvite: async (_id) => {
    // No dedicated endpoint yet — the invite route always sends the recovery
    // email on first invite. Keep this as a noop so callers compile.
    set({ isMutating: false, error: null })
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
        totalPages: Math.max(1, Math.ceil(state.pagination.total / pageSize)),
      },
    })),

  unassignTask: (memberId, assignmentTitle) => {
    requirePermission('Manage Team & Permissions', { storeName: 'team', actionName: 'unassignTask', id: memberId })
    set((state) => ({
      members: state.members.map((m) =>
        m.id === memberId
          ? { ...m, assignments: (m.assignments || []).filter((a) => a.title !== assignmentTitle) }
          : m,
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
          if (m.id === fromId) {
            return { ...m, assignments: (m.assignments || []).filter((a) => a.title !== assignmentTitle) }
          }
          if (m.id === toId) {
            return { ...m, assignments: [...(m.assignments || []), assignment] }
          }
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

  clearError: () => set({ error: null }),
}))
