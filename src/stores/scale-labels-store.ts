// Scale-labels store — Phase 5 server-state migration.
//
// Backed by `/api/settings/scale-labels` (GET = list of overrides;
// PATCH = batch upsert `{ overrides: [{ scale, key, lang, value }] }`).
//
// The legacy store kept five per-scale maps as a flat persisted object. We
// keep the same in-memory shape (so all consumer call sites — `getLabel`,
// `setLabel`, `resetLabel` — stay valid) but hydrate it from the API row list
// and PATCH each override through the batch endpoint.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

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

const SCALES: readonly ScaleName[] = [
  'riskLikelihood',
  'riskImpact',
  'monitoringFrequency',
  'auditFrequency',
  'reviewCadence',
] as const

interface ScaleLabelApiRow {
  scale: ScaleName
  key: string
  lang: ScaleLang
  value: string
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface ScaleLabelsState {
  riskLikelihood: Record<string, ScaleLabelOverride>
  riskImpact: Record<string, ScaleLabelOverride>
  monitoringFrequency: Record<string, ScaleLabelOverride>
  auditFrequency: Record<string, ScaleLabelOverride>
  reviewCadence: Record<string, ScaleLabelOverride>

  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  setLabel(scale: ScaleName, key: string | number, lang: ScaleLang, value: string): Promise<void>
  resetLabel(scale: ScaleName, key: string | number): Promise<void>
  getLabel(scale: ScaleName, key: string | number, lang: ScaleLang): string | undefined
  clearError(): void
}

const emptyMap = (): Record<string, ScaleLabelOverride> => ({})

export const useScaleLabelsStore = create<ScaleLabelsState>()((set, get) => ({
  riskLikelihood: emptyMap(),
  riskImpact: emptyMap(),
  monitoringFrequency: emptyMap(),
  auditFrequency: emptyMap(),
  reviewCadence: emptyMap(),

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<ScaleLabelApiRow[]>('/settings/scale-labels')
      const next: Record<ScaleName, Record<string, ScaleLabelOverride>> = {
        riskLikelihood: emptyMap(),
        riskImpact: emptyMap(),
        monitoringFrequency: emptyMap(),
        auditFrequency: emptyMap(),
        reviewCadence: emptyMap(),
      }
      for (const row of rows) {
        if (!SCALES.includes(row.scale)) continue
        const bucket = next[row.scale]
        bucket[row.key] = { ...(bucket[row.key] ?? {}), [row.lang]: row.value }
      }
      set({ ...next, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch scale labels'), isLoading: false })
    }
  },

  setLabel: async (scale, key, lang, value) => {
    const k = String(key)
    // Optimistic update.
    set((s) => {
      const current = s[scale] as Record<string, ScaleLabelOverride>
      const next = { ...current, [k]: { ...(current[k] ?? {}), [lang]: value } }
      return { [scale]: next, isMutating: true, error: null } as Pick<ScaleLabelsState, ScaleName | 'isMutating' | 'error'>
    })
    try {
      await api.patch('/settings/scale-labels', {
        overrides: [{ scale, key: k, lang, value }],
      })
      set({ isMutating: false })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update scale label'), isMutating: false })
      throw e
    }
  },

  resetLabel: async (scale, key) => {
    const k = String(key)
    // The API currently has no DELETE; clear locally and persist an empty
    // string for both langs as a "reset" sentinel. Pages reading via
    // `getLabel` see `undefined` and fall back to the default.
    set((s) => {
      const current = s[scale] as Record<string, ScaleLabelOverride>
      const { [k]: _removed, ...rest } = current
      void _removed
      return { [scale]: rest, isMutating: true, error: null } as Pick<ScaleLabelsState, ScaleName | 'isMutating' | 'error'>
    })
    try {
      await api.patch('/settings/scale-labels', {
        overrides: [
          { scale, key: k, lang: 'en', value: '' },
          { scale, key: k, lang: 'ar', value: '' },
        ],
      })
      set({ isMutating: false })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to reset scale label'), isMutating: false })
      throw e
    }
  },

  getLabel: (scale, key, lang) => {
    const current = get()[scale] as Record<string, ScaleLabelOverride>
    const k = String(key)
    return current[k]?.[lang]
  },

  clearError: () => set({ error: null }),
}))
