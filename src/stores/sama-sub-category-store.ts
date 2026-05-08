import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// SAMA letter sub-category — opaque string id keyed against the existing
// `SAMASubCategory` type union (pre-existing legacy values). Stored values on
// existing letters remain valid even when no longer in the picker.
export interface SAMASubCategory {
  id: string
  label: string // EN
  labelAr: string
  isDefault?: boolean
}

interface SAMASubCategoryState {
  subCategories: SAMASubCategory[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<SAMASubCategory, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: SAMASubCategory[] = [
  { id: 'key-function',               label: 'Key Function Appointment',     labelAr: 'تعيين وظيفة رئيسية',                       isDefault: true },
  { id: 'product-launch',             label: 'Product Launch',                labelAr: 'إطلاق منتج',                                isDefault: true },
  { id: 'equity-participation',       label: 'Equity Participation',          labelAr: 'المشاركة في رأس المال',                     isDefault: true },
  { id: 'circular-clarification',     label: 'Circular Clarification',        labelAr: 'توضيح تعميم',                               isDefault: true },
  { id: 'regulatory-interpretation',  label: 'Regulatory Interpretation',     labelAr: 'تفسير تنظيمي',                              isDefault: true },
  { id: 'quarterly-aml',              label: 'Quarterly AML Report',          labelAr: 'تقرير مكافحة غسل الأموال الربع سنوي',      isDefault: true },
  { id: 'annual-compliance',          label: 'Annual Compliance Report',      labelAr: 'تقرير الامتثال السنوي',                     isDefault: true },
  { id: 'incident-notification',      label: 'Incident Notification',         labelAr: 'إشعار الحوادث',                             isDefault: true },
  { id: 'system-outage',              label: 'System Outage Report',          labelAr: 'تقرير انقطاع النظام',                       isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useSAMASubCategoryStore = create<SAMASubCategoryState>()(
  persist(
    (set, get) => ({
      subCategories: seeds,

      add: (label, labelAr) => {
        const baseId = slugify(label) || `sub-${Date.now()}`
        const existingIds = new Set(get().subCategories.map((sc) => sc.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          subCategories: [
            ...s.subCategories,
            { id, label, labelAr: labelAr ?? label },
          ],
        }))
        return id
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
      version: 1,
    }
  )
)
