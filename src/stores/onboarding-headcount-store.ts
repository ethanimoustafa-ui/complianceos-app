// Onboarding headcount picker — Phase 5 review.
//
// **KEPT PERSISTED (client-only).** Same rationale as
// `onboarding-industry-store.ts`: one consumer in `(auth)/onboarding/page.tsx`,
// no API endpoint, purely cosmetic dropdown.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac-store-gate'

export interface OnboardingHeadcount {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface OnboardingHeadcountState {
  buckets: OnboardingHeadcount[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<OnboardingHeadcount, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: OnboardingHeadcount[] = [
  { id: '1-20',     label: '1 – 20 employees',     labelAr: '١ – ٢٠ موظف',     isDefault: true },
  { id: '21-100',   label: '21 – 100 employees',   labelAr: '٢١ – ١٠٠ موظف',   isDefault: true },
  { id: '101-500',  label: '101 – 500 employees',  labelAr: '١٠١ – ٥٠٠ موظف',  isDefault: true },
  { id: '500+',     label: '500+ employees',       labelAr: 'أكثر من ٥٠٠ موظف', isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useOnboardingHeadcountStore = create<OnboardingHeadcountState>()(
  persist(
    (set, get) => ({
      buckets: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingHeadcount', actionName: 'add' })
        const baseId = slugify(label) || `headcount-${Date.now()}`
        const existingIds = new Set(get().buckets.map((b) => b.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          buckets: [...s.buckets, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingHeadcount', actionName: 'update', id })
        set((s) => ({
          buckets: s.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingHeadcount', actionName: 'remove', id })
        set((s) => ({
          buckets: s.buckets.filter((b) => b.isDefault || b.id !== id),
        }))
      },
    }),
    {
      name: 'onboarding-headcount-storage',
      version: 1,
      partialize: (s) => ({ buckets: s.buckets }),
    }
  )
)
