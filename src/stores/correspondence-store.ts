// Correspondence registry store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/correspondence,
//            GET/PATCH/DELETE /api/correspondence/[correspondenceId]
//            POST /api/correspondence/[correspondenceId]/archive
//            POST /api/correspondence/[correspondenceId]/unarchive
//            GET/POST /api/correspondence/[correspondenceId]/attachments
//            DELETE  /api/correspondence/[correspondenceId]/attachments/[attachmentId]
//
// Reference numbers are server-generated on POST.
//
// CIRCULAR PARITY (matches src/stores/circular-store.ts patterns):
//   - `detailLoadedIds` + `isDetailLoaded(id)` — selectors can decide whether
//     to render a skeleton or display cached detail while a refetch lands.
//   - Hard-delete keeps an optimistic snapshot so failures restore the row at
//     its original index.
//   - `fetchById` prepends to `correspondence[]` when the row isn't already in
//     the list (deep-linked detail page on a fresh tab).
//   - Hot mutations (`update`, `archive`, `unarchive`, attachment add/remove)
//     mutate `byId` / `correspondence` / `selectedCorrespondence` immediately
//     and roll back on server error.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && correspondence.length === 0` (first fetch).

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Attachment, Correspondence, PaginationState, SortState } from '@/types'
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
  body?: string | null
  thread_id: string | null
  archived: boolean
  assignee_id: string | null
  // D2: FK embed — resolved display name for assignee_id UUID.
  assignee?: { name: string | null } | null
  framework_ids?: string[] | null
  created_at: string
  updated_at: string
  // Detail-only:
  attachments?: AttachmentApiRow[]
  thread?: unknown[]
}

interface AttachmentApiRow {
  id: string
  correspondence_id: string
  name: string
  storage_path: string
  type: string | null
  size: number | null
  uploaded_at: string
  uploaded_by: string | null
}

