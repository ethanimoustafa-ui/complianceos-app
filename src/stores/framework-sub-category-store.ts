// Framework sub-category lookup store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/letter-sub-categories?framework_id=…,
//            PATCH/DELETE /api/letter-sub-categories/[subCategoryId]
//
// Per-framework sub-category. Each entry is scoped by `frameworkId` so every
// regulatory framework (SAMA, CMA, ZATCA, CITC, …) can carry its own list.
//
// SKELETON-LOADING NOTE: render a skeleton when
// `isLoading && subCategories.length === 0` (first fetch).

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

interface SubCategoryApiRow {
  id: string
  framework_id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface SubCategory {
  id: string                 // wire `key` — kept as the public id so persisted
                             // letters that store the sub-category slug keep
                             // matching the lookup.
  rowId?: string             // server-side uuid (used for PATCH/DELETE)
  frameworkId: string
  label: string              // EN
  labelAr: string
  isDefault?: boolean
}

function mapRow(row: SubCategoryApiRow): SubCategory {
  return {
    id: row.key,
    rowId: row.id,
    frameworkId: row.framework_id,
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

interface FrameworkSubCategoryState {
  subCategories: SubCategory[]
  // First-fetch detector: `isLoading && subCategories.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  /** Pulls all sub-categories from the server (across all frameworks). */
  fetchAll: () => Promise<void>
  /** Selector. Filters in-memory; does not refetch. */
  list: (frameworkId: string) => SubCategory[]
  add: (frameworkId: string, label: string, labelAr?: string) => Promise<SubCategory>
  update: (
    id: string,
    patch: Partial<Omit<SubCategory, 'id' | 'frameworkId' | 'rowId'>>,
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useFrameworkSubCategoryStore = create<FrameworkSubCategoryState>()(
  (set, get) => ({
    subCategories: [],
    isLoading: false,
    isMutating: false,
    error: null,
    lastFetched: null,

    fetchAll: async () => {
      set({ isLoading: true, error: null })
      try {
        const rows = await api.get<SubCategoryApiRow[]>('/letter-sub-categories')
        set({
          subCategories: rows.map(mapRow),
          isLoading: false,
          lastFetched: Date.now(),
        })
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to fetch sub-categories'),
          isLoading: false,
        })
      }
    },

    list: (frameworkId) =>
      get().subCategories.filter((sc) => sc.frameworkId === frameworkId),

    add: async (frameworkId, label, labelAr) => {
      set({ isMutating: true, error: null })
      try {
        const baseKey = slugify(label) || `sub-${Date.now()}`
        const existingKeys = new Set(get().subCategories.map((sc) => sc.id))
        let key = baseKey
        let n = 2
        while (existingKeys.has(key)) key = `${baseKey}-${n++}`
        const row = await api.post<SubCategoryApiRow>('/letter-sub-categories', {
          framework_id: frameworkId,
          key,
          name_en: label,
          name_ar: labelAr ?? label,
          is_default: false,
        })
        const created = mapRow(row)
        set((s) => ({
          subCategories: [...s.subCategories, created],
          isMutating: false,
        }))
        return created
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to create sub-category'),
          isMutating: false,
        })
        throw e
      }
    },

    update: async (id, patch) => {
      set({ isMutating: true, error: null })
      try {
        const target = get().subCategories.find((sc) => sc.id === id)
        if (!target?.rowId) {
          throw new ApiClientError(
            'not_found',
            `Sub-category ${id} not loaded from server`,
            404,
          )
        }
        const body: Record<string, unknown> = {}
        if (patch.label !== undefined) body.name_en = patch.label
        if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
        if (patch.isDefault !== undefined) body.is_default = patch.isDefault
        const row = await api.patch<SubCategoryApiRow>(
          `/letter-sub-categories/${target.rowId}`,
          body,
        )
        const updated = mapRow(row)
        set((s) => ({
          subCategories: s.subCategories.map((sc) => (sc.id === id ? updated : sc)),
          isMutating: false,
        }))
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to update sub-category'),
          isMutating: false,
        })
        throw e
      }
    },

    remove: async (id) => {
      set({ isMutating: true, error: null })
      try {
        const target = get().subCategories.find((sc) => sc.id === id)
        if (!target?.rowId) {
          // Already absent from server — drop locally and bail.
          set((s) => ({
            subCategories: s.subCategories.filter((sc) => sc.id !== id),
            isMutating: false,
          }))
          return
        }
        await api.delete(`/letter-sub-categories/${target.rowId}`)
        set((s) => ({
          subCategories: s.subCategories.filter((sc) => sc.id !== id),
          isMutating: false,
        }))
      } catch (e) {
        set({
          error: errorMessage(e, 'Failed to delete sub-category'),
          isMutating: false,
        })
        throw e
      }
    },

    clearError: () => set({ error: null }),
  }),
)

// ── Backwards-compatibility re-export ────────────────────────────────────────
// Older modules import `useSAMASubCategoryStore` and read `.subCategories`
// directly (client-side filtering). Continue exposing that alias so existing
// call-sites keep compiling. New authoring surface is `.list(frameworkId)`.
export const useSAMASubCategoryStore = useFrameworkSubCategoryStore

// Legacy alias kept for any in-tree imports referencing the old name.
export type SAMASubCategoryEntry = SubCategory
