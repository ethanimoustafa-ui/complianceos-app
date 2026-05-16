// Letters store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints:
//   GET/POST   /api/letters
//   GET/PATCH/DELETE /api/letters/[letterId]
//   POST       /api/letters/[letterId]/submit-for-approval
//   POST       /api/letters/[letterId]/approve-step
//   POST       /api/letters/[letterId]/reject-step
//   POST       /api/letters/[letterId]/send
//   POST       /api/letters/[letterId]/mark-response-received
//
// IMPORTANT BEHAVIOUR CHANGES vs. legacy seeded store:
//   - Reference numbers (e.g. NOB-2024-082) are now SERVER-side. `create()`
//     no longer composes one; it sends the create payload and stores the
//     reference from the response. `getNextReference()` has been removed —
//     call sites read `letter.reference` from the `create()` return value.
//   - Approval workflow (`submitForApproval`, `approveStep`, `rejectStep`,
//     `send`, `markResponseReceived`) hits the dedicated route handlers and
//     refetches the row to pick up server-computed fields
//     (`response_deadline`, approval-step state, etc).
//   - Template `usage_count` increments are owned by the server (POST /api/letters
//     bumps it when `template_id` is provided in the body).
//   - Placeholder rendering on send: the server stores the canonical body as
//     template form; the client renders for display via lib/letter-placeholders.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && letters.length === 0` (first fetch).

import { create } from 'zustand'
import type {
  Letter,
  LetterType,
  LetterApprovalStep,
  LetterTimelineEvent,
  CircularAuthority,
  PaginationState,
  SortState,
  Attachment,
  PlaceholderDef,
  PlaceholderValue,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { requirePermission } from '@/lib/rbac-store-gate'
import { newTempId } from '@/lib/optimistic'
import { useUserLogStore } from '@/stores/user-log-store'
import { supabase as supabaseClient } from '@/lib/supabase/client'

const LETTER_ATTACHMENTS_BUCKET = 'sama_letter_attachments'

interface LetterFilters {
  type?: LetterType[]
  status?: Letter['status'][]
  authority?: CircularAuthority[]
  dateRange?: { from: string; to: string }
  search?: string
}

// ---------- API row shapes --------------------------------------------------

interface LetterApiRow {
  id: string
  reference: string
  authority: string
  type: string
  sub_category: string | null
  sama_department: string | null
  subject: string
  subject_ar?: string | null
  body?: string
  body_ar?: string | null
  status: string
  priority: 'standard' | 'urgent'
  created_by: string | null
  assigned_to: string | null
  sent_date: string | null
  response_deadline: string | null
  response_received_date: string | null
  recipient_name?: string | null
  recipient_org?: string | null
  recipient_city?: string | null
  recipient_name_ar?: string | null
  recipient_org_ar?: string | null
  recipient_city_ar?: string | null
  signer_name?: string | null
  signer_title?: string | null
  signer_name_ar?: string | null
  signer_title_ar?: string | null
  signature_image_url?: string | null
  framework_ids?: string[] | null
  placeholder_defs?: PlaceholderDef[] | null
  placeholder_values?: Record<string, PlaceholderValue | undefined> | null
  created_at: string
  updated_at: string
  // Detail-only nested:
  approval_steps?: ApprovalStepApiRow[]
  attachments?: AttachmentApiRow[]
  timeline?: TimelineApiRow[]
  observations?: string[]
}

interface ApprovalStepApiRow {
  id: string
  letter_id: string
  step: number
  role: string
  status: 'pending' | 'approved' | 'rejected'
  assigned_to: string | null
  approved_at: string | null
  rejected_at: string | null
  notes: string | null
}

interface AttachmentApiRow {
  id: string
  letter_id: string
  name: string
  storage_path: string
  type: string | null
  size: number | null
  uploaded_at: string
  uploaded_by: string | null
}

interface TimelineApiRow {
  id: string
  letter_id: string
  title: string
  date: string
  user_name: string | null
  status: string
}

// ---------- mappers ---------------------------------------------------------

function mapApprovalStep(row: ApprovalStepApiRow): LetterApprovalStep {
  return {
    step: row.step as 1 | 2 | 3,
    role: row.role as LetterApprovalStep['role'],
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    notes: row.notes ?? undefined,
  }
}

function mapTimelineEvent(row: TimelineApiRow): LetterTimelineEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    user: row.user_name ?? undefined,
    status: (row.status === 'completed' || row.status === 'active' || row.status === 'pending'
      ? row.status
      : 'completed') as LetterTimelineEvent['status'],
  }
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

