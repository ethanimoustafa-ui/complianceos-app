import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OnboardingRegion {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface OnboardingRegionState {
  regions: OnboardingRegion[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<OnboardingRegion, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: OnboardingRegion[] = [
  { id: 'riyadh',  label: 'Riyadh Region',     labelAr: 'منطقة الرياض',  isDefault: true },
  { id: 'makkah',  label: 'Makkah / Jeddah',   labelAr: 'مكة / جدة',      isDefault: true },
  { id: 'eastern', label: 'Eastern Province',  labelAr: 'المنطقة الشرقية', isDefault: true },
  { id: 'other',   label: 'Other (KSA)',       labelAr: 'أخرى (المملكة)', isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useOnboardingRegionStore = create<OnboardingRegionState>()(
  persist(
    (set, get) => ({
      regions: seeds,

      add: (label, labelAr) => {
        const baseId = slugify(label) || `region-${Date.now()}`
        const existingIds = new Set(get().regions.map((r) => r.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          regions: [...s.regions, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) =>
        set((s) => ({
          regions: s.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      remove: (id) =>
        set((s) => ({
          regions: s.regions.filter((r) => r.isDefault || r.id !== id),
        })),
    }),
    {
      name: 'onboarding-region-storage',
      version: 1,
      partialize: (s) => ({ regions: s.regions }),
    }
  )
)
