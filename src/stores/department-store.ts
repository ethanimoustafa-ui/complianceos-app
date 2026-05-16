// Department store — Phase 5 server-state migration.
//
// Backed by `/api/settings/departments` (list/create + per-id PATCH/DELETE).
// Soft-delete via `deleted_at`; system-default rows refuse deletion server-side
// (409 conflict surfaced as `error`). The API row uses `name_en` / `name_ar` /
// `key`; we map to the legacy `Department` interface (`id`, `name`, `nameAr`,
// `isDefault`).

import { create } from 'zustand'
import type { Department } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

interface DepartmentApiRow {
  id: string
  key: string | null
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: DepartmentApiRow): Department {
  return {
    id: row.id,
    name: row.name_en,
    nameAr: row.name_ar,
    isDefault: row.is_default,
    key: row.key ?? undefined,
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface DepartmentState {
  departments: Department[]
  byId: Record<string, Department>

  // First-fetch rule: `isLoading && departments.length === 0` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  /**
   * Optimistic add — returns a tentative `Department` synchronously so
   * `EditableSelect` consumers (`onAdd={(l, ar) => addDepartment(l, ar).id}`)
   * keep working. The real server-issued UUID lands a moment later via the
   * background POST; the optimistic row is replaced in `byId` once the API
   * responds. On failure, the optimistic row is removed and `error` is set.
   */
  addDepartment(name: string, nameAr: string): Department
  removeDepartment(id: string): Promise<void>
  updateDepartment(id: string, data: Partial<Omit<Department, 'id' | 'isDefault'>>): Promise<void>
  getDepartments(): Department[]
  getDepartmentById(id: string): Department | undefined
  clearError(): void
}

export const useDepartmentStore = create<DepartmentState>()((set, get) => ({
  departments: [],
  byId: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<DepartmentApiRow[]>('/settings/departments')
      const departments = rows.map(mapRow)
      const byId: Record<string, Department> = {}
      for (const d of departments) byId[d.id] = d
      set({ departments, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch departments'), isLoading: false })
    }
  },

  addDepartment: (name, nameAr) => {
    // Optimistic local insert. The temp id is a slug; consumers that use
    // `.id` (EditableSelect) get a stable string back synchronously. We
    // replace the temp row with the real server row once the POST returns.
    const tempId = `tmp-${slugify(name) || Date.now()}`
    const slug = slugify(name) || `dept-${Date.now()}`
    const optimistic: Department = { id: tempId, name, nameAr, isDefault: false, key: slug }
    set((s) => ({
      departments: [...s.departments, optimistic],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    ;(async () => {
      try {
        const row = await api.post<DepartmentApiRow>('/settings/departments', {
          key: slug,
          name_en: name,
          name_ar: nameAr,
        })
        const created = mapRow(row)
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            departments: s.departments.map((d) => (d.id === tempId ? created : d)),
            byId: { ...rest, [created.id]: created },
            isMutating: false,
          }
        })
      } catch (e) {
        // Roll back optimistic insert.
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            departments: s.departments.filter((d) => d.id !== tempId),
            byId: rest,
            error: errorMessage(e, 'Failed to add department'),
            isMutating: false,
          }
        })
      }
    })()
    return optimistic
  },

  removeDepartment: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/settings/departments/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        return {
          departments: s.departments.filter((d) => d.id !== id),
          byId: rest,
          isMutating: false,
        }
      })
    } catch (e) {
      // The server returns 409 with table-by-table reference counts in
      // `details` when the row is in use. Pages render the `error` message
      // and can surface details via the ApiClientError instance.
      set({ error: errorMessage(e, 'Failed to delete department'), isMutating: false })
      throw e
    }
  },

  updateDepartment: async (id, data) => {
    set({ isMutating: true, error: null })
    try {
      const payload: Record<string, unknown> = {}
      if (data.name !== undefined) payload.name_en = data.name
      if (data.nameAr !== undefined) payload.name_ar = data.nameAr
      const row = await api.patch<DepartmentApiRow>(`/settings/departments/${id}`, payload)
      const updated = mapRow(row)
      set((s) => ({
        departments: s.departments.map((d) => (d.id === id ? updated : d)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update department'), isMutating: false })
      throw e
    }
  },

  getDepartments: () => get().departments,
  getDepartmentById: (id) => get().byId[id],

  clearError: () => set({ error: null }),
}))