function mapRow(row: LetterApiRow, previous?: Letter): Letter {
  return {
    id: row.id,
    reference: row.reference,
    authority: row.authority as CircularAuthority,
    type: row.type as LetterType,
    subCategory: row.sub_category ?? previous?.subCategory ?? undefined,
    samaDepartment: row.sama_department ?? previous?.samaDepartment ?? undefined,
    subject: row.subject,
    subjectAr: row.subject_ar ?? previous?.subjectAr ?? undefined,
    body: row.body ?? previous?.body ?? '',
    bodyAr: row.body_ar ?? previous?.bodyAr ?? undefined,
    status: row.status as Letter['status'],
    priority: row.priority,
    createdBy: row.created_by ?? previous?.createdBy ?? '',
    assignedTo: row.assigned_to ?? previous?.assignedTo ?? undefined,
    approvalChain: row.approval_steps
      ? row.approval_steps.map(mapApprovalStep)
      : previous?.approvalChain ?? [],
    timeline: row.timeline
      ? row.timeline.map(mapTimelineEvent)
      : previous?.timeline ?? [],
    sentDate: row.sent_date ?? previous?.sentDate ?? undefined,
    responseDeadline: row.response_deadline ?? previous?.responseDeadline ?? undefined,
    responseReceivedDate:
      row.response_received_date ?? previous?.responseReceivedDate ?? undefined,
    recipientName: row.recipient_name ?? previous?.recipientName ?? undefined,
    recipientOrg: row.recipient_org ?? previous?.recipientOrg ?? undefined,
    recipientCity: row.recipient_city ?? previous?.recipientCity ?? undefined,
    recipientNameAr: row.recipient_name_ar ?? previous?.recipientNameAr ?? undefined,
    recipientOrgAr: row.recipient_org_ar ?? previous?.recipientOrgAr ?? undefined,
    recipientCityAr: row.recipient_city_ar ?? previous?.recipientCityAr ?? undefined,
    signerName: row.signer_name ?? previous?.signerName ?? undefined,
    signerTitle: row.signer_title ?? previous?.signerTitle ?? undefined,
    signerNameAr: row.signer_name_ar ?? previous?.signerNameAr ?? undefined,
    signerTitleAr: row.signer_title_ar ?? previous?.signerTitleAr ?? undefined,
    signatureImageUrl:
      row.signature_image_url ?? previous?.signatureImageUrl ?? undefined,
    attachments: row.attachments
      ? row.attachments.map(mapAttachment)
      : previous?.attachments ?? [],
    relatedObservations: row.observations ?? previous?.relatedObservations ?? [],
    placeholderDefs: row.placeholder_defs ?? previous?.placeholderDefs ?? undefined,
    placeholderValues: row.placeholder_values ?? previous?.placeholderValues ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(
  data: Omit<Letter, 'id' | 'reference' | 'createdAt' | 'updatedAt'> & {
    templateId?: string
  },
): Record<string, unknown> {
  return {
    authority: data.authority || 'sama',
    type: data.type,
    sub_category: data.subCategory || undefined,
    sama_department: data.samaDepartment || undefined,
    subject: data.subject,
    subject_ar: data.subjectAr || undefined,
    body: data.body,
    body_ar: data.bodyAr || undefined,
    priority: data.priority,
    assigned_to: data.assignedTo || undefined,
    recipient_name: data.recipientName || undefined,
    recipient_org: data.recipientOrg || undefined,
    recipient_city: data.recipientCity || undefined,
    recipient_name_ar: data.recipientNameAr || undefined,
    recipient_org_ar: data.recipientOrgAr || undefined,
    recipient_city_ar: data.recipientCityAr || undefined,
    signer_name: data.signerName || undefined,
    signer_title: data.signerTitle || undefined,
    signer_name_ar: data.signerNameAr || undefined,
    signer_title_ar: data.signerTitleAr || undefined,
    signature_image_url: data.signatureImageUrl || undefined,
    framework_ids: [],
    placeholder_defs: data.placeholderDefs ?? [],
    placeholder_values: data.placeholderValues ?? {},
    template_id: data.templateId || undefined,
  }
}

function toUpdatePayload(patch: Partial<Letter>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.authority !== undefined) out.authority = patch.authority
  if (patch.type !== undefined) out.type = patch.type
  if (patch.subCategory !== undefined) out.sub_category = patch.subCategory || undefined
  if (patch.samaDepartment !== undefined) out.sama_department = patch.samaDepartment || undefined
  if (patch.subject !== undefined) out.subject = patch.subject
  if (patch.subjectAr !== undefined) out.subject_ar = patch.subjectAr || undefined
  if (patch.body !== undefined) out.body = patch.body
  if (patch.bodyAr !== undefined) out.body_ar = patch.bodyAr || undefined
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.assignedTo !== undefined) out.assigned_to = patch.assignedTo || undefined
  if (patch.status !== undefined) out.status = patch.status
  if (patch.recipientName !== undefined) out.recipient_name = patch.recipientName || undefined
  if (patch.recipientOrg !== undefined) out.recipient_org = patch.recipientOrg || undefined
  if (patch.recipientCity !== undefined) out.recipient_city = patch.recipientCity || undefined
  if (patch.recipientNameAr !== undefined)
    out.recipient_name_ar = patch.recipientNameAr || undefined
  if (patch.recipientOrgAr !== undefined)
    out.recipient_org_ar = patch.recipientOrgAr || undefined
  if (patch.recipientCityAr !== undefined)
    out.recipient_city_ar = patch.recipientCityAr || undefined
  if (patch.signerName !== undefined) out.signer_name = patch.signerName || undefined
  if (patch.signerTitle !== undefined) out.signer_title = patch.signerTitle || undefined
  if (patch.signerNameAr !== undefined) out.signer_name_ar = patch.signerNameAr || undefined
  if (patch.signerTitleAr !== undefined) out.signer_title_ar = patch.signerTitleAr || undefined
  if (patch.signatureImageUrl !== undefined)
    out.signature_image_url = patch.signatureImageUrl || undefined
  if (patch.placeholderDefs !== undefined) out.placeholder_defs = patch.placeholderDefs
  if (patch.placeholderValues !== undefined) out.placeholder_values = patch.placeholderValues
  if (patch.responseDeadline !== undefined)
    out.response_deadline = patch.responseDeadline || null
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store ----------------------------------------------------------

interface LetterState {
  letters: Letter[]
  byId: Record<string, Letter>
  selectedLetter: Letter | null
  filters: LetterFilters
  pagination: PaginationState
  sort: SortState

  // First-fetch detector: `isLoading && letters.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Async CRUD
  fetchAll: (opts?: {
    page?: number
    pageSize?: number
    filters?: Partial<LetterFilters>
  }) => Promise<void>
  fetchById: (id: string) => Promise<Letter | null>
  // Removed: `getNextReference()` — the server assigns the reference on POST.
  // Read `letter.reference` from the result of `create()` instead.
  create: (
    data: Omit<Letter, 'id' | 'reference' | 'createdAt' | 'updatedAt'> & {
      templateId?: string
    },
  ) => Promise<Letter>
  update: (id: string, data: Partial<Letter>) => Promise<void>
  delete: (id: string) => Promise<void>

  // Attachment upload — uploads file bytes to Supabase Storage, then registers
  // the metadata row via POST /api/letters/[id]/attachments.
  uploadAttachment: (letterId: string, file: File) => Promise<Attachment>

  // Workflow transitions
  submitForApproval: (id: string) => Promise<void>
  approveStep: (id: string, step: 1 | 2 | 3, notes?: string) => Promise<void>
  rejectStep: (id: string, step: 1 | 2 | 3, notes: string) => Promise<void>
  send: (id: string) => Promise<void>
  markResponseReceived: (id: string) => Promise<void>

  setFilters: (filters: LetterFilters) => void
  clearFilters: () => void
  setSelected: (letter: Letter | null) => void
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
  field: 'createdAt',
  direction: 'desc',
}

export const useLetterStore = create<LetterState>()((set, get) => ({
  letters: [],
  byId: {},
  selectedLetter: null,
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
        items: LetterApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/letters', {
        page,
        pageSize,
        status: filters.status?.[0],
        type: filters.type?.[0],
        authority: filters.authority?.[0],
        q: filters.search,
      })
      const previousById = get().byId
      const letters = result.items.map((row) => mapRow(row, previousById[row.id]))
      const byId: Record<string, Letter> = {}
      for (const l of letters) byId[l.id] = l
      set({
        letters,
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
      set({ error: errorMessage(e, 'Failed to fetch letters'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<LetterApiRow>(`/letters/${id}`)
      const previous = get().byId[id]
      const letter = mapRow(row, previous)
      set((state) => ({
        byId: { ...state.byId, [id]: letter },
        letters: state.letters.some((l) => l.id === id)
          ? state.letters.map((l) => (l.id === id ? letter : l))
          : state.letters,
        selectedLetter: letter,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return letter
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch letter'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  // Removed: `getNextReference()` shim — references are generated server-side
  // on POST /api/letters. Consumers read `letter.reference` from `create()`'s
  // returned `Letter`.

  create: async (data) => {
    // OPTIMISTIC: insert a temp letter immediately, swap with server row on
    // success, roll back on failure.
    const tempId = newTempId('temp-letter')
    const now = new Date().toISOString()
    const optimistic: Letter = {
      ...(data as Omit<Letter, 'id' | 'reference' | 'createdAt' | 'updatedAt'>),
      id: tempId,
      reference: '',
      approvalChain: [],
      timeline: [],
      attachments: [],
      relatedObservations: [],
      createdAt: now,
      updatedAt: now,
    } as Letter
    set((state) => ({
      letters: [optimistic, ...state.letters],
      byId: { ...state.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))
    try {
      const row = await api.post<LetterApiRow>('/letters', toCreatePayload(data))
      const created = mapRow(row)
      set((state) => {
        const { [tempId]: _drop, ...restById } = state.byId
        return {
          letters: state.letters.map((l) => (l.id === tempId ? created : l)),
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
          letters: state.letters.filter((l) => l.id !== tempId),
          byId: rest,
          error: errorMessage(e, 'Failed to create letter'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  update: async (id, data) => {
    // OPTIMISTIC: snapshot, apply patch locally, restore on failure.
    const snapshot = get().byId[id]
    if (snapshot) {
      const optimistic: Letter = { ...snapshot, ...data, updatedAt: new Date().toISOString() }
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? optimistic : l)),
        byId: { ...state.byId, [id]: optimistic },
        selectedLetter:
          state.selectedLetter?.id === id ? optimistic : state.selectedLetter,
        isMutating: true,
        error: null,
      }))
    } else {
      set({ isMutating: true, error: null })
    }
    try {
      const row = await api.patch<LetterApiRow>(`/letters/${id}`, toUpdatePayload(data))
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          letters: state.letters.map((l) => (l.id === id ? snapshot : l)),
          byId: { ...state.byId, [id]: snapshot },
          selectedLetter:
            state.selectedLetter?.id === id ? snapshot : state.selectedLetter,
          error: errorMessage(e, 'Failed to update letter'),
          isMutating: false,
        }))
      } else {
        set({ error: errorMessage(e, 'Failed to update letter'), isMutating: false })
      }
      throw e
    }
  },

  delete: async (id) => {
    // OPTIMISTIC: remove immediately. Restore on failure.
    const snapshot = get().byId[id]
    const prevIndex = get().letters.findIndex((l) => l.id === id)
    set((state) => {
      const { [id]: _drop, ...rest } = state.byId
      return {
        letters: state.letters.filter((l) => l.id !== id),
        byId: rest,
        selectedLetter:
          state.selectedLetter?.id === id ? null : state.selectedLetter,
        isMutating: true,
        error: null,
      }
    })
    try {
      await api.delete(`/letters/${id}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        set((state) => {
          const list = [...state.letters]
          const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
          list.splice(insertAt, 0, snapshot)
          return {
            letters: list,
            byId: { ...state.byId, [id]: snapshot },
            error: errorMessage(e, 'Failed to delete letter'),
            isMutating: false,
          }
        })
      } else {
        set({ error: errorMessage(e, 'Failed to delete letter'), isMutating: false })
      }
      throw e
    }
  },

  uploadAttachment: async (letterId, file) => {
    requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: 'uploadAttachment',
      id: letterId,
    })
    set({ isMutating: true, error: null })
    try {
      // 1) Upload file bytes to the private `sama_letter_attachments` bucket.
      //    Path layout: `<letterId>/<timestamp>-<sanitized name>`.
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const storagePath = `${letterId}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabaseClient.storage
        .from(LETTER_ATTACHMENTS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })
      if (uploadError) throw uploadError

      // 2) Register the metadata row via the Route Handler — this enforces
      //    RBAC ('edit' permission) and writes the audit-log entry.
      const row = await api.post<AttachmentApiRow>(
        `/letters/${letterId}/attachments`,
        {
          name: file.name,
          storage_path: storagePath,
          type: file.type || undefined,
          size: file.size,
        },
      )
      const attachment = mapAttachment(row)

      // 3) Reflect the new attachment in store state (no refetch needed —
      //    we have the canonical row from the POST response).
      set((state) => {
        const existing = state.byId[letterId]
        if (!existing) return { isMutating: false }
        const updated: Letter = {
          ...existing,
          attachments: [attachment, ...existing.attachments],
        }
        return {
          letters: state.letters.map((l) => (l.id === letterId ? updated : l)),
          byId: { ...state.byId, [letterId]: updated },
          selectedLetter:
            state.selectedLetter?.id === letterId ? updated : state.selectedLetter,
          isMutating: false,
        }
      })
      return attachment
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to upload attachment'), isMutating: false })
      throw e
    }
  },

  submitForApproval: async (id) => {
    requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: 'submitForApproval',
      id,
    })
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<LetterApiRow>(`/letters/${id}/submit-for-approval`)
      // Refetch the detail to pick up the newly-seeded approval chain & timeline.
      const detail = await api.get<LetterApiRow>(`/letters/${id}`).catch(() => row)
      const previous = get().byId[id]
      const updated = mapRow(detail, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to submit letter for approval'),
        isMutating: false,
      })
      throw e
    }
  },

  approveStep: async (id, step, notes) => {
    const user = requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: `approveStep:${step}`,
      id,
    })
    set({ isMutating: true, error: null })
    try {
      await api.post<LetterApiRow>(`/letters/${id}/approve-step`, {
        step_index: step,
        notes,
      })
      // RBAC-025: audit log the step approval (client-side mirror of the
      // server-side audit log).
      useUserLogStore.getState().log({
        userId: user.id,
        action: 'samaLetter.approval_step_committed',
        target: id,
        metadata: { step, notes: notes ?? null },
      })
      // Refetch detail to refresh approvalChain status + timeline.
      const detail = await api.get<LetterApiRow>(`/letters/${id}`)
      const previous = get().byId[id]
      const updated = mapRow(detail, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to approve step'),
        isMutating: false,
      })
      throw e
    }
  },

  rejectStep: async (id, step, notes) => {
    requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: `rejectStep:${step}`,
      id,
    })
    set({ isMutating: true, error: null })
    try {
      await api.post<LetterApiRow>(`/letters/${id}/reject-step`, {
        step_index: step,
        reason: notes,
      })
      const detail = await api.get<LetterApiRow>(`/letters/${id}`)
      const previous = get().byId[id]
      const updated = mapRow(detail, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to reject step'),
        isMutating: false,
      })
      throw e
    }
  },

  send: async (id) => {
    const user = requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: 'send',
      id,
    })
    set({ isMutating: true, error: null })
    try {
      await api.post<LetterApiRow>(`/letters/${id}/send`)
      useUserLogStore.getState().log({
        userId: user.id,
        action: 'samaLetter.sent',
        target: id,
      })
      const detail = await api.get<LetterApiRow>(`/letters/${id}`)
      const previous = get().byId[id]
      const updated = mapRow(detail, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to send letter'), isMutating: false })
      throw e
    }
  },

  markResponseReceived: async (id) => {
    requirePermission('Approve SAMA Letters', {
      storeName: 'letter',
      actionName: 'markResponseReceived',
      id,
    })
    set({ isMutating: true, error: null })
    try {
      await api.post<LetterApiRow>(`/letters/${id}/mark-response-received`)
      const detail = await api.get<LetterApiRow>(`/letters/${id}`)
      const previous = get().byId[id]
      const updated = mapRow(detail, previous)
      set((state) => ({
        letters: state.letters.map((l) => (l.id === id ? updated : l)),
        byId: { ...state.byId, [id]: updated },
        selectedLetter:
          state.selectedLetter?.id === id ? updated : state.selectedLetter,
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to mark response received'),
        isMutating: false,
      })
      throw e
    }
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (letter) => {
    set({ selectedLetter: letter })
    // WAVE2-A: hydrate nested children (attachments, timeline, approval steps,
    // related observations) by re-fetching the detail endpoint when a letter
    // is selected. The list `fetchAll()` returns flat rows without these
    // arrays, so after a refresh the detail view would otherwise render
    // empty attachment/timeline sections even though the rows exist in DB.
    if (letter?.id) {
      void get().fetchById(letter.id)
    }
  },
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
