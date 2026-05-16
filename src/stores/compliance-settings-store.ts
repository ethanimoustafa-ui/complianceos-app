// Compliance settings store — Phase 5 server-state migration.
//
// Singleton row backed by `/api/settings/compliance-settings` (one row marked
// `singleton = true`). Holds the global component weights (auditCompletion,
// observationClosure, riskPosture, policyCurrency, trainingCompletion), the
// dashboard target score, and the audit retention horizon.
//
// Persist middleware + DEFAULT seed values are stripped; weights/target are
// hydrated from the API on first `fetch()`. Until the first fetch returns,
// `weights` and `targetScore` mirror sensible defaults so dashboards render
// without flicker (skeleton rule: `isLoading && lastFetched === null`).

import { create } from 'zustand'
import type { ComponentWeights, ComplianceConfig } from '@/lib/compliance-engine.types'
import { api, ApiClientError } from '@/lib/api-client'

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

interface ComplianceSettingsApiRow {
  id: string
  weights: Partial<ComponentWeights> | null
  target_score: number | null
  audit_retention_years: number | null
  singleton: boolean
  created_at: string
  updated_at: string
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

function mergeWeights(api: Partial<ComponentWeights> | null | undefined): ComponentWeights {
  return { ...DEFAULT_WEIGHTS, ...(api ?? {}) }
}

interface ComplianceSettingsState {
  weights: ComponentWeights
  targetScore: number
  auditRetentionYears: number

  // First-fetch rule: `isLoading && lastFetched === null` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetch(): Promise<void>
  setWeight(component: keyof ComponentWeights, value: number): Promise<boolean>
  resetWeights(): Promise<void>
  setTargetScore(target: number): Promise<void>
  setAuditRetentionYears(years: number): Promise<void>

  // Local helpers — no API call.
  getConfig(): ComplianceConfig
  isValid(): boolean
  clearError(): void
}

export const useComplianceSettingsStore = create<ComplianceSettingsState>()((set, get) => ({
  weights: { ...DEFAULT_WEIGHTS },
  targetScore: DEFAULT_TARGET,
  auditRetentionYears: 7,

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<ComplianceSettingsApiRow>('/settings/compliance-settings')
      set({
        weights: mergeWeights(row.weights),
        targetScore: row.target_score ?? DEFAULT_TARGET,
        auditRetentionYears: row.audit_retention_years ?? 7,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch compliance settings'), isLoading: false })
    }
  },

  setWeight: async (component, value) => {
    const bounds = WEIGHT_BOUNDS[component]
    if (value < bounds.min || value > bounds.max) return false

    const current = get().weights
    const otherSum = Object.entries(current)
      .filter(([k]) => k !== component)
      .reduce((s, [, v]) => s + v, 0)
    if (otherSum + value !== 100) return false

    const newWeights: ComponentWeights = { ...current, [component]: value }
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<ComplianceSettingsApiRow>('/settings/compliance-settings', {
        weights: { [component]: value },
      })
      set({
        weights: mergeWeights(row.weights ?? newWeights),
        targetScore: row.target_score ?? get().targetScore,
        auditRetentionYears: row.audit_retention_years ?? get().auditRetentionYears,
        isMutating: false,
      })
      return true
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update weight'), isMutating: false })
      throw e
    }
  },

  resetWeights: async () => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<ComplianceSettingsApiRow>('/settings/compliance-settings', {
        weights: { ...DEFAULT_WEIGHTS },
      })
      set({
        weights: mergeWeights(row.weights),
        targetScore: row.target_score ?? get().targetScore,
        auditRetentionYears: row.audit_retention_years ?? get().auditRetentionYears,
        isMutating: false,
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to reset weights'), isMutating: false })
      throw e
    }
  },

  setTargetScore: async (target) => {
    const clamped = Math.min(100, Math.max(0, target))
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<ComplianceSettingsApiRow>('/settings/compliance-settings', {
        target_score: clamped,
      })
      set({
        weights: mergeWeights(row.weights),
        targetScore: row.target_score ?? clamped,
        auditRetentionYears: row.audit_retention_years ?? get().auditRetentionYears,
        isMutating: false,
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update target score'), isMutating: false })
      throw e
    }
  },

  setAuditRetentionYears: async (years) => {
    const clamped = Math.max(1, Math.floor(years))
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<ComplianceSettingsApiRow>('/settings/compliance-settings', {
        audit_retention_years: clamped,
      })
      set({
        weights: mergeWeights(row.weights),
        targetScore: row.target_score ?? get().targetScore,
        auditRetentionYears: row.audit_retention_years ?? clamped,
        isMutating: false,
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update audit retention years'), isMutating: false })
      throw e
    }
  },

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

  clearError: () => set({ error: null }),
}))
