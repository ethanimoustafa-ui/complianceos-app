// Risk category store — Phase 5 server-state migration.
//
// Mirrors policy-category-store: server-backed, maps server `key` → public `id`
// so existing risks referencing legacy slug literals (`operational`, …) keep
// matching. UUID is held in `_serverId` for PATCH / DELETE round-trips.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'
import { requirePermission } from '@/lib/rbac-store-gate'

export interface RiskCategoryItem {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
  /** Underlying Postgres UUID (server-assigned). */
  _serverId?: string
}

interface RiskCategoryApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  color: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: RiskCategoryApiRow): RiskCategoryItem {
  return {
    id: row.key,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
    color: row.color ?? undefined,
    _serverId: row.id,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const seeds: RiskCategoryItem[] = [
  { id: 'operational',  label: 'Operational',  labelAr: 'تشغيلية',     isDefault: true },
  { id: 'financial',    label: 'Financial',    labelAr: 'مالية',       isDefault: true },
  { id: 'compliance',   label: 'Compliance',   labelAr: 'الامتثال',    isDefault: true },
  { id: 'strategic',    label: 'Strategic',    labelAr: 'استراتيجية',   isDefault: true },
  { id: 'reputational', label: 'Reputational', labelAr: 'سمعة',         isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

interface RiskCategoryState {
  categories: RiskCategoryItem[]
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<RiskCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
  clearError: () => void
}

export const useRiskCategoryStore = create<RiskCategoryState>()((set, get) => ({
  categories: seeds,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<RiskCategoryApiRow[]>('/risk-categories')
      const mapped = rows.map(mapRow)
      const seen = new Set(mapped.map((c) => c.id))
      const merged = [...mapped]
      for (const seed of seeds) if (!seen.has(seed.id)) merged.push(seed)
      set({ categories: merged, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch risk categories'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'add' })
    const baseKey = slugify(label) || `cat-${Date.now()}`
    const existingIds = new Set(get().categories.map((c) => c.id))
    let id = baseKey
    let n = 2
    while (existingIds.has(id)) id = `${baseKey}-${n++}`

    const optimistic: RiskCategoryItem = { id, label, labelAr: labelAr ?? label }
    set((s) => ({ categories: [...s.categories, optimistic], isMutating: true, error: null }))

    void (async () => {
      try {
        const row = await api.post<RiskCategoryApiRow>('/risk-categories', {
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
          error: errorMessage(e, 'Failed to add risk category'),
          categories: s.categories.filter((c) => c.id !== id),
          isMutating: false,
        }))
      }
    })()

    return id
  },

  update: (id, patch) => {
    requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'update', id })
    const previous = get().categories.find((c) => c.id === id)
    if (!previous) return
    const next: RiskCategoryItem = { ...previous, ...patch }
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? next : c)),
      isMutating: true,
      error: null,
    }))

    if (!previous._serverId) {
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        const body: Record<string, unknown> = {}
        if (patch.label !== undefined) body.name_en = patch.label
        if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
        if (patch.color !== undefined) body.color = patch.color
        const row = await api.patch<RiskCategoryApiRow>(
          `/risk-categories/${previous._serverId}`,
          body,
        )
        const mapped = mapRow(row)
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? mapped : c)),
          isMutating: false,
        }))
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update risk category'), isMutating: false })
      }
    })()
  },

  remove: (id) => {
    requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'remove', id })
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
        await api.delete(`/risk-categories/${previous._serverId}`)
        set({ isMutating: false })
      } catch (e) {
        set((s) => ({
          error: errorMessage(e, 'Failed to remove risk category'),
          categories: [...s.categories, previous],
          isMutating: false,
        }))
      }
    })()
  },

  resetToDefaults: () => {
    requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'resetToDefaults' })
    set({ categories: seeds })
  },

  clearError: () => set({ error: null }),
}))
