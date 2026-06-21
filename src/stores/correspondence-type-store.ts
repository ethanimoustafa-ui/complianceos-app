// Correspondence type lookup store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/correspondence-types,
//            PATCH/DELETE /api/correspondence-types/[typeId]
//
// SKELETON-LOADING NOTE: render a skeleton when `isLoading && types.length === 0`
// (first fetch). Refetches keep stale data visible.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

interface CorrespondenceTypeApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface CorrespondenceType {
  id: string                  // wire `key` — used as `Correspondence.type` value
  rowId?: string              // server uuid (for PATCH/DELETE)
  label: string
  labelAr: string
  isDefault?: boolean
}

function mapRow(row: CorrespondenceTypeApiRow): CorrespondenceType {
  return {
    id: row.key,
    rowId: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

interface CorrespondenceTypeState {
  types: CorrespondenceType[]

  // First-fetch detector: `isLoading && types.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (force?: boolean) => Promise<void>
  add: (label: string, labelAr?: string) => Promise<string>
  update: (
    id: string,
    patch: Partial<Omit<CorrespondenceType, 'id' | 'rowId'>>,
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useCorrespondenceTypeStore = create<CorrespondenceTypeState>()(
  (set, get) => ({
    types: [],
    isLoading: false,
    isMutating: false,
    error: null,
    lastFetched: null,

    fetchAll: async (force = false) => {
      const state = get()
      if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) return
      set({ isLoading: true, error: null })
      try {
        const rows = await api.get<CorrespondenceTypeApiRow[]>('/correspondence-types')
        set({
          types: rows.map(mapRow),
          isLoading: false,
          lastFetched: Date.now(),
        })
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to fetch correspondence types'),
          isLoading: false,
        })
      }
    },

    add: async (label, labelAr) => {
      set({ isMutating: true, error: null })
      try {
        const baseKey = slugify(label) || `cor-type-${Date.now()}`
        const existing = new Set(get().types.map((t) => t.id))
        let key = baseKey
        let n = 2
        while (existing.has(key)) key = `${baseKey}-${n++}`
        const row = await api.post<CorrespondenceTypeApiRow>('/correspondence-types', {
          key,
          name_en: label,
          name_ar: labelAr ?? label,
          is_default: false,
        })
        const created = mapRow(row)
        set((s) => ({ types: [...s.types, created], isMutating: false }))
        return created.id
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to create correspondence type'),
          isMutating: false,
        })
        throw e
      }
    },

    update: async (id, patch) => {
      set({ isMutating: true, error: null })
      try {
        const target = get().types.find((t) => t.id === id)
        if (!target?.rowId) {
          throw new ApiClientError(
            'not_found',
            `Correspondence type ${id} not loaded from server`,
            404,
          )
        }
        const body: Record<string, unknown> = {}
        if (patch.label !== undefined) body.name_en = patch.label
        if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
        if (patch.isDefault !== undefined) body.is_default = patch.isDefault
        const row = await api.patch<CorrespondenceTypeApiRow>(
          `/correspondence-types/${target.rowId}`,
          body,
        )
        const updated = mapRow(row)
        set((s) => ({
          types: s.types.map((t) => (t.id === id ? updated : t)),
          isMutating: false,
        }))
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to update correspondence type'),
          isMutating: false,
        })
        throw e
      }
    },

    remove: async (id) => {
      set({ isMutating: true, error: null })
      try {
        const target = get().types.find((t) => t.id === id)
        if (!target?.rowId) {
          set((s) => ({
            types: s.types.filter((t) => t.id !== id),
            isMutating: false,
          }))
          return
        }
        await api.delete(`/correspondence-types/${target.rowId}`)
        set((s) => ({
          types: s.types.filter((t) => t.id !== id),
          isMutating: false,
        }))
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to delete correspondence type'),
          isMutating: false,
        })
        throw e
      }
    },

    clearError: () => set({ error: null }),
  }),
)
