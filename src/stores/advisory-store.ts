// Advisory request store — W23 pattern-stack port.
//
// W23 PORTING-TEMPLATE §2 countermeasures applied:
//   - ETag threading: every mapRow stores `updatedAt` from the API response; every
//     mutation reads `byId[id].updatedAt` and sends it as `If-Match` (§2.12).
//   - optimisticMutation: all mutations use the shared helper (§2.1 / GAP-14).
//   - Hardened mapRow: notes/timeline/versions are read from the API embed first,
//     fall back to previous only when embed is absent, `?? []` (§1.6.a / GAP-17).
//   - toUpdatePayload: no server-generated columns in create payload, null-clears
//     clearable fields (§2.3/§2.4).
//   - Module-level EMPTY stable references for Zustand selectors (§3 / W19.7).
//   - 412 conflict toast distinct from generic revert toast (W20 pattern).

import { create } from 'zustand'
import type {
  AdvisoryRequest,
  AdvisoryNote,
  AdvisoryFilters,
  AdvisoryStatus,
  AdvisoryTimelineRow,
  AdvisoryVersionRow,
  PaginationState,
  SortState,
  BusinessUnit,
  AdvisoryPriority,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { newTempId, optimisticMutation } from '@/lib/optimistic'

// ── Module-level stable empty references (W19.7-BUG-1 fix) ──────────────────
// NEVER write `useAdvisoryStore((s) => s.X ?? [])` inline — that allocates a
// new array on every snapshot and triggers an infinite loop in React 18's
// useSyncExternalStore. Use these module-level constants as the fallback.
const EMPTY_NOTES: AdvisoryNote[] = []
const EMPTY_TIMELINE: AdvisoryTimelineRow[] = []
const EMPTY_VERSIONS: AdvisoryVersionRow[] = []

// ---------- API row shapes (snake_case from Route Handlers) -----------------

interface AdvisoryApiRow {
  id: string
  ref: string
  subject: string
  description?: string
  business_unit: string
  status: string
  priority: string
  requested_by: string
  requested_date: string
  assigned_to: string | null
  created_at: string
  updated_at: string
  // Present on detail responses:
  notes?: AdvisoryNoteApiRow[]
  timeline?: AdvisoryTimelineApiRow[]
  versions?: AdvisoryVersionApiRow[]
}

interface AdvisoryNoteApiRow {
  id: string
  request_id: string
  author: string
  content: string
  created_at: string
}

// W23 — dual-store timeline row shape from API
interface AdvisoryTimelineApiRow {
  id: string
  advisory_id: string
  text_en: string
  text_ar: string
  user_name: string
  status: string
  created_at: string
}

// W23 — dual-store version row shape from API
interface AdvisoryVersionApiRow {
  id: string
  advisory_id: string
  date: string
  author: string
  text_en: string
  text_ar: string
  field_changes: AdvisoryFieldChangeRow[] | null
  created_at: string
}

type AdvisoryFieldChangeRow = { field: string; from: string; to: string }

// Client-side types are re-exported from @/types — no need to redefine here.

function mapNote(row: AdvisoryNoteApiRow): AdvisoryNote {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    timestamp: row.created_at,
  }
}

