// Letter type lookup store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/letter-types, PATCH/DELETE /api/letter-types/[typeId]
//
// SKELETON-LOADING NOTE: render a skeleton when `isLoading && types.length === 0`
// (first fetch). Refetches keep stale data visible while `isLoading` is true.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

// API row (snake_case) from /api/letter-types.
interface LetterTypeApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

// Public shape consumed by UI. The legacy store keyed entries by a slug-style
// `id` field that doubled as the wire `key`; the API treats `id` (uuid) and
// `key` (string) separately. We surface `id` (uuid), `label`, `labelAr` and
// `isDefault` to match the legacy interface, and additionally carry `key` so
// the persisted letter rows (which reference `letter_types.key`) keep matching.
export interface LetterTypeItem {
  id: string
  key: string
  label: string
  labelAr: string
  isDefault?: boolean
}

function mapRow(row: LetterTypeApiRow): LetterTypeItem {
  return {
    id: row.id,
    key: row.key,
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

interface LetterTypeState {
  types: LetterTypeItem[]
  byId: Record<string, LetterTypeItem>

  // First-fetch detector: `isLoading && types.length === 0` → render skeleton.
  // Refetches keep stale data visible while `isLoading` is true.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  add: (label: string, labelAr?: string) => Promise<string>
  update: (id: string, patch: Partial<Omit<LetterTypeItem, 'id'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useLetterTypeStore = create<LetterTypeState>()((set, get) => ({
  types: [],
  byId: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<LetterTypeApiRow[]>('/letter-types')
      const types = rows.map(mapRow)
      const byId: Record<string, LetterTypeItem> = {}
      for (const t of types) byId[t.id] = t
      set({ types, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch letter types'), isLoading: false })
    }
  },

  add: async (label, labelAr) => {
    set({ isMutating: true, error: null })
    try {
      const key = slugify(label) || `type-${Date.now()}`
      const row = await api.post<LetterTypeApiRow>('/letter-types', {
        key,
        name_en: label,
        name_ar: labelAr ?? label,
        is_default: false,
      })
      const created = mapRow(row)
      set((s) => ({
        types: [...s.types, created],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      // Legacy callers used the returned id as the persisted letter `type` key.
      // Return the wire `key` so existing call-sites continue working.
      return created.key
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create letter type'), isMutating: false })
      throw e
    }
  },

  update: async (id, patch) => {
    set({ isMutating: true, error: null })
    try {
      const body: Record<string, unknown> = {}
      if (patch.label !== undefined) body.name_en = patch.label
      if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
      if (patch.key !== undefined) body.key = patch.key
      if (patch.isDefault !== undefined) body.is_default = patch.isDefault
      const row = await api.patch<LetterTypeApiRow>(`/letter-types/${id}`, body)
      const updated = mapRow(row)
      set((s) => ({
        types: s.types.map((t) => (t.id === id ? updated : t)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update letter type'), isMutating: false })
      throw e
    }
  },

  // Optimistic delete — drop the row immediately so the UI doesn't sit on a
  // stale list while the DELETE round-trips (owner: delete felt laggy). On
  // failure, restore the row to its original position.
  remove: async (id) => {
    const { types } = get()
    const idx = types.findIndex((t) => t.id === id)
    if (idx === -1) return
    const removed = types[idx]
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return { types: s.types.filter((t) => t.id !== id), byId: rest, isMutating: true, error: null }
    })
    try {
      await api.delete(`/letter-types/${id}`)
      set({ isMutating: false })
    } catch (e) {
      set((s) => {
        const next = [...s.types]
        next.splice(Math.min(idx, next.length), 0, removed)
        return {
          types: next,
          byId: { ...s.byId, [id]: removed },
          error: errorMessage(e, 'Failed to delete letter type'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  clearError: () => set({ error: null }),
}))