function mapAttachment(row: AttachmentApiRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    url: row.storage_path,
    type: (row.type ?? 'application/octet-stream') as Attachment['type'],
    size: row.size ?? 0,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by ?? '',
  }
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
    attachments: row.attachments
      ? row.attachments.map(mapAttachment)
      : previous?.attachments ?? [],
    threadId: row.thread_id ?? undefined,
    archived: row.archived,
    reference: row.reference,
    // D2: prefer joined display name; fall back to raw UUID only when unavailable.
    assignee: row.assignee?.name ?? row.assignee_id ?? previous?.assignee ?? undefined,
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

  // Detail-loaded tracking — set by `fetchById` only. Lets selectors decide
  // whether the nested arrays (`attachments`) are authoritative or stale from
  // a list-only fetch.
  detailLoadedIds: Record<string, true>
  isDetailLoaded: (id: string) => boolean

  fetchAll: (opts?: {
    page?: number
    pageSize?: number
    filters?: Partial<CorrespondenceFilters>
    force?: boolean
  }) => Promise<void>
  fetchById: (id: string) => Promise<Correspondence | null>
  create: (
    data: Omit<Correspondence, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Correspondence>
  update: (id: string, data: Partial<Correspondence>) => Promise<Correspondence>
  delete: (id: string) => Promise<void>

  // Workflow / hot mutations (optimistic).
  archive: (id: string) => Promise<void>
  unarchive: (id: string) => Promise<void>

  // Attachments — optimistic add/remove. `addAttachment` accepts an
  // already-uploaded storage path; the caller (component) is responsible for
  // putting bytes into the `correspondence_attachments` Supabase Storage
  // bucket before registering the metadata row.
  addAttachment: (
    id: string,
    file: { name: string; storage_path: string; type?: string; size?: number },
  ) => Promise<Attachment | null>
  removeAttachment: (correspondenceId: string, attachmentId: string) => Promise<void>

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
  detailLoadedIds: {},

  isDetailLoaded: (id) => Boolean(get().detailLoadedIds[id]),

  fetchAll: async (opts) => {
    const current = get()
    const page = opts?.page ?? current.pagination.page
    const pageSize = opts?.pageSize ?? current.pagination.pageSize
    const filters = opts?.filters
      ? { ...current.filters, ...opts.filters }
      : current.filters

    // Skip if a fresh fetch completed in the last 30s and no opts override
    // page/pageSize/filters (which would change the result set). Callers can
    // pass `force: true` to bypass the TTL.
    const hasOverride =
      opts?.page !== undefined ||
      opts?.pageSize !== undefined ||
      opts?.filters !== undefined
    if (
      !opts?.force &&
      !hasOverride &&
      current.lastFetched &&
      Date.now() - current.lastFetched < 30_000
    ) {
      return
    }

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
        // If the row isn't in `correspondence[]` yet (deep-link to a freshly-
        // created item), prepend it so list-based selectors using
        // `correspondence.find(c => c.id === id)` can resolve it.
        correspondence: state.correspondence.some((c) => c.id === id)
          ? state.correspondence.map((c) => (c.id === id ? item : c))
          : [item, ...state.correspondence],
        selectedCorrespondence: item,
        detailLoadedIds: { ...state.detailLoadedIds, [id]: true },
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
    // OPTIMISTIC: snapshot, apply patch, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Correspondence = {
        ...snapshot,
        ...data,
        updatedAt: new Date().toISOString(),
      }
      set((state) => ({
        correspondence: state.correspondence.map((c) => (c.id === id ? optimistic : c)),
        byId: { ...state.byId, [id]: optimistic },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? optimistic
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
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
      if (snapshot) {
        set((state) => ({
          correspondence: state.correspondence.map((c) => (c.id === id ? snapshot : c)),
          byId: { ...state.byId, [id]: snapshot },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? snapshot
              : state.selectedCorrespondence,
          error: errorMessage(e, 'Failed to update correspondence'),
          isMutating: false,
        }))
      } else {
        set({
          error: errorMessage(e, 'Failed to update correspondence'),
          isMutating: false,
        })
      }
      throw e
    }
  },

  delete: async (id) => {
    // OPTIMISTIC hard-delete: remove immediately, restore on failure.
    const snapshot = get().byId[id]
    const prevIndex = get().correspondence.findIndex((c) => c.id === id)
    set((state) => {
      const { [id]: _removed, ...rest } = state.byId
      const { [id]: _drop, ...restDetail } = state.detailLoadedIds
      return {
        correspondence: state.correspondence.filter((c) => c.id !== id),
        byId: rest,
        detailLoadedIds: restDetail,
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? null
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }
    })
    try {
      await api.delete(`/correspondence/${id}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        set((state) => {
          const list = [...state.correspondence]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, snapshot)
          return {
            correspondence: list,
            byId: { ...state.byId, [id]: snapshot },
            error: errorMessage(e, 'Failed to delete correspondence'),
            isMutating: false,
          }
        })
      } else {
        set({
          error: errorMessage(e, 'Failed to delete correspondence'),
          isMutating: false,
        })
      }
      throw e
    }
  },

  archive: async (id) => {
    // OPTIMISTIC: flip flag immediately, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Correspondence = {
        ...snapshot,
        archived: true,
        updatedAt: new Date().toISOString(),
      }
      set((state) => ({
        correspondence: state.correspondence.map((c) => (c.id === id ? optimistic : c)),
        byId: { ...state.byId, [id]: optimistic },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? optimistic
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.post<CorrespondenceApiRow>(`/correspondence/${id}/archive`)
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
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          correspondence: state.correspondence.map((c) => (c.id === id ? snapshot : c)),
          byId: { ...state.byId, [id]: snapshot },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? snapshot
              : state.selectedCorrespondence,
          error: errorMessage(e, 'Failed to archive correspondence'),
          isMutating: false,
        }))
      } else {
        set({
          error: errorMessage(e, 'Failed to archive correspondence'),
          isMutating: false,
        })
      }
      throw e
    }
  },

  unarchive: async (id) => {
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Correspondence = {
        ...snapshot,
        archived: false,
        updatedAt: new Date().toISOString(),
      }
      set((state) => ({
        correspondence: state.correspondence.map((c) => (c.id === id ? optimistic : c)),
        byId: { ...state.byId, [id]: optimistic },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? optimistic
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.post<CorrespondenceApiRow>(`/correspondence/${id}/unarchive`)
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
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          correspondence: state.correspondence.map((c) => (c.id === id ? snapshot : c)),
          byId: { ...state.byId, [id]: snapshot },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? snapshot
              : state.selectedCorrespondence,
          error: errorMessage(e, 'Failed to unarchive correspondence'),
          isMutating: false,
        }))
      } else {
        set({
          error: errorMessage(e, 'Failed to unarchive correspondence'),
          isMutating: false,
        })
      }
      throw e
    }
  },

  addAttachment: async (id, file) => {
    // OPTIMISTIC: insert a temp attachment immediately, swap on success.
    const tempId = `temp-att-${nanoid()}`
    const now = new Date().toISOString()
    const optimistic: Attachment = {
      id: tempId,
      name: file.name,
      url: file.storage_path,
      type: (file.type ?? 'application/octet-stream') as Attachment['type'],
      size: file.size ?? 0,
      uploadedAt: now,
      uploadedBy: '',
    }
    const snapshot = get().byId[id]
    const previousAttachments = snapshot?.attachments ?? []
    if (snapshot) {
      const next: Correspondence = {
        ...snapshot,
        attachments: [optimistic, ...previousAttachments],
        updatedAt: now,
      }
      set((state) => ({
        correspondence: state.correspondence.map((c) => (c.id === id ? next : c)),
        byId: { ...state.byId, [id]: next },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? next
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.post<AttachmentApiRow>(
        `/correspondence/${id}/attachments`,
        {
          name: file.name,
          storage_path: file.storage_path,
          type: file.type,
          size: file.size,
        },
      )
      const attachment = mapAttachment(row)
      set((state) => {
        const existing = state.byId[id]
        if (!existing) return { isMutating: false }
        const updated: Correspondence = {
          ...existing,
          attachments: [
            attachment,
            ...(existing.attachments ?? []).filter((a) => a.id !== tempId),
          ],
          updatedAt: new Date().toISOString(),
        }
        return {
          correspondence: state.correspondence.map((c) => (c.id === id ? updated : c)),
          byId: { ...state.byId, [id]: updated },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? updated
              : state.selectedCorrespondence,
          isMutating: false,
        }
      })
      return attachment
    } catch (e) {
      if (snapshot) {
        const restored: Correspondence = { ...snapshot, attachments: previousAttachments }
        set((state) => ({
          correspondence: state.correspondence.map((c) => (c.id === id ? restored : c)),
          byId: { ...state.byId, [id]: restored },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === id
              ? restored
              : state.selectedCorrespondence,
          error: errorMessage(e, 'Failed to add attachment'),
          isMutating: false,
        }))
      } else {
        set({
          error: errorMessage(e, 'Failed to add attachment'),
          isMutating: false,
        })
      }
      return null
    }
  },

  removeAttachment: async (correspondenceId, attachmentId) => {
    // OPTIMISTIC removal — snapshot the attachment list to restore on failure.
    const snapshot = get().byId[correspondenceId]
    const previousAttachments = snapshot?.attachments ?? []
    if (snapshot) {
      const next: Correspondence = {
        ...snapshot,
        attachments: previousAttachments.filter((a) => a.id !== attachmentId),
        updatedAt: new Date().toISOString(),
      }
      set((state) => ({
        correspondence: state.correspondence.map((c) =>
          c.id === correspondenceId ? next : c,
        ),
        byId: { ...state.byId, [correspondenceId]: next },
        selectedCorrespondence:
          state.selectedCorrespondence?.id === correspondenceId
            ? next
            : state.selectedCorrespondence,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      await api.delete(`/correspondence/${correspondenceId}/attachments/${attachmentId}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        const restored: Correspondence = { ...snapshot, attachments: previousAttachments }
        set((state) => ({
          correspondence: state.correspondence.map((c) =>
            c.id === correspondenceId ? restored : c,
          ),
          byId: { ...state.byId, [correspondenceId]: restored },
          selectedCorrespondence:
            state.selectedCorrespondence?.id === correspondenceId
              ? restored
              : state.selectedCorrespondence,
          error: errorMessage(e, 'Failed to remove attachment'),
          isMutating: false,
        }))
      } else {
        set({
          error: errorMessage(e, 'Failed to remove attachment'),
          isMutating: false,
        })
      }
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
