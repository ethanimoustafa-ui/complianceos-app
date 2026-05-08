import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Per-framework sub-category. Each entry is scoped by `frameworkId` so that
// every regulatory framework (SAMA, CMA, ZATCA, CITC, …) can carry its own
// sub-category list. Round-3 §5 generalisation of the previous SAMA-only
// store. v1 entries (which had no `frameworkId`) are migrated to
// `frameworkId: 'sama'` on persist v2.
export interface SubCategory {
  id: string
  frameworkId: string
  label: string // EN
  labelAr: string
  isDefault?: boolean
}

interface FrameworkSubCategoryState {
  subCategories: SubCategory[]
  /**
   * Returns the sub-categories scoped to a single framework. Selector style;
   * does not mutate state.
   */
  list: (frameworkId: string) => SubCategory[]
  add: (frameworkId: string, label: string, labelAr?: string) => SubCategory
  update: (id: string, patch: Partial<Omit<SubCategory, 'id' | 'frameworkId'>>) => void
  remove: (id: string) => void
}

// Existing 9 SAMA seeds — preserved verbatim and tagged with frameworkId.
const seeds: SubCategory[] = [
  { id: 'key-function',               frameworkId: 'sama', label: 'Key Function Appointment',     labelAr: 'تعيين وظيفة رئيسية',                       isDefault: true },
  { id: 'product-launch',             frameworkId: 'sama', label: 'Product Launch',                labelAr: 'إطلاق منتج',                                isDefault: true },
  { id: 'equity-participation',       frameworkId: 'sama', label: 'Equity Participation',          labelAr: 'المشاركة في رأس المال',                     isDefault: true },
  { id: 'circular-clarification',     frameworkId: 'sama', label: 'Circular Clarification',        labelAr: 'توضيح تعميم',                               isDefault: true },
  { id: 'regulatory-interpretation',  frameworkId: 'sama', label: 'Regulatory Interpretation',     labelAr: 'تفسير تنظيمي',                              isDefault: true },
  { id: 'quarterly-aml',              frameworkId: 'sama', label: 'Quarterly AML Report',          labelAr: 'تقرير مكافحة غسل الأموال الربع سنوي',      isDefault: true },
  { id: 'annual-compliance',          frameworkId: 'sama', label: 'Annual Compliance Report',      labelAr: 'تقرير الامتثال السنوي',                     isDefault: true },
  { id: 'incident-notification',      frameworkId: 'sama', label: 'Incident Notification',         labelAr: 'إشعار الحوادث',                             isDefault: true },
  { id: 'system-outage',              frameworkId: 'sama', label: 'System Outage Report',          labelAr: 'تقرير انقطاع النظام',                       isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useFrameworkSubCategoryStore = create<FrameworkSubCategoryState>()(
  persist(
    (set, get) => ({
      subCategories: seeds,

      list: (frameworkId) =>
        get().subCategories.filter((sc) => sc.frameworkId === frameworkId),

      add: (frameworkId, label, labelAr) => {
        const baseId = slugify(label) || `sub-${Date.now()}`
        const existingIds = new Set(get().subCategories.map((sc) => sc.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        const created: SubCategory = {
          id,
          frameworkId,
          label,
          labelAr: labelAr ?? label,
        }
        set((s) => ({ subCategories: [...s.subCategories, created] }))
        return created
      },

      update: (id, patch) =>
        set((s) => ({
          subCategories: s.subCategories.map((sc) =>
            sc.id === id ? { ...sc, ...patch } : sc
          ),
        })),

      remove: (id) =>
        set((s) => ({
          // Seeds are deletable — see SPRINT-FOLLOWUP-PLAN §2.3. Persisted
          // letters retain the raw sub-category id as text-only.
          subCategories: s.subCategories.filter((sc) => sc.id !== id),
        })),
    }),
    {
      name: 'sama-sub-category-storage',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        type LegacyEntry = {
          id: string
          frameworkId?: string
          label: string
          labelAr: string
          isDefault?: boolean
        }
        type PersistShape = { subCategories?: LegacyEntry[] }
        let state: PersistShape = (persisted as PersistShape) ?? {}

        if (version < 2) {
          // v1 entries pre-date the per-framework split — every existing entry
          // is a SAMA sub-category, so backfill `frameworkId: 'sama'`.
          const subCategories = (state.subCategories ?? seeds).map((sc) => ({
            ...sc,
            frameworkId: sc.frameworkId ?? 'sama',
          }))
          state = { subCategories }
        }

        return state as unknown as FrameworkSubCategoryState
      },
    }
  )
)

// ── Backwards-compatibility re-export ────────────────────────────────────────
//
// Older modules import `useSAMASubCategoryStore` and read `.subCategories`
// directly (filtering happens client-side). Continue exposing that shape so
// the type union and any in-flight callers keep compiling. The new authoring
// surface is `useFrameworkSubCategoryStore.list(frameworkId)`.
export const useSAMASubCategoryStore = useFrameworkSubCategoryStore

// Legacy alias kept for any in-tree imports that still reference the old name.
export type SAMASubCategoryEntry = SubCategory
