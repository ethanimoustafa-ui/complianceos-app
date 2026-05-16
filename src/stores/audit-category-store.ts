// Audit category store — Phase 5 server-state migration.
//
// Backed by `/api/audit-categories` (list/create) + per-id PATCH/DELETE.
// Routes were shipped in Phase 4 Stage A (audits reference family). Server
// rows use `name_en` / `name_ar` / `key`; legacy local shape is the
// `AuditCategoryItem` interface (`id`, `label`, `labelAr`, `isDefault`).

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

export interface AuditCategoryItem {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
}

interface AuditCategoryApiRow {
  id: string
  key: string | null
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: AuditCategoryApiRow): AuditCategoryItem {
  return {
    id: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface AuditCategoryState {
  categories: AuditCategoryItem[]
  byId: Record<string, AuditCategoryItem>

  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  /** Optimistic add — returns tentative id synchronously. */
  add(label: string, labelAr?: string): string
  update(id: string, patch: Partial<Omit<AuditCategoryItem, 'id'>>): Promise<void>
  remove(id: string): Promise<void>
  resetToDefaults(): void
  clearError(): void
}

export const useAuditCategoryStore = create<AuditCategoryState>()((set) => ({
  categories: [],
  byId: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<AuditCategoryApiRow[]>('/audit-categories')
      const categories = rows.map(mapRow)
      const byId: Record<string, AuditCategoryItem> = {}
      for (const c of categories) byId[c.id] = c
      set({ categories, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audit categories'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    const tempId = `tmp-${slugify(label) || Date.now()}`
    const optimistic: AuditCategoryItem = {
      id: tempId,
      label,
      labelAr: labelAr ?? label,
      isDefault: false,
    }
    set((s) => ({
      categories: [...s.categories, optimistic],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    ;(async () => {
      try {
        const row = await api.post<AuditCategoryApiRow>('/audit-categories', {
          key: slugify(label) || `cat_${Date.now()}`,
          name_en: label,
          name_ar: labelAr ?? label,
        })
        const created = mapRow(row)
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            categories: s.categories.map((c) => (c.id === tempId ? created : c)),
            byId: { ...rest, [created.id]: created },
            isMutating: false,
          }
        })
      } catch (e) {
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            categories: s.categories.filter((c) => c.id !== tempId),
            byId: rest,
            error: errorMessage(e, 'Failed to add audit category'),
            isMutating: false,
          }
        })
      }
    })()
    return tempId
  },

  update: async (id, patch) => {
    set({ isMutating: true, error: null })
    try {
      const payload: Record<string, unknown> = {}
      if (patch.label !== undefined) payload.name_en = patch.label
      if (patch.labelAr !== undefined) payload.name_ar = patch.labelAr
      const row = await api.patch<AuditCategoryApiRow>(`/audit-categories/${id}`, payload)
      const updated = mapRow(row)
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? updated : c)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update audit category'), isMutating: false })
      throw e
    }
  },

  remove: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/audit-categories/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        return {
          categories: s.categories.filter((c) => c.id !== id),
          byId: rest,
          isMutating: false,
        }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete audit category'), isMutating: false })
      throw e
    }
  },

  resetToDefaults: () => {
    // Server-side seed defaults are immutable through this endpoint;
    // this client-only reset clears any user-added items locally. A full
    // reset would require server-side admin tooling.
    set((s) => ({
      categories: s.categories.filter((c) => c.isDefault),
      byId: Object.fromEntries(Object.entries(s.byId).filter(([, v]) => v.isDefault)),
    }))
  },

  clearError: () => set({ error: null }),
}))
