import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Advisory business unit — id is opaque string. Seeds match the historical
// `BusinessUnit` union literal; widened to `string` in `src/types/index.ts`.
export interface BusinessUnitOption {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface BusinessUnitState {
  units: BusinessUnitOption[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<BusinessUnitOption, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: BusinessUnitOption[] = [
  { id: 'corporate_banking', label: 'Corporate Banking', labelAr: 'الخدمات المصرفية للشركات', isDefault: true },
  { id: 'compliance',        label: 'Compliance',         labelAr: 'الامتثال',                 isDefault: true },
  { id: 'it',                label: 'IT',                 labelAr: 'تقنية المعلومات',         isDefault: true },
  { id: 'risk_management',   label: 'Risk Management',    labelAr: 'إدارة المخاطر',           isDefault: true },
  { id: 'finance',           label: 'Finance',            labelAr: 'المالية',                  isDefault: true },
  { id: 'operations',        label: 'Operations',         labelAr: 'العمليات',                 isDefault: true },
  { id: 'hr',                label: 'HR',                 labelAr: 'الموارد البشرية',         isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useBusinessUnitStore = create<BusinessUnitState>()(
  persist(
    (set, get) => ({
      units: seeds,

      add: (label, labelAr) => {
        const baseId = slugify(label) || `bu-${Date.now()}`
        const existingIds = new Set(get().units.map((u) => u.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          units: [...s.units, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) =>
        set((s) => ({
          units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        })),

      remove: (id) =>
        set((s) => ({
          units: s.units.filter((u) => u.isDefault || u.id !== id),
        })),
    }),
    {
      name: 'business-unit-storage',
      version: 1,
      partialize: (s) => ({ units: s.units }),
    }
  )
)
