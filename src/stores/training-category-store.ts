// Training Categories — Phase 5 server-state migration.
//
// Server-state backed: every read/write goes through `/api/training/categories`.
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && categories.length === 0` (first-fetch). Subsequent refetches
//   keep the prior list visible while `isLoading` flips true.
//
// COMPAT SHIM: the legacy `add/update/remove` actions returned synchronously.
// To keep `EditableSelect` (`onAdd: (label) => string | void`) happy, the
// public methods still return the optimistic local result synchronously and
// fire-and-forget the API call. Errors surface via `error` on the store.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

// `id` is the legacy slug `key` so existing references (e.g.
// `course.category === 'aml'`) keep matching. `uuid` carries the server PK.
export interface TrainingCategoryItem {
  id: string
  uuid?: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
}

interface TrainingCategoryApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: TrainingCategoryApiRow): TrainingCategoryItem {
  return {
    id: row.key,
    uuid: row.id,
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

interface TrainingCategoryState {
  categories: TrainingCategoryItem[]
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<TrainingCategoryItem, 'id' | 'uuid'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
  clearError: () => void
}

export const useTrainingCategoryStore = create<TrainingCategoryState>()((set, get) => ({
  categories: [],
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<TrainingCategoryApiRow[]>('/training/categories')
      set({
        categories: rows.map(mapRow),
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch training categories'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    const baseKey = slugify(label) || `cat-${Date.now()}`
    const existingKeys = new Set(get().categories.map((c) => c.id))
    let key = baseKey
    let n = 2
    while (existingKeys.has(key)) key = `${baseKey}-${n++}`
    const optimistic: TrainingCategoryItem = {
      id: key,
      label,
      labelAr: labelAr ?? label,
      isDefault: false,
    }
    set((s) => ({
      categories: [...s.categories, optimistic],
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const row = await api.post<TrainingCategoryApiRow>('/training/categories', {
          key,
          name_en: label,
          name_ar: labelAr ?? label,
          is_default: false,
        })
        const created = mapRow(row)
        set((s) => ({
          categories: s.categories.map((c) => (c.id === key ? created : c)),
          isMutating: false,
        }))
      } catch (e) {
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== key),
          error: errorMessage(e, 'Failed to add training category'),
          isMutating: false,
        }))
      }
    })()
    return key
  },

  update: (id, patch) => {
    const target = get().categories.find((c) => c.id === id)
    if (!target) return
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      isMutating: true,
      error: null,
    }))
    if (!target.uuid) {
      set({ isMutating: false })
      return
    }
    const body: Record<string, unknown> = {}
    if (patch.label !== undefined) body.name_en = patch.label
    if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
    void (async () => {
      try {
        const row = await api.patch<TrainingCategoryApiRow>(`/training/categories/${target.uuid}`, body)
        const updated = mapRow(row)
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? updated : c)),
          isMutating: false,
        }))
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update training category'), isMutating: false })
      }
    })()
  },

  remove: (id) => {
    const target = get().categories.find((c) => c.id === id)
    if (!target) return
    const previous = get().categories
    set((s) => ({ categories: s.categories.filter((c) => c.id !== id), isMutating: true, error: null }))
    if (!target.uuid) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/training/categories/${target.uuid}`)
        set({ isMutating: false })
      } catch (e) {
        set({ categories: previous, error: errorMessage(e, 'Failed to delete training category'), isMutating: false })
      }
    })()
  },

  // `resetToDefaults` no longer makes sense once the server is authoritative —
  // the row set is whatever the API returns. Kept as a refetch shim so legacy
  // settings UI keeps compiling.
  resetToDefaults: () => {
    void get().fetchAll()
  },

  clearError: () => set({ error: null }),
}))
