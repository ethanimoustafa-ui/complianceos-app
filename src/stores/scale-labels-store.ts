import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Bucket-D label-only override store. Canonical record values (likelihood
// integers, frequency keys, etc.) are NEVER changed by this store — it only
// overrides the display label rendered to the user. Consumers should:
//   const label = useScaleLabelsStore.getState().getLabel(scale, key, lang) ?? defaultLabel
// so they never break when overrides are absent.

export type ScaleLang = 'en' | 'ar'
export interface ScaleLabelOverride {
  en?: string
  ar?: string
}

export type ScaleName =
  | 'riskLikelihood'
  | 'riskImpact'
  | 'monitoringFrequency'
  | 'auditFrequency'
  | 'reviewCadence'

interface ScaleLabelsState {
  riskLikelihood: Record<string, ScaleLabelOverride>
  riskImpact: Record<string, ScaleLabelOverride>
  monitoringFrequency: Record<string, ScaleLabelOverride>
  auditFrequency: Record<string, ScaleLabelOverride>
  reviewCadence: Record<string, ScaleLabelOverride>
  setLabel: (scale: ScaleName, key: string | number, lang: ScaleLang, value: string) => void
  resetLabel: (scale: ScaleName, key: string | number) => void
  getLabel: (scale: ScaleName, key: string | number, lang: ScaleLang) => string | undefined
}

const emptyMap = (): Record<string, ScaleLabelOverride> => ({})

export const useScaleLabelsStore = create<ScaleLabelsState>()(
  persist(
    (set, get) => ({
      riskLikelihood: emptyMap(),
      riskImpact: emptyMap(),
      monitoringFrequency: emptyMap(),
      auditFrequency: emptyMap(),
      reviewCadence: emptyMap(),

      setLabel: (scale, key, lang, value) => {
        set((s) => {
          const current = s[scale] as Record<string, ScaleLabelOverride>
          const k = String(key)
          const next = { ...current, [k]: { ...(current[k] ?? {}), [lang]: value } }
          return { [scale]: next } as Pick<ScaleLabelsState, ScaleName>
        })
      },

      resetLabel: (scale, key) => {
        set((s) => {
          const current = s[scale] as Record<string, ScaleLabelOverride>
          const k = String(key)
          const { [k]: _removed, ...rest } = current
          void _removed
          return { [scale]: rest } as Pick<ScaleLabelsState, ScaleName>
        })
      },

      getLabel: (scale, key, lang) => {
        const current = get()[scale] as Record<string, ScaleLabelOverride>
        const k = String(key)
        return current[k]?.[lang]
      },
    }),
    {
      name: 'scale-labels-storage',
      version: 1,
      partialize: (s) => ({
        riskLikelihood: s.riskLikelihood,
        riskImpact: s.riskImpact,
        monitoringFrequency: s.monitoringFrequency,
        auditFrequency: s.auditFrequency,
        reviewCadence: s.reviewCadence,
      }),
    }
  )
)
