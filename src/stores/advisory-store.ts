// Advisory request store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/advisory, GET/PATCH/DELETE /api/advisory/[advisoryId]
//
// Reference numbers (ADV-NNNN) are server-generated on POST.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && advisoryRequests.length === 0` (first fetch). After the first
// fetch a refetch shows stale data with a subtle indicator while
// `isLoading === true`.

import { create } from 'zustand'
import type {
  AdvisoryRequest,
  AdvisoryNote,
  AdvisoryFilters,
  AdvisoryStatus,
  PaginationState,
  SortState,
  BusinessUnit,
  AdvisoryPriority,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { newTempId } from '@/lib/optimistic'

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
}

interface AdvisoryNoteApiRow {
  id: string
  request_id: string
  author: string
  content: string
  created_at: string
}

function mapNote(row: AdvisoryNoteApiRow): AdvisoryNote {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    timestamp: row.created_at,
  }
}

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
    notes: row.notes ? row.notes.map(mapNote) : previous?.notes ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

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

function toUpdatePayload(patch: Partial<AdvisoryRequest>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.subject !== undefined) out.subject = patch.subject
  if (patch.description !== undefined) out.description = patch.description
  if (patch.businessUnit !== undefined) out.business_unit = patch.businessUnit
  if (patch.status !== undefined) out.status = patch.status
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.requestedBy !== undefined) out.requested_by = patch.requestedBy
  if (patch.requestedDate !== undefined) out.requested_date = patch.requestedDate
  if (patch.assignedTo !== undefined) out.assigned_to = patch.assignedTo || undefined
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

  // First-fetch detector: `isLoading && advisoryRequests.length === 0`.
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
    // OPTIMISTIC: insert temp row immediately, swap with server row on success.
    const tempId = newTempId('temp-adv')
    const now = new Date().toISOString()
    const optimistic: AdvisoryRequest = {
      ...(data as Omit<AdvisoryRequest, 'id' | 'ref' | 'createdAt' | 'updatedAt'>),
      id: tempId,
      ref: '',
      notes: [],
      createdAt: now,
      updatedAt: now,
    } as AdvisoryRequest
    set((state) => ({
      advisoryRequests: [optimistic, ...state.advisoryRequests],
      byId: { ...state.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    try {
      const row = await api.post<AdvisoryApiRow>('/advisory', toCreatePayload(data))
      const created = mapRow(row)
      set((state) => {
        const { [tempId]: _drop, ...restById } = state.byId
        return {
          advisoryRequests: state.advisoryRequests.map((a) => (a.id === tempId ? created : a)),
          byId: { ...restById, [created.id]: created },
          isMutating: false,
        }
      })
      void get().fetchAll()
      return created
    } catch (e) {
      set((state) => {
        const { [tempId]: _drop, ...rest } = state.byId
        return {
          advisoryRequests: state.advisoryRequests.filter((a) => a.id !== tempId),
          byId: rest,
          error: errorMessage(e, 'Failed to create advisory request'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  update: async (id, data) => {
    // OPTIMISTIC: snapshot, apply patch, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: AdvisoryRequest = { ...snapshot, ...data, updatedAt: new Date().toISOString() }
      set((state) => ({
        advisoryRequests: state.advisoryRequests.map((a) => (a.id === id ? optimistic : a)),
        byId: { ...state.byId, [id]: optimistic },
        selectedRequest:
          state.selectedRequest?.id === id ? optimistic : state.selectedRequest,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.patch<AdvisoryApiRow>(`/advisory/${id}`, toUpdatePayload(data))
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      set((state) => ({
        advisoryRequests: state.advisoryRequests.map((a) => (a.id === id ? updated : a)),
        byId: { ...state.byId, [id]: updated },
        selectedRequest:
          state.selectedRequest?.id === id ? updated : state.selectedRequest,
        isMutating: false,
      }))
      return updated
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          advisoryRequests: state.advisoryRequests.map((a) => (a.id === id ? snapshot : a)),
          byId: { ...state.byId, [id]: snapshot },
          selectedRequest:
            state.selectedRequest?.id === id ? snapshot : state.selectedRequest,
          error: errorMessage(e, 'Failed to update advisory request'),
          isMutating: false,
        }))
      } else {
        set({ error: errorMessage(e, 'Failed to update advisory request'), isMutating: false })
      }
      throw e
    }
  },

  delete: async (id) => {
    // OPTIMISTIC: remove immediately, restore on failure.
    const snapshot = get().byId[id]
    const prevIndex = get().advisoryRequests.findIndex((a) => a.id === id)
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
    try {
      await api.delete(`/advisory/${id}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        set((state) => {
          const list = [...state.advisoryRequests]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, snapshot)
          return {
            advisoryRequests: list,
            byId: { ...state.byId, [id]: snapshot },
            error: errorMessage(e, 'Failed to delete advisory request'),
            isMutating: false,
          }
        })
      } else {
        set({ error: errorMessage(e, 'Failed to delete advisory request'), isMutating: false })
      }
      throw e
    }
  },

  addNote: async (id, note) => {
    // Fix-3 wave: notes now persist via `POST /api/advisory/[id]` which
    // inserts into `advisory_notes`. The POST handler is co-located on the
    // existing detail route file (the wave's supervisor forbade creating new
    // Route Handler files). When a dedicated `/notes` sub-route is added in
    // a later wave the endpoint here can switch without touching callers.
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
          r.id === id ? { ...r, notes: [...r.notes, created], updatedAt: nowIso } : r,
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
        totalPages: pageSize > 0 ? Math.max(1, Math.ceil(state.pagination.total / pageSize)) : 1,
      },
    })),
  clearError: () => set({ error: null }),
}))