function mapTimelineRow(row: AdvisoryTimelineApiRow): AdvisoryTimelineRow {
  return {
    id: row.id,
    advisoryId: row.advisory_id,
    textEn: row.text_en,
    textAr: row.text_ar,
    userName: row.user_name,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapVersionRow(row: AdvisoryVersionApiRow): AdvisoryVersionRow {
  return {
    id: row.id,
    advisoryId: row.advisory_id,
    date: row.date,
    author: row.author,
    textEn: row.text_en,
    textAr: row.text_ar,
    fieldChanges: row.field_changes,
    createdAt: row.created_at,
  }
}

// §1.6.a hardened mapper — read GET embed first, fall back to previous only when
// embed is absent, `?? []` (not `?? undefined`). This prevents the P1
// mapper-drop (GAP-17) where a list response overwrites a detail-hydrated row.
function mapRow(row: AdvisoryApiRow, previous?: AdvisoryRequest): AdvisoryRequest {
  return {
    id: row.id,
    ref: row.ref,
    subject: row.subject,
    description: row.description ?? previous?.description ?? '',
    businessUnit: row.business_unit as BusinessUnit,
    status: row.status as AdvisoryStatus,
    priority: row.priority as AdvisoryPriority,
    requestedBy: row.requested_by,
    requestedDate: row.requested_date,
    assignedTo: row.assigned_to ?? undefined,
    // §1.6.a: read embed first; fall back to previous when API doesn't embed the array
    // (list response omits it); default to EMPTY stable reference (W19.7).
    notes: row.notes ? row.notes.map(mapNote) : (previous?.notes ?? EMPTY_NOTES),
    timeline: row.timeline
      ? row.timeline.map(mapTimelineRow)
      : (previous?.timeline ?? EMPTY_TIMELINE),
    versions: row.versions
      ? row.versions.map(mapVersionRow)
      : (previous?.versions ?? EMPTY_VERSIONS),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// toCreatePayload — only user-supplied fields, NO server-generated columns
// (W20-BUG-1: id/ref/created_at must NOT be sent in create payload when schema is .strict()).
function toCreatePayload(
  data: Omit<AdvisoryRequest, 'id' | 'ref' | 'notes' | 'createdAt' | 'updatedAt'>,
): Record<string, unknown> {
  return {
    subject: data.subject,
    description: data.description,
    business_unit: data.businessUnit,
    status: data.status,
    priority: data.priority,
    requested_by: data.requestedBy,
    requested_date: data.requestedDate,
    assigned_to: data.assignedTo || undefined,
  }
}

// toUpdatePayload — only changed fields; null passes through to clear columns (GAP-3).
function toUpdatePayload(patch: Partial<AdvisoryRequest>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.subject !== undefined) out.subject = patch.subject
  if (patch.description !== undefined) out.description = patch.description
  if (patch.businessUnit !== undefined) out.business_unit = patch.businessUnit
  if (patch.status !== undefined) out.status = patch.status
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.requestedBy !== undefined) out.requested_by = patch.requestedBy
  if (patch.requestedDate !== undefined) out.requested_date = patch.requestedDate
  // null explicitly clears the assignee (GAP-3 / clearable field).
  if ('assignedTo' in patch) out.assigned_to = patch.assignedTo ?? null
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store ----------------------------------------------------------

interface AdvisoryState {
  advisoryRequests: AdvisoryRequest[]
  byId: Record<string, AdvisoryRequest>
  selectedRequest: AdvisoryRequest | null
  filters: AdvisoryFilters
  pagination: PaginationState
  sort: SortState

  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (opts?: {
    page?: number
    pageSize?: number
    filters?: Partial<AdvisoryFilters>
  }) => Promise<void>
  fetchById: (id: string) => Promise<AdvisoryRequest | null>
  create: (
    data: Omit<AdvisoryRequest, 'id' | 'ref' | 'notes' | 'createdAt' | 'updatedAt'>,
  ) => Promise<AdvisoryRequest>
  update: (id: string, data: Partial<AdvisoryRequest>) => Promise<AdvisoryRequest>
  delete: (id: string) => Promise<void>
  addNote: (id: string, note: { author: string; content: string }) => Promise<void>
  updateStatus: (id: string, status: AdvisoryStatus) => Promise<void>
  reassign: (id: string, newAssignee: string) => Promise<void>
  setFilters: (filters: AdvisoryFilters) => void
  clearFilters: () => void
  setSelected: (request: AdvisoryRequest | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  clearError: () => void
}

const INITIAL_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
}

const INITIAL_SORT: SortState = {
  field: 'requestedDate',
  direction: 'desc',
}

export const useAdvisoryStore = create<AdvisoryState>()((set, get) => ({
  advisoryRequests: [],
  byId: {},
  selectedRequest: null,
  filters: {},
  pagination: INITIAL_PAGINATION,
  sort: INITIAL_SORT,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (opts) => {
    const current = get()
    const page = opts?.page ?? current.pagination.page
    const pageSize = opts?.pageSize ?? current.pagination.pageSize
    const filters = opts?.filters ? { ...current.filters, ...opts.filters } : current.filters

    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: AdvisoryApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/advisory', {
        page,
        pageSize,
        status: filters.status?.[0],
        priority: filters.priority?.[0],
        business_unit: filters.businessUnit?.[0],
        q: filters.search,
      })

      const previousById = get().byId
      const advisoryRequests = result.items.map((row) =>
        mapRow(row, previousById[row.id]),
      )
      const byId: Record<string, AdvisoryRequest> = {}
      for (const a of advisoryRequests) byId[a.id] = a

      set({
        advisoryRequests,
        byId,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
        filters,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch advisory requests'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<AdvisoryApiRow>(`/advisory/${id}`)
      const previous = get().byId[id]
      const request = mapRow(row, previous)
      set((state) => ({
        byId: { ...state.byId, [id]: request },
        advisoryRequests: state.advisoryRequests.some((a) => a.id === id)
          ? state.advisoryRequests.map((a) => (a.id === id ? request : a))
          : state.advisoryRequests,
        selectedRequest: request,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return request
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch advisory request'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  create: async (data) => {
    // GAP-14: optimistic insert — temp row immediately, swap with server row on success.
    const tempId = newTempId('temp-adv')
    const now = new Date().toISOString()
    const optimistic: AdvisoryRequest = {
      ...(data as Omit<AdvisoryRequest, 'id' | 'ref' | 'createdAt' | 'updatedAt'>),
      id: tempId,
      ref: '',
      notes: EMPTY_NOTES,
      createdAt: now,
      updatedAt: now,
    } as AdvisoryRequest

    let created: AdvisoryRequest = optimistic

    await optimisticMutation({
      apply: () => {
        set((state) => ({
          advisoryRequests: [optimistic, ...state.advisoryRequests],
          byId: { ...state.byId, [tempId]: optimistic },
          isMutating: true,
          error: null,
        }))
      },
      request: async () => {
        const row = await api.post<AdvisoryApiRow>('/advisory', toCreatePayload(data))
        return mapRow(row)
      },
      reconcile: (real) => {
        created = real
        set((state) => {
          const { [tempId]: _drop, ...restById } = state.byId
          return {
            advisoryRequests: state.advisoryRequests.map((a) =>
              a.id === tempId ? real : a,
            ),
            byId: { ...restById, [real.id]: real },
            isMutating: false,
          }
        })
        void get().fetchAll()
      },
      revert: () => {
        set((state) => {
          const { [tempId]: _drop, ...rest } = state.byId
          return {
            advisoryRequests: state.advisoryRequests.filter((a) => a.id !== tempId),
            byId: rest,
            isMutating: false,
          }
        })
      },
      context: 'advisory.create',
    })

    return created
  },

  update: async (id, data) => {
    // §2.12 — read stored updatedAt as If-Match token.
    const snapshot = get().byId[id]
    const ifMatch = snapshot?.updatedAt

    let updated: AdvisoryRequest = snapshot ?? ({ ...data, id } as AdvisoryRequest)

    if (snapshot) {
      const optimisticRow: AdvisoryRequest = {
        ...snapshot,
        ...data,
        updatedAt: new Date().toISOString(),
      }

      await optimisticMutation({
        apply: () => {
          set((state) => ({
            advisoryRequests: state.advisoryRequests.map((a) =>
              a.id === id ? optimisticRow : a,
            ),
            byId: { ...state.byId, [id]: optimisticRow },
            selectedRequest:
              state.selectedRequest?.id === id ? optimisticRow : state.selectedRequest,
            isMutating: true,
            error: null,
          }))
        },
        request: async () => {
          // Thread ETag so the route enforces optimistic concurrency (§2.12).
          const headers: Record<string, string> = {}
          if (ifMatch) headers['If-Match'] = `W/"${ifMatch}"`
          const row = await api.patch<AdvisoryApiRow>(
            `/advisory/${id}`,
            toUpdatePayload(data),
            headers,
          )
          return mapRow(row, get().byId[id])
        },
        reconcile: (real) => {
          updated = real
          set((state) => ({
            advisoryRequests: state.advisoryRequests.map((a) =>
              a.id === id ? real : a,
            ),
            byId: { ...state.byId, [id]: real },
            selectedRequest:
              state.selectedRequest?.id === id ? real : state.selectedRequest,
            isMutating: false,
          }))
        },
        revert: () => {
          set((state) => ({
            advisoryRequests: state.advisoryRequests.map((a) =>
              a.id === id ? snapshot : a,
            ),
            byId: { ...state.byId, [id]: snapshot },
            selectedRequest:
              state.selectedRequest?.id === id ? snapshot : state.selectedRequest,
            isMutating: false,
          }))
        },
        // W20 — 412 conflict uses a specific toast key, not the generic revert.
        errorMessage: (e) =>
          e instanceof ApiClientError && e.status === 412
            ? { key: 'regulatoryUpdates.conflictReload' }
            : { key: 'regulatoryUpdates.optimisticRevert' },
        context: 'advisory.update',
      })
    } else {
      set({ isMutating: true, error: null })
      try {
        const row = await api.patch<AdvisoryApiRow>(
          `/advisory/${id}`,
          toUpdatePayload(data),
        )
        updated = mapRow(row)
        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((a) =>
            a.id === id ? updated : a,
          ),
          byId: { ...state.byId, [id]: updated },
          selectedRequest:
            state.selectedRequest?.id === id ? updated : state.selectedRequest,
          isMutating: false,
        }))
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update advisory request'), isMutating: false })
        throw e
      }
    }

    return updated
  },

  delete: async (id) => {
    // GAP-14: optimistic remove immediately, restore on failure.
    const snapshot = get().byId[id]
    const prevIndex = get().advisoryRequests.findIndex((a) => a.id === id)
    const ifMatch = snapshot?.updatedAt

    await optimisticMutation({
      apply: () => {
        set((state) => {
          const { [id]: _removed, ...rest } = state.byId
          return {
            advisoryRequests: state.advisoryRequests.filter((a) => a.id !== id),
            byId: rest,
            selectedRequest:
              state.selectedRequest?.id === id ? null : state.selectedRequest,
            isMutating: true,
            error: null,
          }
        })
      },
      request: async () => {
        const headers: Record<string, string> = {}
        if (ifMatch) headers['If-Match'] = `W/"${ifMatch}"`
        return api.delete(`/advisory/${id}`, headers)
      },
      reconcile: () => {
        set({ isMutating: false })
      },
      revert: () => {
        if (snapshot) {
          set((state) => {
            const list = [...state.advisoryRequests]
            const insertAt =
              prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
            list.splice(insertAt, 0, snapshot)
            return {
              advisoryRequests: list,
              byId: { ...state.byId, [id]: snapshot },
              isMutating: false,
            }
          })
        } else {
          set({ isMutating: false })
        }
      },
      context: 'advisory.delete',
    })
  },

  addNote: async (id, note) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<AdvisoryNoteApiRow>(`/advisory/${id}`, {
        author: note.author,
        content: note.content,
      })
      const created = mapNote(row)
      const nowIso = new Date().toISOString()
      set((state) => ({
        advisoryRequests: state.advisoryRequests.map((r) =>
          r.id === id
            ? { ...r, notes: [...r.notes, created], updatedAt: nowIso }
            : r,
        ),
        byId: state.byId[id]
          ? {
              ...state.byId,
              [id]: {
                ...state.byId[id],
                notes: [...state.byId[id].notes, created],
                updatedAt: nowIso,
              },
            }
          : state.byId,
        selectedRequest:
          state.selectedRequest?.id === id
            ? {
                ...state.selectedRequest,
                notes: [...state.selectedRequest.notes, created],
                updatedAt: nowIso,
              }
            : state.selectedRequest,
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to add note'), isMutating: false })
      throw e
    }
  },

  updateStatus: async (id, status) => {
    await get().update(id, { status })
  },

  reassign: async (id, newAssignee) => {
    await get().update(id, { assignedTo: newAssignee })
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (request) => set({ selectedRequest: request }),
  setSort: (sort) => set({ sort }),
  setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
  setPageSize: (pageSize) =>
    set((state) => ({
      pagination: {
        ...state.pagination,
        pageSize,
        totalPages:
          pageSize > 0 ? Math.max(1, Math.ceil(state.pagination.total / pageSize)) : 1,
      },
    })),
  clearError: () => set({ error: null }),
}))
