// Business unit store — Phase 5 server-state migration.
//
// Backed by `/api/settings/business-units` (list/create) + per-id PATCH/DELETE.
// API rows use `name_en` / `name_ar` / `key`; legacy local shape is the
// `BusinessUnitOption` interface (`id`, `label`, `labelAr`, `isDefault`).
// Deletion is hard-delete server-side; system-defaults refuse, and rows in
// use return 409.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

export interface BusinessUnitOption {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface BusinessUnitApiRow {
  id: string
  key: string | null
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: BusinessUnitApiRow): BusinessUnitOption {
  return {
    id: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
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

interface BusinessUnitState {
  units: BusinessUnitOption[]
  byId: Record<string, BusinessUnitOption>

  // First-fetch rule: `isLoading && units.length === 0` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  /** Optimistic add — see department-store for rationale. */
  add(label: string, labelAr?: string): string
  update(id: string, patch: Partial<Omit<BusinessUnitOption, 'id'>>): Promise<void>
  remove(id: string): Promise<void>
  clearError(): void
}

export const useBusinessUnitStore = create<BusinessUnitState>()((set, get) => ({
  units: [],
  byId: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<BusinessUnitApiRow[]>('/settings/business-units')
      const units = rows.map(mapRow)
      const byId: Record<string, BusinessUnitOption> = {}
      for (const u of units) byId[u.id] = u
      set({ units, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch business units'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    const tempId = `tmp-${slugify(label) || Date.now()}`
    const optimistic: BusinessUnitOption = {
      id: tempId,
      label,
      labelAr: labelAr ?? label,
      isDefault: false,
    }
    set((s) => ({
      units: [...s.units, optimistic],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    ;(async () => {
      try {
        const row = await api.post<BusinessUnitApiRow>('/settings/business-units', {
          key: slugify(label) || `bu-${Date.now()}`,
          name_en: label,
          name_ar: labelAr ?? label,
        })
        const created = mapRow(row)
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            units: s.units.map((u) => (u.id === tempId ? created : u)),
            byId: { ...rest, [created.id]: created },
            isMutating: false,
          }
        })
      } catch (e) {
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            units: s.units.filter((u) => u.id !== tempId),
            byId: rest,
            error: errorMessage(e, 'Failed to add business unit'),
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
      const row = await api.patch<BusinessUnitApiRow>(`/settings/business-units/${id}`, payload)
      const updated = mapRow(row)
      set((s) => ({
        units: s.units.map((u) => (u.id === id ? updated : u)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update business unit'), isMutating: false })
      throw e
    }
  },

  // Optimistic delete — remove the row immediately, restore on failure.
  remove: async (id) => {
    const { units } = get()
    const idx = units.findIndex((u) => u.id === id)
    if (idx === -1) return
    const removed = units[idx]
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return { units: s.units.filter((u) => u.id !== id), byId: rest, isMutating: true, error: null }
    })
    try {
      await api.delete(`/settings/business-units/${id}`)
      set({ isMutating: false })
    } catch (e) {
      // 409 with `details.byTable` references when in use; system-defaults
      // raise their own 409. Roll the row back to its original position.
      set((s) => {
        const next = [...s.units]
        next.splice(Math.min(idx, next.length), 0, removed)
        return {
          units: next,
          byId: { ...s.byId, [id]: removed },
          error: errorMessage(e, 'Failed to delete business unit'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  clearError: () => set({ error: null }),
}))
