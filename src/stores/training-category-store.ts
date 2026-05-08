import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// TrainingCategory — opaque string id. Default seeds match the union literal
// values from `src/types/index.ts` (Team Pages Sprint expanded set):
// compliance | aml | cybersecurity | sharia | risk | data-privacy | ethics |
// fraud-prevention | governance | operational-risk | business-continuity |
// sanctions | internal-audit
export interface TrainingCategoryItem {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
}

interface TrainingCategoryState {
  categories: TrainingCategoryItem[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<TrainingCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
}

const seeds: TrainingCategoryItem[] = [
  { id: 'compliance',           label: 'Compliance',           labelAr: 'الامتثال',          isDefault: true },
  { id: 'aml',                  label: 'AML',                  labelAr: 'مكافحة غسل الأموال', isDefault: true },
  { id: 'cybersecurity',        label: 'Cybersecurity',        labelAr: 'الأمن السيبراني',    isDefault: true },
  { id: 'sharia',               label: 'Sharia',               labelAr: 'الشريعة',            isDefault: true },
  { id: 'risk',                 label: 'Risk',                 labelAr: 'المخاطر',            isDefault: true },
  { id: 'data-privacy',         label: 'Data Privacy',         labelAr: 'خصوصية البيانات',    isDefault: true },
  { id: 'ethics',               label: 'Ethics',               labelAr: 'الأخلاقيات',         isDefault: true },
  { id: 'fraud-prevention',     label: 'Fraud Prevention',     labelAr: 'منع الاحتيال',       isDefault: true },
  { id: 'governance',           label: 'Governance',           labelAr: 'الحوكمة',            isDefault: true },
  { id: 'operational-risk',     label: 'Operational Risk',     labelAr: 'مخاطر تشغيلية',      isDefault: true },
  { id: 'business-continuity',  label: 'Business Continuity',  labelAr: 'استمرارية الأعمال',  isDefault: true },
  { id: 'sanctions',            label: 'Sanctions',            labelAr: 'العقوبات',           isDefault: true },
  { id: 'internal-audit',       label: 'Internal Audit',       labelAr: 'التدقيق الداخلي',    isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useTrainingCategoryStore = create<TrainingCategoryState>()(
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
          categories: s.categories.filter((c) => c.isDefault || c.id !== id),
        })),

      resetToDefaults: () => set({ categories: seeds }),
    }),
    {
      name: 'training-category-storage',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted as { categories?: TrainingCategoryItem[] } | undefined) ?? {}
        const existing = state.categories ?? []
        const seenIds = new Set(existing.map((c) => c.id))
        const merged = [...existing]
        for (const seed of seeds) if (!seenIds.has(seed.id)) merged.push(seed)
        return { ...state, categories: merged }
      },
    },
  ),
)
