// Onboarding industry picker — Phase 5 review.
//
// **KEPT PERSISTED (client-only).** Pure UI-defaults store with one
// remaining consumer (`src/app/(auth)/onboarding/page.tsx` after the audit-loop
// iter-2 UI cleanup). No `/api/settings/onboarding/industry` endpoint exists.
// If the onboarding flow is ever removed entirely this file becomes dead and
// can be deleted; until then it stays client-only since the data feeds a
// purely cosmetic dropdown.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac/rbac-store-gate'

// Onboarding industry picker — opaque string id seeded with the original
// hard-coded options. New entries added by the user persist here so any
// future onboarding/profile flow sees them.
export interface OnboardingIndustry {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface OnboardingIndustryState {
  industries: OnboardingIndustry[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<OnboardingIndustry, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: OnboardingIndustry[] = [
  { id: 'government',  label: 'Government Agency',  labelAr: 'جهة حكومية',         isDefault: true },
  { id: 'banking',     label: 'Banking & Finance',  labelAr: 'البنوك والتمويل',    isDefault: true },
  { id: 'energy',      label: 'Energy & Utilities', labelAr: 'الطاقة والمرافق',    isDefault: true },
  { id: 'healthcare',  label: 'Healthcare / Seha',  labelAr: 'الرعاية الصحية / صحة', isDefault: true },
  { id: 'technology',  label: 'Technology / SaaS',  labelAr: 'التقنية / SaaS',     isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useOnboardingIndustryStore = create<OnboardingIndustryState>()(
  persist(
    (set, get) => ({
      industries: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingIndustry', actionName: 'add' })
        const baseId = slugify(label) || `industry-${Date.now()}`
        const existingIds = new Set(get().industries.map((i) => i.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          industries: [
            ...s.industries,
            { id, label, labelAr: labelAr ?? label },
          ],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingIndustry', actionName: 'update', id })
        set((s) => ({
          industries: s.industries.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'onboardingIndustry', actionName: 'remove', id })
        set((s) => ({
          industries: s.industries.filter((i) => i.isDefault || i.id !== id),
        }))
      },
    }),
    {
      name: 'onboarding-industry-storage',
      version: 1,
      partialize: (s) => ({ industries: s.industries }),
    }
  )
)
