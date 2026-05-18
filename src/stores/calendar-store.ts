// Calendar store — Phase 5 server-state migration.
//
// Server-state backed for the manual `/api/calendar/events` collection. The
// unified-calendar view (deadlines aggregated from audits / observations /
// policies / sama-letters / circulars / training / correspondence / advisory /
// risks) stays a client-side merge inside `useCalendarEvents`; this store only
// owns the user-created `calendar_events` rows.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && events.length === 0` (first-fetch). Subsequent refetches
//   keep the prior list visible. Detail-page sub-sections may additionally
//   gate on `isDetailLoaded(id)` so list-fetched rows don't flash incomplete
//   data while the full payload streams in.
//
// COMPAT SHIM: legacy `createEvent` / `updateEvent` / `deleteEvent` were
// synchronous and callers consume the returned `CalendarEvent`. We keep that
// sync signature: optimistic local mutation returns the local row immediately,
// and a background `api.*` call reconciles or rolls back. Errors surface via
// `error` on the store.
//
// Hard-delete restore: server soft-deletes via `deleted_at`, but the client
// treats the row as gone. We snapshot the row, list index, selection state
// and detail-loaded flag up front so a failure splices the row back into the
// exact same slot.

import { create } from 'zustand'
import type { CalendarEvent, RegulatoryBodyId, Reminder } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

interface CalendarFiltersState {
  type?: CalendarEvent['type'][]
  dateRange?: { from: string; to: string }
}

// ---------- API row shapes (snake_case from `/api/calendar/events`) ---------

interface CalendarEventApiRow {
  id: string
  title: string
  type: string
  date: string
  start_time: string | null
  end_time: string | null
  attendees: string[] | null
  related_entity_id: string | null
  related_entity_type: string | null
  reminders: unknown[] | null
  description: string | null
  location: string | null
  completed: boolean | null
  completed_at: string | null
  agency: string | null
  severity: string | null
  framework_ids: string[] | null
  created_at: string
  updated_at: string
}

function mapRow(row: CalendarEventApiRow, previous?: CalendarEvent): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    startTime: row.start_time ?? previous?.startTime ?? undefined,
    endTime: row.end_time ?? previous?.endTime ?? undefined,
    attendees: row.attendees ?? previous?.attendees ?? [],
    relatedEntityId: row.related_entity_id ?? previous?.relatedEntityId ?? undefined,
    relatedEntityType: (row.related_entity_type ?? previous?.relatedEntityType ?? undefined) as CalendarEvent['relatedEntityType'],
    reminders: (row.reminders as CalendarEvent['reminders']) ?? previous?.reminders ?? [],
    description: row.description ?? previous?.description ?? undefined,
    location: row.location ?? previous?.location ?? undefined,
    completed: row.completed ?? previous?.completed ?? undefined,
    completedAt: row.completed_at ?? previous?.completedAt ?? undefined,
    agency: (row.agency ?? previous?.agency ?? null) as CalendarEvent['agency'],
    severity: (row.severity ?? previous?.severity ?? undefined) as CalendarEvent['severity'],
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  return {
    title: data.title,
    type: data.type,
    date: data.date,
    start_time: data.startTime,
    end_time: data.endTime,
    attendees: data.attendees ?? [],
    related_entity_id: data.relatedEntityId,
    related_entity_type: data.relatedEntityType,
    reminders: data.reminders ?? [],
    description: data.description,
    location: data.location,
    agency: data.agency ?? undefined,
    severity: data.severity,
    framework_ids: data.frameworkIds ?? [],
  }
}

