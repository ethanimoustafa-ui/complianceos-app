// Correspondence registry store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/correspondence,
//            GET/PATCH/DELETE /api/correspondence/[correspondenceId]
//
// Reference numbers are server-generated on POST.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && correspondence.length === 0` (first fetch).

import { create } from 'zustand'
import type { Correspondence, PaginationState, SortState } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

interface CorrespondenceFilters {
  type?: Correspondence['type'][]
  status?: Correspondence['status'][]
  dateRange?: { from: string; to: string }
  search?: string
}

// ---------- API row shape ---------------------------------------------------

interface CorrespondenceApiRow {
  id: string
  reference: string
  subject: string
  from_party: string
  to_parties: string[]
  date: string
  type: string
  status: 'draft' | 'sent' | 'received'
  body?: string
  thread_id: string | null
  archived: boolean
  assignee_id: string | null
  framework_ids?: string[]
  created_at: string
  updated_at: string
}

function mapRow(row: CorrespondenceApiRow, previous?: Correspondence): Correspondence {
  return {
    id: row.id,
    subject: row.subject,
    from: row.from_party,
    to: row.to_parties ?? [],
    date: row.date,
    type: row.type,
    status: row.status,
    body: row.body ?? previous?.body ?? '',
    attachments: previous?.attachments ?? [],
    threadId: row.thread_id ?? undefined,
    archived: row.archived,
    reference: row.reference,
    assignee: row.assignee_id ?? previous?.assignee ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(
  data: Omit<Correspondence, 'id' | 'createdAt' | 'updatedAt'>,
): Record<string, unknown> {
  return {
    subject: data.subject,
    from_party: data.from,
    to_parties: data.to,
    date: data.date,
    type: data.type,
    status: data.status,
    body: data.body || undefined,
    thread_id: data.threadId || undefined,
    archived: data.archived ?? false,
    assignee_id: data.assignee || undefined,
    framework_ids: [],
  }
}

function toUpdatePayload(patch: Partial<Correspondence>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.subject !== undefined) out.subject = patch.subject
  if (patch.from !== undefined) out.from_party = patch.from
  if (patch.to !== undefined) out.to_parties = patch.to
  if (patch.date !== undefined) out.date = patch.date
  if (patch.type !== undefined) out.type = patch.type
  if (patch.status !== undefined) out.status = patch.status
  if (patch.body !== undefined) out.body = patch.body
  if (patch.threadId !== undefined) out.thread_id = patch.threadId || undefined
  if (patch.archived !== undefined) out.archived = patch.archived
  if (patch.assignee !== undefined) out.assignee_id = patch.assignee || undefined
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store ----------------------------------------------------------

interface CorrespondenceState {
  correspondence: Correspondence[]
  byId: Record<string, Correspondence>
  selectedCorrespondence: Correspondence | null
  filters: CorrespondenceFilters
  pagination: PaginationState
  sort: SortState

  // First-fetch detector: `isLoading && correspondence.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (opts?: {
    page?: number
    pageSize?: number
    filters?: Partial<CorrespondenceFilters>
  }) => Promise<void>
  fetchById: (id: string) => Promise<Correspondence | null>
  create: (
    data: Omit<Correspondence, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Correspondence>
  update: (id: string, data: Partial<Correspondence>) => Promise<Correspondence>
  delete: (id: string) => Promise<void>
  setFilters: (filters: CorrespondenceFilters) => void
  clearFilters: () => void
  setSelected: (correspondence: Correspondence | null) => void
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
  field: 'date',
  direction: 'desc',
}

export const useCorrespondenceStore = create<CorrespondenceState>()((set, get) => ({
  correspondence: [],
  byId: {},
  selectedCorrespondence: null,
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
    const filters = opts?.filters
      ? { ...current.filters, ...opts.filters }
      : current.filters

    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: CorrespondenceApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/correspondence', {
        page,
        pageSize,
        type: filters.type?.[0],
        status: filters.status?.[0],
        q: filters.search,
      })
      const previousById = get().byId
      const correspondence = result.items.map((row) => mapRow(row, previousById[row.id]))
      const byId: Record<string, Correspondence> = {}
      for (const c of correspondence) byId[c.id] = c
      set({
        correspondence,
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
      set({
        error: errorMessage(e, 'Failed to fetch correspondence'),
        isLoading: false,
      })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<CorrespondenceApiRow>(`/correspondence/${id}`)
      const previous = get().byId[id]
      const item = mapRow(row, previous)
      set((state) => ({
        byId: { ...state.byId, [id]: item },
        correspondence: state.correspondence.some((c) => c.id === id)
          ? state.correspondence.map((c) => (c.id === id ? item : c))
          : state.correspondence,
        selectedCorrespondence: item,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return item
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to fetch correspondence'),
        isLoading: false,
      })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  create: async (data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<CorrespondenceApiRow>(
        '/correspondence',
        toCreatePayload(data),
      )
      const created = mapRow(row)
      set((state) => ({
        correspondence: [created, ...state.correspondence],
        byId: { ...state.byId, [created.id]: created },
        isMutating: false,
      }))
      void get().fetchAll()
      return created
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to create correspondence'),
        isMutating: false,
      })
      throw e
    }
  },

  update: async (id, data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<CorrespondenceApiRow>(
        `/correspondence/${id}`,
        toUpdatePayload(data),
      )
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      set((state) => ({
        correspondence: state.correspondence.map((c) => (c.id === id ? updated : c)),
        byId: { ...state.byId, [id]: updated },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? updated
            : state.selectedCorrespondence,
        isMutating: false,
      }))
      return updated
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to update correspondence'),
        isMutating: false,
      })
      throw e
    }
  },

  delete: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/correspondence/${id}`)
      set((state) => {
        const { [id]: _removed, ...rest } = state.byId
        return {
          correspondence: state.correspondence.filter((c) => c.id !== id),
          byId: rest,
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? null
              : state.selectedCorrespondence,
          isMutating: false,
        }
      })
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to delete correspondence'),
        isMutating: false,
      })
      throw e
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (correspondence) => set({ selectedCorrespondence: correspondence }),
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
