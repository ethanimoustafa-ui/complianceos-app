// Authority department lookup store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/authority-departments?authority_id=…,
//            PATCH/DELETE /api/authority-departments/[departmentId]
//
// Per-authority list of departments (e.g. SAMA Banking Supervision, CMA
// Markets Supervision, ...). The previous implementation seeded from the
// static AUTHORITY_DEPARTMENTS map; the server now owns the canonical list and
// seeds it during schema setup. Consumers (letter compose, settings UI) call
// `fetchAll()` then read via `getDepartments(authority)`.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && departments.length === 0` (first fetch only).

import { create } from 'zustand'
import type { DeptDescriptor } from '@/lib/letter-authority'
import { api, ApiClientError } from '@/lib/api-client'

interface AuthorityDeptApiRow {
  id: string
  authority_id: string
  name_en: string
  name_ar: string
  email: string | null
  is_seed: boolean
  created_at: string
  updated_at: string
}

export interface AuthorityDept extends DeptDescriptor {
  isSeed?: boolean
  /** Server uuid for PATCH/DELETE. Distinct from the stable display `id`. */
  rowId?: string
}

function mapRow(row: AuthorityDeptApiRow): AuthorityDept {
  return {
    id: row.id,
    rowId: row.id,
    en: row.name_en,
    ar: row.name_ar,
    email: row.email ?? undefined,
    isSeed: row.is_seed,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const normalizeAuthority = (authority: string): string => {
  if (!authority) return ''
  const lower = authority.toLowerCase()
  return lower === 'sharia' ? 'sharia-board' : lower
}

type ByAuthority = Record<string, AuthorityDept[]>

interface AuthorityDeptState {
  departments: AuthorityDept[]
  byAuthority: ByAuthority

  // First-fetch detector: `isLoading && departments.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (force?: boolean) => Promise<void>
  getDepartments: (authority: string) => AuthorityDept[]
  addDepartment: (
    authority: string,
    en: string,
    ar: string,
    email?: string,
  ) => Promise<AuthorityDept>
  updateDepartment: (
    authority: string,
    deptId: string,
    patch: Partial<Omit<AuthorityDept, 'id' | 'rowId'>>,
  ) => Promise<void>
  removeDepartment: (authority: string, deptId: string) => Promise<void>
  setDepartmentEmail: (authority: string, deptId: string, email: string) => Promise<void>
  clearError: () => void
}

function groupByAuthority(items: AuthorityDept[]): ByAuthority {
  const out: ByAuthority = {}
  for (const dept of items) {
    // Use a private property — DeptDescriptor doesn't expose authority_id; we
    // store it as the bucket key alone. The list passed in has the same shape
    // for every authority, so we rely on a parallel array (see `byAuthority`).
    // This grouping is only meaningful if every dept carries an authority id
    // — we attach it during fetch.
    void dept
  }
  return out
}

export const useAuthorityDeptStore = create<AuthorityDeptState>()((set, get) => ({
  departments: [],
  byAuthority: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (force = false) => {
    const state = get()
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) return
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<AuthorityDeptApiRow[]>('/authority-departments')
      const departments = rows.map(mapRow)
      const byAuthority: ByAuthority = {}
      for (const row of rows) {
        const bucket = normalizeAuthority(row.authority_id)
        if (!byAuthority[bucket]) byAuthority[bucket] = []
        byAuthority[bucket].push(mapRow(row))
      }
      set({
        departments,
        byAuthority,
        isLoading: false,
        lastFetched: Date.now(),
      })
      // Silence unused-import warning while keeping the helper around for
      // future use (caller groupings, etc.).
      void groupByAuthority
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to fetch authority departments'),
        isLoading: false,
      })
    }
  },

  getDepartments: (authority) => get().byAuthority[normalizeAuthority(authority)] ?? [],

  addDepartment: async (authority, en, ar, email) => {
    set({ isMutating: true, error: null })
    try {
      const bucket = normalizeAuthority(authority)
      const row = await api.post<AuthorityDeptApiRow>('/authority-departments', {
        authority_id: bucket,
        name_en: en,
        name_ar: ar || en,
        email,
        is_seed: false,
      })
      const created = mapRow(row)
      set((s) => ({
        departments: [...s.departments, created],
        byAuthority: {
          ...s.byAuthority,
          [bucket]: [...(s.byAuthority[bucket] ?? []), created],
        },
        isMutating: false,
      }))
      return created
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to create authority department'),
        isMutating: false,
      })
      throw e
    }
  },

  updateDepartment: async (authority, deptId, patch) => {
    set({ isMutating: true, error: null })
    try {
      const bucket = normalizeAuthority(authority)
      const body: Record<string, unknown> = {}
      if (patch.en !== undefined) body.name_en = patch.en
      if (patch.ar !== undefined) body.name_ar = patch.ar
      if (patch.email !== undefined) body.email = patch.email
      const row = await api.patch<AuthorityDeptApiRow>(
        `/authority-departments/${deptId}`,
        body,
      )
      const updated = mapRow(row)
      set((s) => ({
        departments: s.departments.map((d) => (d.id === deptId ? updated : d)),
        byAuthority: {
          ...s.byAuthority,
          [bucket]: (s.byAuthority[bucket] ?? []).map((d) =>
            d.id === deptId ? updated : d,
          ),
        },
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to update authority department'),
        isMutating: false,
      })
      throw e
    }
  },

  removeDepartment: async (authority, deptId) => {
    set({ isMutating: true, error: null })
    try {
      const bucket = normalizeAuthority(authority)
      await api.delete(`/authority-departments/${deptId}`)
      set((s) => ({
        departments: s.departments.filter((d) => d.id !== deptId),
        byAuthority: {
          ...s.byAuthority,
          [bucket]: (s.byAuthority[bucket] ?? []).filter((d) => d.id !== deptId),
        },
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to delete authority department'),
        isMutating: false,
      })
      throw e
    }
  },

  setDepartmentEmail: async (authority, deptId, email) => {
    await get().updateDepartment(authority, deptId, { email })
  },

  clearError: () => set({ error: null }),
}))
