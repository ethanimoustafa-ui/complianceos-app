import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac-store-gate'

// Correspondence type — id is opaque string. Seeds match the historical
// `Correspondence.type` literal union; type widened to `string` in
// `src/types/index.ts` so persisted records always render.
export interface CorrespondenceType {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface CorrespondenceTypeState {
  types: CorrespondenceType[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<CorrespondenceType, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: CorrespondenceType[] = [
  { id: 'sama',              label: 'SAMA',              labelAr: 'البنك المركزي السعودي', isDefault: true },
  { id: 'cma',               label: 'CMA',               labelAr: 'هيئة السوق المالية',  isDefault: true },
  { id: 'internal',          label: 'Internal',          labelAr: 'داخلي',                isDefault: true },
  { id: 'external_auditor',  label: 'External Auditor',  labelAr: 'مدقق خارجي',           isDefault: true },
  { id: 'sharia_board',      label: 'Sharia Board',      labelAr: 'الهيئة الشرعية',       isDefault: true },
  { id: 'vendor',            label: 'Vendor',            labelAr: 'مورد',                 isDefault: true },
  { id: 'other',             label: 'Other',             labelAr: 'أخرى',                  isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useCorrespondenceTypeStore = create<CorrespondenceTypeState>()(
  persist(
    (set, get) => ({
      types: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'correspondenceType', actionName: 'add' })
        const baseId = slugify(label) || `cor-type-${Date.now()}`
        const existingIds = new Set(get().types.map((t) => t.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          types: [...s.types, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'correspondenceType', actionName: 'update', id })
        set((s) => ({
          types: s.types.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'correspondenceType', actionName: 'remove', id })
        set((s) => ({
          // Seeds are deletable — see SPRINT-FOLLOWUP-PLAN §2.3.
          types: s.types.filter((t) => t.id !== id),
        }))
      },
    }),
    {
      name: 'correspondence-type-storage',
      version: 1,
      partialize: (s) => ({ types: s.types }),
    }
  )
)
