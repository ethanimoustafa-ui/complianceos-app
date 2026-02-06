import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ComponentWeights, ComplianceConfig } from '@/lib/compliance-engine.types'

const DEFAULT_WEIGHTS: ComponentWeights = {
  auditCompletion: 25,
  observationClosure: 25,
  riskPosture: 20,
  policyCurrency: 15,
  trainingCompletion: 15,
}

const WEIGHT_BOUNDS: Record<keyof ComponentWeights, { min: number; max: number }> = {
  auditCompletion: { min: 15, max: 35 },
  observationClosure: { min: 15, max: 35 },
  riskPosture: { min: 10, max: 30 },
  policyCurrency: { min: 5, max: 25 },
  trainingCompletion: { min: 5, max: 25 },
}

const DEFAULT_TARGET = 90

interface ComplianceSettingsState {
  weights: ComponentWeights
  targetScore: number
  setWeight: (component: keyof ComponentWeights, value: number) => boolean
  resetWeights: () => void
  setTargetScore: (target: number) => void
  getConfig: () => ComplianceConfig
  isValid: () => boolean
}

export const useComplianceSettingsStore = create<ComplianceSettingsState>()(
  persist(
    (set, get) => ({
      weights: { ...DEFAULT_WEIGHTS },
      targetScore: DEFAULT_TARGET,

      setWeight: (component, value) => {
        const bounds = WEIGHT_BOUNDS[component]
        if (value < bounds.min || value > bounds.max) return false

        const current = get().weights
        const otherSum = Object.entries(current)
          .filter(([k]) => k !== component)
          .reduce((s, [, v]) => s + v, 0)

        if (otherSum + value !== 100) return false

        set({ weights: { ...current, [component]: value } })
        return true
      },

      resetWeights: () => set({ weights: { ...DEFAULT_WEIGHTS } }),

      setTargetScore: (target) => set({ targetScore: Math.min(100, Math.max(0, target)) }),

      getConfig: () => ({
        weights: get().weights,
        targetScore: get().targetScore,
      }),

      isValid: () => {
        const w = get().weights
        const sum = Object.values(w).reduce((s, v) => s + v, 0)
        if (sum !== 100) return false

        for (const [key, val] of Object.entries(w)) {
          const bounds = WEIGHT_BOUNDS[key as keyof ComponentWeights]
          if (val < bounds.min || val > bounds.max) return false
        }
        return true
      },
    }),
    {
      name: 'compliance-settings-storage',
      partialize: (state) => ({
        weights: state.weights,
        targetScore: state.targetScore,
      }),
    }
  )
)
