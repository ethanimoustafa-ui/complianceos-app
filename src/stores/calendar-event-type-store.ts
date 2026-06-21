// Calendar Event Types — Phase 5 server-state migration.
//
// Server-state backed: every read/write goes through `/api/calendar/event-types`.
// Local state mirrors the server list so the UI stays snappy between fetches.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && types.length === 0` (first-fetch). Subsequent refetches keep
//   the prior list visible while `isLoading` flips true.
//
// COMPAT SHIM: the legacy `add/update/remove` actions returned synchronously.
// To keep `EditableSelect` (which types `onAdd` as `(label) => string | void`)
// happy, the public methods still return the optimistic local result
// synchronously and fire-and-forget the API call in the background. Errors
// surface via `error` on the store.

import { create } from 'zustand'
import { api, ApiClientError } from '@/lib/api-client'

// Calendar event type — `id` is the slug/`key` value used by the rest of the
// app for selecting event types in dropdowns. `uuid` carries the server PK
// for PATCH/DELETE.
export interface CalendarEventType {
  id: string
  uuid?: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface CalendarEventTypeApiRow {
  id: string
  key: string
  name_en: string
  name_ar: string
  is_default: boolean
  created_at: string
  updated_at: string
}

function mapRow(row: CalendarEventTypeApiRow): CalendarEventType {
  return {
    id: row.key,
    uuid: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    isDefault: row.is_default,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

interface CalendarEventTypeState {
  types: CalendarEventType[]
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (force?: boolean) => Promise<void>
  // Sync-shaped to satisfy `EditableSelect`'s `onAdd: (label) => string | void`.
  // Local state is updated optimistically; API insert runs in the background.
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<CalendarEventType, 'id' | 'uuid'>>) => void
  remove: (id: string) => void
  clearError: () => void
}

export const useCalendarEventTypeStore = create<CalendarEventTypeState>()((set, get) => ({
  types: [],
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (force = false) => {
    const state = get()
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) return
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<CalendarEventTypeApiRow[]>('/calendar/event-types')
      set({
        types: rows.map(mapRow),
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch calendar event types'), isLoading: false })
    }
  },

  add: (label, labelAr) => {
    const baseKey = slugify(label) || `event-type-${Date.now()}`
    const existingKeys = new Set(get().types.map((t) => t.id))
    let key = baseKey
    let n = 2
    while (existingKeys.has(key)) key = `${baseKey}-${n++}`
    // Optimistic local insert.
    const optimistic: CalendarEventType = {
      id: key,
      label,
      labelAr: labelAr ?? label,
      isDefault: false,
    }
    set((s) => ({ types: [...s.types, optimistic], isMutating: true, error: null }))
    // Background API call — patches the local row with the server-issued uuid
    // when it succeeds; surfaces error message and rolls back on failure.
    void (async () => {
      try {
        const row = await api.post<CalendarEventTypeApiRow>('/calendar/event-types', {
          key,
          name_en: label,
          name_ar: labelAr ?? label,
          is_default: false,
        })
        const created = mapRow(row)
        set((s) => ({
          types: s.types.map((t) => (t.id === key ? created : t)),
          isMutating: false,
        }))
      } catch (e) {
        set((s) => ({
          types: s.types.filter((t) => t.id !== key),
          error: errorMessage(e, 'Failed to add calendar event type'),
          isMutating: false,
        }))
      }
    })()
    return key
  },

  update: (id, patch) => {
    const target = get().types.find((t) => t.id === id)
    if (!target) return
    // Optimistic patch.
    set((s) => ({
      types: s.types.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      isMutating: true,
      error: null,
    }))
    if (!target.uuid) {
      // Not yet round-tripped to the API (e.g. add still in-flight) — local-only.
      set({ isMutating: false })
      return
    }
    const body: Record<string, unknown> = {}
    if (patch.label !== undefined) body.name_en = patch.label
    if (patch.labelAr !== undefined) body.name_ar = patch.labelAr
    void (async () => {
      try {
        const row = await api.patch<CalendarEventTypeApiRow>(`/calendar/event-types/${target.uuid}`, body)
        const updated = mapRow(row)
        set((s) => ({
          types: s.types.map((t) => (t.id === id ? updated : t)),
          isMutating: false,
        }))
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update calendar event type'), isMutating: false })
      }
    })()
  },

  remove: (id) => {
    const target = get().types.find((t) => t.id === id)
    if (!target) return
    // Optimistic delete.
    const previous = get().types
    set((s) => ({ types: s.types.filter((t) => t.id !== id), isMutating: true, error: null }))
    if (!target.uuid) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/calendar/event-types/${target.uuid}`)
        set({ isMutating: false })
      } catch (e) {
        // Roll back.
        set({ types: previous, error: errorMessage(e, 'Failed to delete calendar event type'), isMutating: false })
      }
    })()
  },

  clearError: () => set({ error: null }),
}))
