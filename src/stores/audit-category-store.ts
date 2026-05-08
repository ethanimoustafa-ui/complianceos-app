import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac-store-gate'

// AuditCategory — opaque string id. Seeds match the legacy union literal
// values: security_compliance | financial_compliance | regulatory_compliance
//                | operational_compliance | hr_compliance | sharia_compliance
export interface AuditCategoryItem {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
  color?: string
}

interface AuditCategoryState {
  categories: AuditCategoryItem[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<AuditCategoryItem, 'id'>>) => void
  remove: (id: string) => void
  resetToDefaults: () => void
}

const seeds: AuditCategoryItem[] = [
  { id: 'security_compliance',    label: 'Security Compliance',    labelAr: 'الامتثال الأمني',         isDefault: true },
  { id: 'financial_compliance',   label: 'Financial Compliance',   labelAr: 'الامتثال المالي',         isDefault: true },
  { id: 'regulatory_compliance',  label: 'Regulatory Compliance',  labelAr: 'الامتثال التنظيمي',       isDefault: true },
  { id: 'operational_compliance', label: 'Operational Compliance', labelAr: 'الامتثال التشغيلي',       isDefault: true },
  { id: 'hr_compliance',          label: 'HR Compliance',          labelAr: 'امتثال الموارد البشرية',  isDefault: true },
  { id: 'sharia_compliance',      label: 'Sharia Compliance',      labelAr: 'الامتثال الشرعي',         isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')

export const useAuditCategoryStore = create<AuditCategoryState>()(
  persist(
    (set, get) => ({
      categories: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'auditCategory', actionName: 'add' })
        const baseId = slugify(label) || `cat_${Date.now()}`
        const existingIds = new Set(get().categories.map((c) => c.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}_${n++}`
        set((s) => ({
          categories: [...s.categories, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'auditCategory', actionName: 'update', id })
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'auditCategory', actionName: 'remove', id })
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
        }))
      },

      resetToDefaults: () => {
        requirePermission('Configure Lists & Categories', { storeName: 'auditCategory', actionName: 'resetToDefaults' })
        set({ categories: seeds })
      },
    }),
    {
      name: 'audit-category-storage',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted as { categories?: AuditCategoryItem[] } | undefined) ?? {}
        const existing = state.categories ?? []
        const seenIds = new Set(existing.map((c) => c.id))
        const merged = [...existing]
        for (const seed of seeds) if (!seenIds.has(seed.id)) merged.push(seed)
        return { ...state, categories: merged }
      },
    },
  ),
)
