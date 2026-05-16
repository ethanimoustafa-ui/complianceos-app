// Policy category store — Phase 5 server-state migration.
//
// Persists nothing locally. Reads from /api/policy-categories. To stay
// backward-compatible with existing policies that reference categories by
// their legacy slug literals (`compliance`, `it`, …) the store maps server
// `key` → public `id`. The server's UUID is kept in `_serverId` for PATCH /
// DELETE round-trips.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'
import { requirePermission } from '@/lib/rbac-store-gate'

export interface PolicyCategoryItem {
  id: string                    // slug / key — what UI and other stores reference
  label: string                 // EN
  labelAr: string
  isDefault?: boolean
  color?: string
  /** Underlying Postgres UUID (server-assigned). Used for PATCH/DELETE. */
  _serverId?: string
}

interface PolicyCategoryApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: PolicyCategoryApiRow): PolicyCategoryItem {
  return {
    id: row.key,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
    _serverId: row.id,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const seeds: PolicyCategoryItem[] = [
  { id: 'compliance', label: 'Compliance', labelAr: 'الامتثال',         isDefault: true },
  { id: 'it',         label: 'IT',         labelAr: 'تقنية المعلومات',   isDefault: true },
  { id: 'operations', label: 'Operations', labelAr: 'العمليات',          isDefault: true },
  { id: 'risk',       label: 'Risk',       labelAr: 'المخاطر',           isDefault: true },
  { id: 'hr',         label: 'HR',         labelAr: 'الموارد البشرية',    isDefault: true },
  { id: 'finance',    label: 'Finance',    labelAr: 'المالية',            isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

interface PolicyCategoryState {
  categories: PolicyCategoryItem[]
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  /** Returns the new id (slug). The POST is fired and reconciled in background. */
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<PolicyCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
  clearError: () => void
}

export const usePolicyCategoryStore = create<PolicyCategoryState>()((set, get) => ({
  // Seed defaults so existing references keep working until the first fetch.
  // First-fetch skeleton rule (`isLoading && categories.length === 0`) does
  // not apply here because seeds are baked in.
  categories: seeds,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<PolicyCategoryApiRow[]>('/policy-categories')
      const mapped = rows.map(mapRow)
      // Merge: prefer server rows, but ensure default seeds remain present if
      // the server hasn't been backfilled.
      const seen = new Set(mapped.map((c) => c.id))
      const merged = [...mapped]
      for (const seed of seeds) if (!seen.has(seed.id)) merged.push(seed)
      set({ categories: merged, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch policy categories'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    requirePermission('Configure Lists & Categories', { storeName: 'policyCategory', actionName: 'add' })
    const baseKey = slugify(label) || `cat-${Date.now()}`
    const existingIds = new Set(get().categories.map((c) => c.id))
    let id = baseKey
    let n = 2
    while (existingIds.has(id)) id = `${baseKey}-${n++}`

    const optimistic: PolicyCategoryItem = { id, label, labelAr: labelAr ?? label }
    set((s) => ({ categories: [...s.categories, optimistic], isMutating: true, error: null }))

    void (async () => {
      try {
        const row = await api.post<PolicyCategoryApiRow>('/policy-categories', {
          key: id,
          name_en: label,
          name_ar: labelAr ?? label,
          is_default: false,
        })
        const mapped = mapRow(row)
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? mapped : c)),
          isMutating: false,
        }))
      } catch (e) {
        set((s) => ({
          error: errorMessage(e, 'Failed to add policy category'),
          // Roll back the optimistic insert on failure.
          categories: s.categories.filter((c) => c.id !== id),
          isMutating: false,
        }))
      }
    })()

    return id
  },

  update: (id, patch) => {
    requirePermission('Configure Lists & Categories', { storeName: 'policyCategory', actionName: 'update', id })
    const previous = get().categories.find((c) => c.id === id)
    if (!previous) return
    const next: PolicyCategoryItem = { ...previous, ...patch }
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? next : c)),
      isMutating: true,
      error: null,
    }))

    if (!previous._serverId) {
      // Local-only row (e.g. default seed not yet persisted server-side).
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        const body: Record<string, unknown> = {}
        if (patch.label !== undefined) body.name_en = patch.label
        if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
        const row = await api.patch<PolicyCategoryApiRow>(
          `/policy-categories/${previous._serverId}`,
          body,
        )
        const mapped = mapRow(row)
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? mapped : c)),
          isMutating: false,
        }))
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update policy category'), isMutating: false })
      }
    })()
  },

  remove: (id) => {
    requirePermission('Configure Lists & Categories', { storeName: 'policyCategory', actionName: 'remove', id })
    const previous = get().categories.find((c) => c.id === id)
    if (!previous) return
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      isMutating: true,
      error: null,
    }))

    if (!previous._serverId) {
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        await api.delete(`/policy-categories/${previous._serverId}`)
        set({ isMutating: false })
      } catch (e) {
        // Roll back the optimistic removal.
        set((s) => ({
          error: errorMessage(e, 'Failed to remove policy category'),
          categories: [...s.categories, previous],
          isMutating: false,
        }))
      }
    })()
  },

  resetToDefaults: () => {
    requirePermission('Configure Lists & Categories', { storeName: 'policyCategory', actionName: 'resetToDefaults' })
    // Pure client-side reset — server-side defaults are managed via migrations.
    set({ categories: seeds })
  },

  clearError: () => set({ error: null }),
}))
