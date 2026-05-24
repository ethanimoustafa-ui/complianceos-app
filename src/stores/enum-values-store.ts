// Wave-19.7 — Enum Values store.
//
// Generic Zustand store backing the `enum_value_definitions` table. The first
// domain wired is `policy.approval_tier` — the Policy Create/Edit dropdown
// reads its options from here. Additional domains (priority, severity,
// step_state, …) follow the same pattern.
//
// Lifecycle uses the canonical `optimisticMutation` helper so the UI stays
// snappy while a write is in-flight.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'
import { newTempId, optimisticMutation } from '@/lib/optimistic'
import type { ToastMessage } from '@/stores/toast-store'

// ── API row shape ────────────────────────────────────────────────────────────

interface EnumValueApiRow {
  id: string
  domain: string
  key: string
  name_en: string
  name_ar: string
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
}

// ── Client shape (camelCase) ─────────────────────────────────────────────────

export interface EnumValue {
  id: string
  domain: string
  key: string
  nameEn: string
  nameAr: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

function mapRow(row: EnumValueApiRow): EnumValue {
  return {
    id: row.id,
    domain: row.domain,
    key: row.key,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ifMatchHeader(updatedAt: string | undefined): Record<string, string> | undefined {
  if (!updatedAt) return undefined
  return { 'If-Match': `W/"${updatedAt}"` }
}

function revertMessage(e: unknown): ToastMessage {
  if (e instanceof ApiClientError) {
    if (e.status === 412 || e.code === 'precondition_failed') {
      return { key: 'regulatoryUpdates.optimisticConflict' }
    }
    if (e.code === 'conflict' && (e.message === 'cannot_delete_default' || e.message === 'in_use')) {
      return { key: `settings.enumValues.${e.message === 'in_use' ? 'inUse' : 'cannotDeleteDefault'}` }
    }
    if (
      (e.code === 'validation_failed' || e.code === 'conflict') &&
      (e.message === 'key_already_exists' || e.message === 'cannot_edit_default')
    ) {
      return {
        key:
          e.message === 'key_already_exists'
            ? 'settings.enumValues.keyAlreadyExists'
            : 'settings.enumValues.cannotEditDefault',
      }
    }
  }
  return { key: 'regulatoryUpdates.optimisticRevert' }
}

// ── Store state ──────────────────────────────────────────────────────────────

interface EnumValuesState {
  /** Per-domain hydrated lists. Keyed by domain string. */
  byDomain: Record<string, EnumValue[]>
  /** Per-domain in-flight fetch flag — prevents duplicate fetches on mount. */
  loading: Record<string, boolean>
  /** Per-domain last-fetched timestamp — used by `fetch(domain, force?)`. */
  lastFetched: Record<string, number>

  fetch: (domain: string, force?: boolean) => Promise<EnumValue[]>
  add: (
    domain: string,
    key: string,
    nameEn: string,
    nameAr: string,
    sortOrder?: number,
  ) => Promise<EnumValue>
  update: (
    id: string,
    patch: { nameEn?: string; nameAr?: string; sortOrder?: number },
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  /**
   * Returns dropdown-ready `{ value, label }` options for a domain, picking
   * the English or Arabic label per locale. The persisted value is the `key`
   * — never the row id.
   */
  getOptions: (
    domain: string,
    locale: 'en' | 'ar',
  ) => { value: string; label: string }[]
  /** Look up a single value's localised label, falling back to the raw key. */
  formatValue: (domain: string, key: string, locale: 'en' | 'ar') => string
}

export const useEnumValuesStore = create<EnumValuesState>()((set, get) => ({
  byDomain: {},
  loading: {},
  lastFetched: {},

  fetch: async (domain, force = false) => {
    const last = get().lastFetched[domain]
    // Skip if fetched in the last 60s, unless force=true.
    if (!force && last && Date.now() - last < 60_000) {
      return get().byDomain[domain] ?? []
    }
    if (get().loading[domain]) return get().byDomain[domain] ?? []
    set((s) => ({ loading: { ...s.loading, [domain]: true } }))
    try {
      const rows = await api.get<EnumValueApiRow[]>('/settings/enum-values', { domain })
      const mapped = rows.map(mapRow)
      set((s) => ({
        byDomain: { ...s.byDomain, [domain]: mapped },
        loading: { ...s.loading, [domain]: false },
        lastFetched: { ...s.lastFetched, [domain]: Date.now() },
      }))
      return mapped
    } catch (e) {
      set((s) => ({ loading: { ...s.loading, [domain]: false } }))
      console.error('[enum-values:fetch] failed —', e)
      throw e
    }
  },

  add: async (domain, key, nameEn, nameAr, sortOrder) => {
    const tempId = newTempId()
    const now = new Date().toISOString()
    const existing = get().byDomain[domain] ?? []
    const optimistic: EnumValue = {
      id: tempId,
      domain,
      key,
      nameEn,
      nameAr,
      sortOrder: sortOrder ?? (existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 1),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }
    let created: EnumValue | null = null
    await optimisticMutation<EnumValueApiRow>({
      context: 'enum-values.add',
      errorMessage: revertMessage,
      apply: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: [...(s.byDomain[domain] ?? []), optimistic].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            ),
          },
        }))
      },
      request: () =>
        api.post<EnumValueApiRow>('/settings/enum-values', {
          domain,
          key,
          name_en: nameEn,
          name_ar: nameAr,
          sort_order: sortOrder,
        }),
      reconcile: (row) => {
        const real = mapRow(row)
        created = real
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? [])
              .map((v) => (v.id === tempId ? real : v))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          },
        }))
      },
      revert: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? []).filter((v) => v.id !== tempId),
          },
        }))
      },
    })
    if (!created) throw new Error('Failed to create enum value')
    return created
  },

  update: async (id, patch) => {
    // Find the row + its domain for revert / snapshot.
    let prevDomain: string | null = null
    let prev: EnumValue | null = null
    for (const [domain, list] of Object.entries(get().byDomain)) {
      const found = list.find((v) => v.id === id)
      if (found) {
        prevDomain = domain
        prev = found
        break
      }
    }
    if (!prevDomain || !prev) return
    const domain = prevDomain
    const snapshot = prev
    const next: EnumValue = {
      ...snapshot,
      nameEn: patch.nameEn ?? snapshot.nameEn,
      nameAr: patch.nameAr ?? snapshot.nameAr,
      sortOrder: patch.sortOrder ?? snapshot.sortOrder,
      updatedAt: new Date().toISOString(),
    }
    await optimisticMutation<EnumValueApiRow>({
      context: 'enum-values.update',
      errorMessage: revertMessage,
      apply: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? [])
              .map((v) => (v.id === id ? next : v))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          },
        }))
      },
      request: () => {
        const body: Record<string, unknown> = {}
        if (patch.nameEn !== undefined) body.name_en = patch.nameEn
        if (patch.nameAr !== undefined) body.name_ar = patch.nameAr
        if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder
        return api.patch<EnumValueApiRow>(
          `/settings/enum-values/${id}`,
          body,
          ifMatchHeader(snapshot.updatedAt),
        )
      },
      reconcile: (row) => {
        const real = mapRow(row)
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? [])
              .map((v) => (v.id === id ? real : v))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          },
        }))
      },
      revert: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? []).map((v) =>
              v.id === id ? snapshot : v,
            ),
          },
        }))
      },
    })
  },

  remove: async (id) => {
    let prevDomain: string | null = null
    let prev: EnumValue | null = null
    for (const [domain, list] of Object.entries(get().byDomain)) {
      const found = list.find((v) => v.id === id)
      if (found) {
        prevDomain = domain
        prev = found
        break
      }
    }
    if (!prevDomain || !prev) return
    const domain = prevDomain
    const snapshot = prev
    await optimisticMutation<{ id: string; deleted: true }>({
      context: 'enum-values.remove',
      errorMessage: revertMessage,
      apply: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: (s.byDomain[domain] ?? []).filter((v) => v.id !== id),
          },
        }))
      },
      request: () =>
        api.delete(
          `/settings/enum-values/${id}`,
          ifMatchHeader(snapshot.updatedAt),
        ),
      revert: () => {
        set((s) => ({
          byDomain: {
            ...s.byDomain,
            [domain]: [...(s.byDomain[domain] ?? []), snapshot].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            ),
          },
        }))
      },
    })
  },

  getOptions: (domain, locale) => {
    const list = get().byDomain[domain] ?? []
    return list
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        value: v.key,
        label: locale === 'ar' ? v.nameAr : v.nameEn,
      }))
  },

  formatValue: (domain, key, locale) => {
    const list = get().byDomain[domain] ?? []
    const row = list.find((v) => v.key === key)
    if (!row) return key
    return locale === 'ar' ? row.nameAr : row.nameEn
  },
}))