function toUpdatePayload(patch: Partial<CalendarEvent>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.type !== undefined) out.type = patch.type
  if (patch.date !== undefined) out.date = patch.date
  if (patch.startTime !== undefined) out.start_time = patch.startTime
  if (patch.endTime !== undefined) out.end_time = patch.endTime
  if (patch.attendees !== undefined) out.attendees = patch.attendees
  if (patch.relatedEntityId !== undefined) out.related_entity_id = patch.relatedEntityId
  if (patch.relatedEntityType !== undefined) out.related_entity_type = patch.relatedEntityType
  if (patch.reminders !== undefined) out.reminders = patch.reminders
  if (patch.description !== undefined) out.description = patch.description
  if (patch.location !== undefined) out.location = patch.location
  if (patch.agency !== undefined) out.agency = patch.agency
  if (patch.severity !== undefined) out.severity = patch.severity
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  if (patch.completed !== undefined) out.completed = patch.completed
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface CalendarState {
  events: CalendarEvent[]
  byId: Record<string, CalendarEvent>
  // Tracks which IDs have had their full detail payload loaded. Detail-page
  // sub-sections gate skeleton render on `isDetailLoaded(id)` rather than
  // `isLoading` so list-fetched rows don't flash incomplete data.
  detailLoadedIds: Record<string, true>
  selectedEvent: CalendarEvent | null
  selectedDate: Date
  view: CalendarView
  filters: CalendarFiltersState

  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<CalendarEvent | null>
  isDetailLoaded: (id: string) => boolean
  createEvent: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => CalendarEvent
  updateEvent: (id: string, data: Partial<CalendarEvent>) => CalendarEvent | null
  deleteEvent: (id: string) => void

  // Optimistic hot mutations — each PATCHes the same row but expresses
  // intent at the call site and snapshots/rolls back the relevant slice.
  addAttendee: (id: string, attendee: string) => void
  removeAttendee: (id: string, attendee: string) => void
  setReminders: (id: string, reminders: Reminder[]) => void
  setCompleted: (id: string, completed: boolean) => void

  setSelectedEvent: (event: CalendarEvent | null) => void
  setSelectedDate: (date: Date) => void
  setView: (view: CalendarView) => void
  setFilters: (filters: CalendarFiltersState) => void
  clearFilters: () => void
  clearError: () => void
}

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  events: [],
  byId: {},
  detailLoadedIds: {},
  selectedEvent: null,
  selectedDate: new Date(),
  view: 'month',
  filters: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: CalendarEventApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/calendar/events', { pageSize: 500 })
      const previousById = get().byId
      const events = result.items.map((row) => mapRow(row, previousById[row.id]))
      const byId: Record<string, CalendarEvent> = {}
      for (const e of events) byId[e.id] = e
      set({ events, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch calendar events'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<CalendarEventApiRow>(`/calendar/events/${id}`)
      const previous = get().byId[id]
      const event = mapRow(row, previous)
      set((s) => ({
        byId: { ...s.byId, [id]: event },
        // Prepend when the row isn't already in `events` so the detail page
        // doesn't have to await a full `fetchAll` to surface freshly loaded
        // entities in the list view.
        events: s.events.some((e) => e.id === id)
          ? s.events.map((e) => (e.id === id ? event : e))
          : [event, ...s.events],
        detailLoadedIds: { ...s.detailLoadedIds, [id]: true },
        selectedEvent: s.selectedEvent?.id === id ? event : s.selectedEvent,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return event
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch calendar event'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  isDetailLoaded: (id) => Boolean(get().detailLoadedIds[id]),

  createEvent: (data) => {
    const now = new Date().toISOString()
    const tempId = `local-${crypto.randomUUID()}`
    const optimistic: CalendarEvent = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({
      events: [...s.events, optimistic],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const row = await api.post<CalendarEventApiRow>('/calendar/events', toCreatePayload(data))
        const created = mapRow(row)
        set((s) => {
          const { [tempId]: _drop, ...restById } = s.byId
          return {
            events: s.events.map((e) => (e.id === tempId ? created : e)),
            byId: { ...restById, [created.id]: created },
            isMutating: false,
          }
        })
      } catch (e) {
        set((s) => {
          const { [tempId]: _drop, ...restById } = s.byId
          return {
            events: s.events.filter((e) => e.id !== tempId),
            byId: restById,
            error: errorMessage(e, 'Failed to create calendar event'),
            isMutating: false,
          }
        })
      }
    })()
    return optimistic
  },

  updateEvent: (id, data) => {
    const existing = get().byId[id]
    if (!existing) return null
    const now = new Date().toISOString()
    const optimistic: CalendarEvent = { ...existing, ...data, updatedAt: now }
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? optimistic : e)),
      byId: { ...s.byId, [id]: optimistic },
      selectedEvent: s.selectedEvent?.id === id ? optimistic : s.selectedEvent,
      isMutating: true,
      error: null,
    }))
    // Skip API call for not-yet-persisted local rows; the in-flight create will
    // eventually reconcile.
    if (id.startsWith('local-')) {
      set({ isMutating: false })
      return optimistic
    }
    void (async () => {
      try {
        const row = await api.patch<CalendarEventApiRow>(`/calendar/events/${id}`, toUpdatePayload(data))
        const previous = get().byId[id]
        const updated = mapRow(row, previous)
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? updated : e)),
          byId: { ...s.byId, [id]: updated },
          selectedEvent: s.selectedEvent?.id === id ? updated : s.selectedEvent,
          isMutating: false,
        }))
      } catch (e) {
        // Roll back to the prior server-known state.
        set((s) => ({
          events: s.events.map((ev) => (ev.id === id ? existing : ev)),
          byId: { ...s.byId, [id]: existing },
          selectedEvent: s.selectedEvent?.id === id ? existing : s.selectedEvent,
          error: errorMessage(e, 'Failed to update calendar event'),
          isMutating: false,
        }))
      }
    })()
    return optimistic
  },

  deleteEvent: (id) => {
    // HARD-DELETE snapshot-restore: snapshot the row, its list index, the
    // selection state and the detail-loaded flag so we can splice everything
    // back in on failure.
    const snapshot = get().byId[id]
    if (!snapshot) return
    const prevIndex = get().events.findIndex((e) => e.id === id)
    const wasSelected = get().selectedEvent?.id === id
    const previousSelected = wasSelected ? get().selectedEvent : null
    const wasDetailLoaded = Boolean(get().detailLoadedIds[id])
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      const { [id]: _dropDetail, ...restDetail } = s.detailLoadedIds
      return {
        events: s.events.filter((e) => e.id !== id),
        byId: rest,
        detailLoadedIds: restDetail,
        selectedEvent: wasSelected ? null : s.selectedEvent,
        isMutating: true,
        error: null,
      }
    })
    if (id.startsWith('local-')) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/calendar/events/${id}`)
        set({ isMutating: false })
      } catch (e) {
        set((s) => {
          const list = [...s.events]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, snapshot)
          return {
            events: list,
            byId: { ...s.byId, [id]: snapshot },
            selectedEvent: wasSelected ? previousSelected : s.selectedEvent,
            detailLoadedIds: wasDetailLoaded
              ? { ...s.detailLoadedIds, [id]: true }
              : s.detailLoadedIds,
            error: errorMessage(e, 'Failed to delete calendar event'),
            isMutating: false,
          }
        })
      }
    })()
  },

  // ── Optimistic hot mutations ─────────────────────────────────────────────

  addAttendee: (id, attendee) => {
    const existing = get().byId[id]
    if (!existing) return
    if (existing.attendees.includes(attendee)) return
    const next = [...existing.attendees, attendee]
    get().updateEvent(id, { attendees: next })
  },

  removeAttendee: (id, attendee) => {
    const existing = get().byId[id]
    if (!existing) return
    const next = existing.attendees.filter((a) => a !== attendee)
    if (next.length === existing.attendees.length) return
    get().updateEvent(id, { attendees: next })
  },

  setReminders: (id, reminders) => {
    const existing = get().byId[id]
    if (!existing) return
    get().updateEvent(id, { reminders })
  },

  setCompleted: (id, completed) => {
    const existing = get().byId[id]
    if (!existing) return
    const now = new Date().toISOString()
    get().updateEvent(id, {
      completed,
      completedAt: completed ? now : undefined,
    })
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setView: (view) => set({ view }),
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  clearError: () => set({ error: null }),
}))
