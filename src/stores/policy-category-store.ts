import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// PolicyCategory — opaque string id keyed against the (now widened) `PolicyCategory`
// type in `src/types`. Default seeds match the legacy union literals so existing
// policies and policy templates carrying `compliance|it|operations|risk|hr|finance`
// keep matching after the type widening.
export interface PolicyCategoryItem {
  id: string
  label: string // EN
  labelAr: string
  isDefault?: boolean
  // Optional palette override (rare — most callers should consult getCategoryConfig).
  color?: string
}

interface PolicyCategoryState {
  categories: PolicyCategoryItem[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<PolicyCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
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

export const usePolicyCategoryStore = create<PolicyCategoryState>()(
  persist(
    (set, get) => ({
      categories: seeds,

      add: (label, labelAr) => {
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

      update: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      remove: (id) =>
        set((s) => ({
          // Default seeds cannot be deleted — would orphan persisted policies.
          categories: s.categories.filter((c) => c.isDefault || c.id !== id),
        })),

      resetToDefaults: () => set({ categories: seeds }),
    }),
    {
      name: 'policy-category-storage',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted as { categories?: PolicyCategoryItem[] } | undefined) ?? {}
        const existing = state.categories ?? []
        const seenIds = new Set(existing.map((c) => c.id))
        const merged = [...existing]
        for (const seed of seeds) if (!seenIds.has(seed.id)) merged.push(seed)
        return { ...state, categories: merged }
      },
    },
  ),
)
