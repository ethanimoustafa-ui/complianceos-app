import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac-store-gate'

// RiskCategory — opaque string id. Seeds match the legacy union literal
// values: operational | financial | compliance | strategic | reputational
export interface RiskCategoryItem {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
}

interface RiskCategoryState {
  categories: RiskCategoryItem[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<RiskCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
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

export const useRiskCategoryStore = create<RiskCategoryState>()(
  persist(
    (set, get) => ({
      categories: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'add' })
        const baseId = slugify(label) || `cat-${Date.now()}`
        const existingIds = new Set(get().categories.map((c) => c.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          categories: [...s.categories, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'update', id })
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'remove', id })
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
        }))
      },

      resetToDefaults: () => {
        requirePermission('Configure Lists & Categories', { storeName: 'riskCategory', actionName: 'resetToDefaults' })
        set({ categories: seeds })
      },
    }),
    {
      name: 'risk-category-storage',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted as { categories?: RiskCategoryItem[] } | undefined) ?? {}
        const existing = state.categories ?? []
        const seenIds = new Set(existing.map((c) => c.id))
        const merged = [...existing]
        for (const seed of seeds) if (!seenIds.has(seed.id)) merged.push(seed)
        return { ...state, categories: merged }
      },
    },
  ),
)
