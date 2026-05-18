// Circulars store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: /api/circulars (GET list, POST create),
//            /api/circulars/[circularId] (GET detail, PATCH, DELETE),
//            /api/circulars/[circularId]/implementations[/[id][/checklist[/itemId]]],
//            /api/circulars/[circularId]/workflow/advance,
//            /api/circulars/[circularId]/workflow/steps[/[stepId][/reorder]].
//
// Reference numbers (e.g. SAMA-2026-001) are server-generated on POST.
//
// SKELETON-LOADING NOTE: render skeleton when
// `isLoading && circulars.length === 0` (first fetch).

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Circular,
  CircularArticle,
  CircularAuthority,
  CircularFilters,
  CircularWorkflowStep,
  CircularTimelineEvent,
  CircularVersionEntry,
  Attachment,
  ChecklistItem,
  ArticleVersionEntry,
  ArticleTimelineEvent,
  CircularPendingEdit,
  CircularPriority,
  CircularStatus,
  CircularApplicability,
  CAPStatus,
  RegulatoryBodyId,
} from '@/types'
import { validateChildDeadline } from '@/lib/deadline-validation'
import { api, ApiClientError } from '@/lib/api-client'

// ---------- API row shape ---------------------------------------------------

interface CircularApiRow {
  id: string
  reference: string
  authority: string
  title: string
  priority: string
  status: string
  applicability: string
  departments: string[] | null
  business_owner_department: string | null
  business_owner_department_id: string | null
  assigned_to: string | null
  progress: number
  issuance_date: string
  due_date: string
  cap_status: string
  cap_due_date: string | null
  cap_deadline: string | null
  cap_response_deadline: string | null
  remediation_deadline: string | null
  description: string | null
  pdf_url: string | null
  reference_url: string | null
  framework_ids: string[] | null
  created_at: string
  updated_at: string
  // Detail-only:
  workflow_steps?: unknown[]
  implementations?: unknown[]
  timeline?: unknown[]
}

interface ImplementationApiRow {
  id: string
  circular_id: string
  article_number: string
  title: string
  description: string | null
  risk_level: string
  responsible_department: string | null
  compliance_status: string
  assigned_to: string | null
  notes: string | null
  sort_order: number
}

interface WorkflowStepApiRow {
  id: string
  circular_id: string
  phase: number
  label: string
  label_ar: string | null
  status: 'pending' | 'current' | 'completed'
  date: string | null
  user_name: string | null
  notes: string | null
  action_label: string
  action_label_ar: string
  requires_notes: boolean
  action_type: string
  sort_order: number
  deadline?: string | null
}

// ---------- workflow step defaults ------------------------------------------

export function buildInitialWorkflowSteps(): CircularWorkflowStep[] {
  return [
    { id: 'cap-review', phase: 0, label: 'CAP Review', labelAr: 'مراجعة خطة التقييم', status: 'current', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'cap-approved', phase: 0, label: 'CAP Approval', labelAr: 'اعتماد خطة التقييم', status: 'pending', actionLabel: 'Approve', actionLabelAr: 'اعتماد', requiresNotes: true, actionType: 'approve' },
    { id: 'notify-bo', phase: 1, label: 'Notify Business Owner', labelAr: 'إشعار المالك التنفيذي', status: 'pending', actionLabel: 'Notify', actionLabelAr: 'إشعار', requiresNotes: false, actionType: 'notify-bo' },
    { id: 'cap-received', phase: 1, label: 'Corrective Action Plan Received', labelAr: 'استلام خطة العمل التصحيحي', status: 'pending', actionLabel: 'Acknowledge Receipt', actionLabelAr: 'تأكيد الاستلام', requiresNotes: false, actionType: 'acknowledge' },
    { id: 'cap-under-review', phase: 1, label: 'Corrective Action Plan Under Review', labelAr: 'مراجعة خطة العمل التصحيحي', status: 'pending', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'cap-final-approved', phase: 1, label: 'Corrective Action Plan Approved — Notify Authority', labelAr: 'اعتماد نهائي — إشعار الجهة', status: 'pending', actionLabel: 'Notify Authority', actionLabelAr: 'إشعار الجهة', requiresNotes: true, actionType: 'notify-authority' },
    { id: 'remediation-in-progress', phase: 2, label: 'Remediation In Progress', labelAr: 'التنفيذ جارٍ', status: 'pending', actionLabel: 'Start Remediation', actionLabelAr: 'بدء التنفيذ', requiresNotes: false, actionType: 'start' },
    { id: 'remediation-submitted', phase: 2, label: 'Evidence Submitted', labelAr: 'تقديم الأدلة', status: 'pending', actionLabel: 'Submit Evidence', actionLabelAr: 'تقديم الأدلة', requiresNotes: false, actionType: 'submit' },
    { id: 'remediation-under-review', phase: 2, label: 'Remediation Under Review', labelAr: 'مراجعة التنفيذ', status: 'pending', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'remediation-approved', phase: 2, label: 'Completed — Authority Notified', labelAr: 'مكتمل — تم إشعار الجهة', status: 'pending', actionLabel: 'Complete', actionLabelAr: 'إتمام', requiresNotes: true, actionType: 'complete' },
  ]
}

function recalcProgress(c: Circular): number {
  const allChecklist = c.articles.flatMap((a) => a.checklist ?? [])
  const totalItems = allChecklist.length
  const doneItems = allChecklist.filter((i) => i.completed).length
  const steps = c.workflowSteps ?? buildInitialWorkflowSteps()
  const totalSteps = steps.length
  const doneSteps = steps.filter((s) => s.status === 'completed').length
  const checklistPct = totalItems > 0 ? doneItems / totalItems : 0
  const phasePct = totalSteps > 0 ? doneSteps / totalSteps : 0
  return Math.round((checklistPct * 0.6 + phasePct * 0.4) * 100)
}

function syncSelected(
  selectedCircular: Circular | null,
  circulars: Circular[],
  targetId: string,
): Circular | null {
  if (selectedCircular?.id !== targetId) return selectedCircular
  return circulars.find((c) => c.id === targetId) ?? selectedCircular
}

function mapRow(row: CircularApiRow, previous?: Circular): Circular {
  return {
    id: row.id,
    reference: row.reference,
    authority: row.authority as CircularAuthority,
    title: row.title,
    priority: row.priority as CircularPriority,
    status: row.status as CircularStatus,
    applicability: row.applicability as CircularApplicability,
    departments: row.departments ?? previous?.departments ?? [],
    businessOwnerDepartment:
      row.business_owner_department ?? previous?.businessOwnerDepartment ?? undefined,
    assignedTo: row.assigned_to ?? previous?.assignedTo ?? undefined,
    progress: row.progress ?? previous?.progress ?? 0,
    issuanceDate: row.issuance_date,
    dueDate: row.due_date,
    capStatus: row.cap_status as CAPStatus,
    capDueDate: row.cap_due_date ?? previous?.capDueDate ?? undefined,
    // Detail-only children — when the row comes from `/api/circulars/[id]`
    // the response carries `implementations`, `workflow_steps`, `timeline`
    // arrays; surface them here so the UI doesn't fall back to client-only
    // defaults. Sort timeline newest-first so consumers can render in array
    // order.
    articles: Array.isArray(row.implementations) && row.implementations.length > 0
      ? row.implementations.map((r) => mapImplementationRow(r as ImplementationApiRow))
      : previous?.articles ?? [],
    description: row.description ?? previous?.description ?? undefined,
    pdfUrl: row.pdf_url ?? previous?.pdfUrl ?? undefined,
    workflowSteps: Array.isArray(row.workflow_steps) && row.workflow_steps.length > 0
      ? (row.workflow_steps as WorkflowStepApiRow[]).map(mapWorkflowStepRow)
      : previous?.workflowSteps ?? buildInitialWorkflowSteps(),
    timeline: Array.isArray(row.timeline)
      ? [...row.timeline]
          .map(mapTimelineRow)
          .sort((a, b) => {
            const ta = a.date ? Date.parse(a.date) : 0
            const tb = b.date ? Date.parse(b.date) : 0
            return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
          })
      : previous?.timeline ?? [],
    versions: previous?.versions ?? [
      {
        version: 1,
        date: row.created_at.slice(0, 10),
        author: 'System',
        changes: 'Initial registration',
        approved: true,
      },
    ],
    capAttachments: previous?.capAttachments ?? [],
    capResponseDeadline: row.cap_response_deadline ?? previous?.capResponseDeadline ?? undefined,
    remediationAttachments: previous?.remediationAttachments ?? [],
    capDeadline: row.cap_deadline ?? previous?.capDeadline ?? undefined,
    remediationDeadline: row.remediation_deadline ?? previous?.remediationDeadline ?? undefined,
    referenceUrl: row.reference_url ?? previous?.referenceUrl ?? undefined,
    pendingEdit: previous?.pendingEdit,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapImplementationRow(row: ImplementationApiRow, previous?: CircularArticle): CircularArticle {
  return {
    id: row.id,
    articleNumber: row.article_number,
    title: row.title,
    description: row.description ?? undefined,
    riskLevel: row.risk_level as CircularArticle['riskLevel'],
    responsibleDepartment: row.responsible_department ?? '',
    complianceStatus: row.compliance_status as CircularArticle['complianceStatus'],
    assignedTo: row.assigned_to ?? undefined,
    notes: row.notes ?? undefined,
    checklist: previous?.checklist ?? [],
    attachments: previous?.attachments ?? [],
    versions: previous?.versions,
    timeline: previous?.timeline,
  }
}

function mapTimelineRow(row: unknown): CircularTimelineEvent {
  const r = row as {
    id: string
    title: string
    title_ar?: string | null
    date: string
    user_name?: string | null
    status?: string | null
  }
  return {
    id: r.id,
    title: r.title,
    titleAr: r.title_ar ?? undefined,
    date: r.date,
    user: r.user_name ?? undefined,
    status: (r.status as CircularTimelineEvent['status']) ?? 'completed',
  }
}

function mapWorkflowStepRow(row: WorkflowStepApiRow): CircularWorkflowStep {
  return {
    id: row.id,
    phase: (row.phase as 0 | 1 | 2),
    label: row.label,
    labelAr: row.label_ar ?? row.label,
    status: row.status,
    date: row.date ?? undefined,
    user: row.user_name ?? undefined,
    notes: row.notes ?? undefined,
    actionLabel: row.action_label,
    actionLabelAr: row.action_label_ar,
    requiresNotes: row.requires_notes,
    actionType: row.action_type as CircularWorkflowStep['actionType'],
    deadline: row.deadline ?? undefined,
  }
}

function toCreatePayload(
  data: Omit<Circular, 'id' | 'reference' | 'createdAt' | 'updatedAt'> & {
    capDeadline?: string
    remediationDeadline?: string
    referenceUrl?: string
  },
): Record<string, unknown> {
  return {
    authority: data.authority,
    title: data.title,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'pending',
    applicability: data.applicability ?? 'pending',
    departments: data.departments ?? [],
    business_owner_department: data.businessOwnerDepartment || undefined,
    assigned_to: data.assignedTo || undefined,
    progress: data.progress ?? 0,
    // Empty-string from optional date input must be elided so the Zod schema's
    // `.optional().default(today)` kicks in. Sending '' fails the DateString
    // `min(1)` check on the route handler (400 Validation failed).
    issuance_date: data.issuanceDate || undefined,
    due_date: data.dueDate,
    cap_status: data.capStatus ?? 'not-started',
    cap_due_date: data.capDueDate || undefined,
    cap_deadline: data.capDeadline || undefined,
    cap_response_deadline: data.capResponseDeadline || undefined,
    remediation_deadline: data.remediationDeadline || undefined,
    description: data.description || undefined,
    pdf_url: data.pdfUrl || undefined,
    reference_url: data.referenceUrl || undefined,
    framework_ids: data.frameworkIds ?? [],
  }
}

function toUpdatePayload(patch: Partial<Circular>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.authority !== undefined) out.authority = patch.authority
  if (patch.title !== undefined) out.title = patch.title
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.status !== undefined) out.status = patch.status
  if (patch.applicability !== undefined) out.applicability = patch.applicability
  if (patch.departments !== undefined) out.departments = patch.departments
  if (patch.businessOwnerDepartment !== undefined)
    out.business_owner_department = patch.businessOwnerDepartment || undefined
  if (patch.assignedTo !== undefined) out.assigned_to = patch.assignedTo || undefined
  if (patch.progress !== undefined) out.progress = patch.progress
  if (patch.issuanceDate !== undefined) out.issuance_date = patch.issuanceDate
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate
  if (patch.capStatus !== undefined) out.cap_status = patch.capStatus
  if (patch.capDueDate !== undefined) out.cap_due_date = patch.capDueDate || undefined
  if (patch.capDeadline !== undefined) out.cap_deadline = patch.capDeadline || undefined
  if (patch.capResponseDeadline !== undefined)
    out.cap_response_deadline = patch.capResponseDeadline || undefined
  if (patch.remediationDeadline !== undefined)
    out.remediation_deadline = patch.remediationDeadline || undefined
  if (patch.description !== undefined) out.description = patch.description || undefined
  if (patch.pdfUrl !== undefined) out.pdf_url = patch.pdfUrl ?? ''
  if (patch.referenceUrl !== undefined) out.reference_url = patch.referenceUrl || undefined
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store ----------------------------------------------------------

interface CircularState {
  circulars: Circular[]
  byId: Record<string, Circular>
  selectedCircular: Circular | null
  filters: CircularFilters

  // First-fetch detector: `isLoading && circulars.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Async actions
  fetchAll: (force?: boolean) => Promise<void>
  fetchById: (id: string) => Promise<Circular | null>
  create: (
    data: Omit<Circular, 'id' | 'reference' | 'createdAt' | 'updatedAt'> & {
      capDeadline?: string
      remediationDeadline?: string
      referenceUrl?: string
    },
  ) => Promise<Circular>
  update: (id: string, data: Partial<Circular>) => Promise<void>
  delete: (id: string) => Promise<void>

  setSelected: (circular: Circular | null) => void
  setFilters: (filters: CircularFilters) => void
  clearFilters: () => void
  clearError: () => void

  // Sub-resource mutations (now wired to API).
  assignBusinessOwner: (id: string, dept: string) => Promise<void>
  setPdfUrl: (circularId: string, dataUrl: string) => Promise<void>
  clearPdfUrl: (circularId: string) => Promise<void>

  addArticle: (circularId: string, article: Omit<CircularArticle, 'id'>) => Promise<CircularArticle>
  updateArticle: (
    circularId: string,
    articleId: string,
    data: Partial<CircularArticle>,
  ) => Promise<void>
  deleteArticle: (circularId: string, articleId: string) => Promise<void>
  toggleChecklistItem: (circularId: string, articleId: string, itemId: string) => Promise<void>
  addChecklistItem: (circularId: string, articleId: string, title: string) => Promise<void>
  deleteChecklistItem: (circularId: string, articleId: string, itemId: string) => Promise<void>
  addArticleTimelineEvent: (
    circularId: string,
    articleId: string,
    event: Omit<ArticleTimelineEvent, 'id'>,
  ) => void

  advanceWorkflowStep: (circularId: string, stepId: string, notes?: string) => Promise<void>
  setRuleStepDeadline: (
    circularId: string,
    stepIndex: number,
    deadline: string | undefined,
    actingUser: string,
  ) => { ok: true } | { ok: false; reason: string }
  addWorkflowStep: (
    circularId: string,
    step: {
      label: string
      labelAr?: string
      phase?: 0 | 1 | 2
      actionType?: CircularWorkflowStep['actionType']
    },
    actingUser: string,
  ) => Promise<void>
  renameWorkflowStep: (
    circularId: string,
    stepIndex: number,
    newLabel: string,
    actingUser: string,
  ) => Promise<void>
  removeWorkflowStep: (circularId: string, stepIndex: number, actingUser: string) => Promise<void>
  reorderWorkflowSteps: (
    circularId: string,
    fromIndex: number,
    toIndex: number,
    actingUser: string,
  ) => Promise<void>

  requestCircularEdit: (circularId: string, editData: Partial<Circular>) => Promise<void>
  approveCircularEditStep: (circularId: string, approvalId: string, notes: string) => void
  rejectCircularEditStep: (circularId: string, approvalId: string, notes: string) => void

  addCAPAttachment: (
    circularId: string,
    file: { name: string; size?: number; dataUrl?: string; type?: string },
  ) => void
  addRemediationAttachment: (
    circularId: string,
    file: { name: string; size?: number; dataUrl?: string; type?: string },
  ) => void
  removeCAPAttachment: (circularId: string, attachmentId: string) => void
  removeRemediationAttachment: (circularId: string, attachmentId: string) => void

  addTimelineEvent: (circularId: string, event: Omit<CircularTimelineEvent, 'id'>) => void
}

// ---------- helpers ---------------------------------------------------------

function applyCircular(
  state: CircularState,
  circularId: string,
  mutator: (c: Circular) => Circular,
): Pick<CircularState, 'circulars' | 'byId' | 'selectedCircular'> {
  const circulars = state.circulars.map((c) => (c.id === circularId ? mutator(c) : c))
  const updated = circulars.find((c) => c.id === circularId)
  return {
    circulars,
    byId: updated ? { ...state.byId, [circularId]: updated } : state.byId,
    selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
  }
}

export const useCircularStore = create<CircularState>()((set, get) => ({
  circulars: [],
  byId: {},
  selectedCircular: null,
  filters: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (force = false) => {
    const state = get()
    // Skip if a fresh fetch completed in the last 30s, unless force=true.
    if (!force && state.lastFetched && Date.now() - state.lastFetched < 30_000) {
      return
    }
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: CircularApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/circulars', { pageSize: 100 })
      const previousById = get().byId
      const circulars = result.items.map((row) => mapRow(row, previousById[row.id]))
      const byId: Record<string, Circular> = {}
      for (const c of circulars) byId[c.id] = c
      set({
        circulars,
        byId,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch circulars'), isLoading: false })
    }
  },

  fetchById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<CircularApiRow>(`/circulars/${id}`)
      const previous = get().byId[id]
      const circular = mapRow(row, previous)
      set((state) => ({
        byId: { ...state.byId, [id]: circular },
        circulars: state.circulars.some((c) => c.id === id)
          ? state.circulars.map((c) => (c.id === id ? circular : c))
          : state.circulars,
        selectedCircular: circular,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return circular
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch circular'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  create: async (data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<CircularApiRow>('/circulars', toCreatePayload(data))
      const created = mapRow(row)
      // Optimistic-prepend: surface immediately so UI doesn't need a reload.
      set((state) => ({
        circulars: [created, ...state.circulars.filter((c) => c.id !== created.id)],
        byId: { ...state.byId, [created.id]: created },
        selectedCircular: created,
        isMutating: false,
      }))
      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create circular'), isMutating: false })
      throw e
    }
  },

  update: async (id, data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<CircularApiRow>(`/circulars/${id}`, toUpdatePayload(data))
      const previous = get().byId[id]
      const updated = mapRow(row, previous)
      set((state) => ({
        circulars: state.circulars.map((c) => (c.id === id ? updated : c)),
        byId: { ...state.byId, [id]: updated },
        selectedCircular:
          state.selectedCircular?.id === id ? updated : state.selectedCircular,
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update circular'), isMutating: false })
      throw e
    }
  },

  delete: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/circulars/${id}`)
      set((state) => {
        const { [id]: _drop, ...rest } = state.byId
        return {
          circulars: state.circulars.filter((c) => c.id !== id),
          byId: rest,
          selectedCircular:
            state.selectedCircular?.id === id ? null : state.selectedCircular,
          isMutating: false,
        }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete circular'), isMutating: false })
      throw e
    }
  },

  setSelected: (circular) => set({ selectedCircular: circular }),
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  clearError: () => set({ error: null }),

  // ── Wired sub-resource mutations ─────────────────────────────────────────

  assignBusinessOwner: async (id, dept) => {
    await get().update(id, { businessOwnerDepartment: dept })
  },

  setPdfUrl: async (circularId, dataUrl) => {
    await get().update(circularId, { pdfUrl: dataUrl })
  },

  clearPdfUrl: async (circularId) => {
    await get().update(circularId, { pdfUrl: '' })
  },

  addArticle: async (circularId, article) => {
    const snapshot = get().byId[circularId]
    const tempId = `temp-${nanoid()}`
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const optimistic: CircularArticle = {
      ...article,
      id: tempId,
      checklist: article.checklist ?? [],
      attachments: article.attachments ?? [],
      versions: article.versions ?? [
        {
          version: 1,
          date: today,
          author: 'Current User',
          summary: 'Article created',
          fieldChanges: {},
          approved: true,
        },
      ],
      timeline: article.timeline ?? [
        {
          id: nanoid(),
          title: 'Article Created',
          titleAr: 'تم إنشاء المادة',
          date: today,
          user: 'Current User',
          status: 'completed' as const,
        },
      ],
    }
    // Optimistic insert.
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = { ...c, articles: [...c.articles, optimistic], updatedAt: now }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    try {
      // Empty-string optional fields must be elided so the route's
      // `z.string().uuid().optional()` / `.optional()` schemas don't fail with
      // "Validation failed" — Zod treats `""` as present-and-invalid.
      const payload = {
        article_number: article.articleNumber,
        title: article.title,
        description: article.description || undefined,
        risk_level: article.riskLevel,
        compliance_status: article.complianceStatus,
        responsible_department: article.responsibleDepartment || undefined,
        assigned_to: article.assignedTo || undefined,
        notes: article.notes || undefined,
        sort_order: (snapshot?.articles.length ?? 0),
      }
      const row = await api.post<ImplementationApiRow>(
        `/circulars/${circularId}/implementations`,
        payload,
      )
      const real = mapImplementationRow(row, optimistic)
      // Swap temp row for server row.
      set((state) =>
        applyCircular(state, circularId, (c) => {
          const updated = {
            ...c,
            articles: c.articles.map((a) => (a.id === tempId ? real : a)),
          }
          return { ...updated, progress: recalcProgress(updated) }
        }),
      )

      // Persist any optimistic checklist items the user added during creation.
      const seedItems = article.checklist ?? []
      if (seedItems.length > 0) {
        for (const item of seedItems) {
          try {
            await api.post(
              `/circulars/${circularId}/implementations/${real.id}/checklist`,
              { title: item.title, completed: !!item.completed },
            )
          } catch {
            // Swallow per-item errors so the parent succeeds; user can retry.
          }
        }
      }

      return real
    } catch (e) {
      // Restore snapshot.
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to add article') })
      throw e
    }
  },

  updateArticle: async (circularId, articleId, updates) => {
    const snapshot = get().byId[circularId]
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    // Optimistic patch.
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const articles = c.articles.map((a) => {
          if (a.id !== articleId) return a
          const trackedFields = [
            'title', 'articleNumber', 'description', 'riskLevel',
            'complianceStatus', 'responsibleDepartment', 'assignedTo',
          ] as const
          const fieldChanges: Record<string, { from: string; to: string }> = {}
          for (const field of trackedFields) {
            const oldVal = String(a[field] ?? '')
            const newVal = String((updates as Record<string, unknown>)[field] ?? a[field] ?? '')
            if (oldVal !== newVal) fieldChanges[field] = { from: oldVal, to: newVal }
          }
          const nextVer = (a.versions?.length ?? 0) + 1
          const newVersion: ArticleVersionEntry = {
            version: nextVer,
            date: today,
            author: 'Current User',
            summary: 'Article updated',
            fieldChanges,
            approved: true,
          }
          const newTimelineEvent: ArticleTimelineEvent = {
            id: nanoid(),
            title: 'Article Updated',
            titleAr: 'تم تحديث المادة',
            date: today,
            user: 'Current User',
            status: 'completed',
          }
          return {
            ...a,
            ...updates,
            versions: [...(a.versions ?? []), newVersion],
            timeline: [...(a.timeline ?? []), newTimelineEvent],
          }
        })
        const updated = { ...c, articles, updatedAt: now }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // Skip server call for un-persisted (temp) rows.
    if (articleId.startsWith('temp-')) return

    try {
      const payload: Record<string, unknown> = {}
      if (updates.articleNumber !== undefined) payload.article_number = updates.articleNumber
      if (updates.title !== undefined) payload.title = updates.title
      if (updates.description !== undefined) payload.description = updates.description || undefined
      if (updates.riskLevel !== undefined) payload.risk_level = updates.riskLevel
      if (updates.complianceStatus !== undefined) payload.compliance_status = updates.complianceStatus
      // Empty string on an optional UUID would fail Zod's uuid().optional().
      // Coerce empty string → undefined so the field is omitted on the wire.
      if (updates.responsibleDepartment !== undefined) payload.responsible_department = updates.responsibleDepartment || undefined
      if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo || undefined
      if (updates.notes !== undefined) payload.notes = updates.notes || undefined
      const row = await api.patch<ImplementationApiRow>(
        `/circulars/${circularId}/implementations/${articleId}`,
        payload,
      )
      const real = mapImplementationRow(row, get().byId[circularId]?.articles.find((a) => a.id === articleId))
      set((state) =>
        applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) =>
            a.id === articleId ? { ...a, ...real, versions: a.versions, timeline: a.timeline, checklist: a.checklist } : a,
          ),
          updatedAt: now,
        })),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to update article') })
      throw e
    }
  },

  deleteArticle: async (circularId, articleId) => {
    const snapshot = get().byId[circularId]
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          articles: c.articles.filter((a) => a.id !== articleId),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )
    if (articleId.startsWith('temp-')) return

    try {
      await api.delete(`/circulars/${circularId}/implementations/${articleId}`)
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to delete article') })
      throw e
    }
  },

  toggleChecklistItem: async (circularId, articleId, itemId) => {
    const snapshot = get().byId[circularId]
    const article = snapshot?.articles.find((a) => a.id === articleId)
    const item = article?.checklist.find((i) => i.id === itemId)
    const newCompleted = item ? !item.completed : true
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const newEvent: ArticleTimelineEvent = {
              id: nanoid(),
              title: `Checklist item ${newCompleted ? 'completed' : 'unchecked'}: ${item?.title ?? itemId}`,
              titleAr: `عنصر القائمة ${newCompleted ? 'مكتمل' : 'غير مكتمل'}: ${item?.title ?? itemId}`,
              date: today,
              user: 'Current User',
              status: 'completed',
            }
            return {
              ...a,
              checklist: a.checklist.map((i) =>
                i.id === itemId ? { ...i, completed: newCompleted } : i,
              ),
              timeline: [...(a.timeline ?? []), newEvent],
            }
          }),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    if (itemId.startsWith('temp-') || articleId.startsWith('temp-')) return

    try {
      await api.patch(
        `/circulars/${circularId}/implementations/${articleId}/checklist/${itemId}`,
        { completed: newCompleted },
      )
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to update checklist item') })
      throw e
    }
  },

  addChecklistItem: async (circularId, articleId, title) => {
    const snapshot = get().byId[circularId]
    const tempId = `temp-${nanoid()}`
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newItem: ChecklistItem = {
      id: tempId,
      title,
      completed: false,
      order: Date.now(),
    }
    const newEvent: ArticleTimelineEvent = {
      id: nanoid(),
      title: `Checklist item added: ${title}`,
      titleAr: `تمت إضافة عنصر للقائمة: ${title}`,
      date: today,
      user: 'Current User',
      status: 'completed',
    }
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        articles: c.articles.map((a) => {
          if (a.id !== articleId) return a
          return {
            ...a,
            checklist: [...a.checklist, newItem],
            timeline: [...(a.timeline ?? []), newEvent],
          }
        }),
        updatedAt: now,
      })),
    )

    if (articleId.startsWith('temp-')) return

    try {
      const row = await api.post<{ id: string; text: string; completed: boolean; sort_order: number }>(
        `/circulars/${circularId}/implementations/${articleId}/checklist`,
        { title },
      )
      set((state) =>
        applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            return {
              ...a,
              checklist: a.checklist.map((i) =>
                i.id === tempId
                  ? { id: row.id, title: row.text, completed: row.completed, order: row.sort_order }
                  : i,
              ),
            }
          }),
        })),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to add checklist item') })
      throw e
    }
  },

  deleteChecklistItem: async (circularId, articleId, itemId) => {
    const snapshot = get().byId[circularId]
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const article = snapshot?.articles.find((a) => a.id === articleId)
    const item = article?.checklist.find((i) => i.id === itemId)
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const newEvent: ArticleTimelineEvent = {
              id: nanoid(),
              title: `Checklist item deleted: ${item?.title ?? itemId}`,
              titleAr: `تم حذف عنصر من القائمة: ${item?.title ?? itemId}`,
              date: today,
              user: 'Current User',
              status: 'completed',
            }
            return {
              ...a,
              checklist: a.checklist.filter((i) => i.id !== itemId),
              timeline: [...(a.timeline ?? []), newEvent],
            }
          }),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    if (itemId.startsWith('temp-') || articleId.startsWith('temp-')) return

    try {
      await api.delete(`/circulars/${circularId}/implementations/${articleId}/checklist/${itemId}`)
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to delete checklist item') })
      throw e
    }
  },

  addArticleTimelineEvent: (circularId, articleId, event) => {
    const now = new Date().toISOString()
    const newEvent: ArticleTimelineEvent = { id: nanoid(), ...event }
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        articles: c.articles.map((a) => {
          if (a.id !== articleId) return a
          return { ...a, timeline: [...(a.timeline ?? []), newEvent] }
        }),
        updatedAt: now,
      })),
    )
  },

  advanceWorkflowStep: async (circularId, stepId, notes) => {
    const snapshot = get().byId[circularId]
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    // Optimistic advance.
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const steps = (c.workflowSteps ?? buildInitialWorkflowSteps()).map((s) => {
          if (s.id === stepId) {
            return { ...s, status: 'completed' as const, date: today, user: 'Current User', notes }
          }
          return s
        })
        const updatedSteps: CircularWorkflowStep[] = []
        let setNextCurrent = false
        for (const s of steps) {
          if (s.status === 'completed') {
            updatedSteps.push(s)
          } else if (!setNextCurrent) {
            updatedSteps.push({ ...s, status: 'current' })
            setNextCurrent = true
          } else {
            updatedSteps.push({ ...s, status: 'pending' })
          }
        }
        const advancedStep = (c.workflowSteps ?? []).find((s) => s.id === stepId)
        const newEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: `Step advanced: ${advancedStep?.label ?? stepId}`,
          titleAr: `تم تقديم الخطوة: ${advancedStep?.labelAr ?? stepId}`,
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        return {
          ...c,
          workflowSteps: updatedSteps,
          timeline: [...(c.timeline ?? []), newEvent],
          updatedAt: now,
        }
      }),
    )

    try {
      await api.post(`/circulars/${circularId}/workflow/advance`, {
        step_id: stepId,
        notes,
      })
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to advance workflow step') })
      throw e
    }
  },

  setRuleStepDeadline: (circularId, stepIndex, deadline, actingUser) => {
    const circular = get().circulars.find((c) => c.id === circularId)
    if (!circular) return { ok: false, reason: 'circular-not-found' }
    const steps = circular.workflowSteps ?? []
    if (stepIndex < 0 || stepIndex >= steps.length) {
      return { ok: false, reason: 'step-not-found' }
    }
    const step = steps[stepIndex]
    const parentDeadline =
      step.phase === 0 || step.phase === 1
        ? circular.capDeadline ?? circular.dueDate
        : circular.dueDate
    const validation = validateChildDeadline(deadline ?? null, parentDeadline ?? null)
    if (!validation.ok) return { ok: false, reason: validation.reason }
    const previous = step.deadline
    const newSteps = steps.map((s, i) =>
      i === stepIndex ? { ...s, deadline: deadline || undefined } : s,
    )
    const today = new Date().toISOString().split('T')[0]
    const action = previous && deadline ? 'phase_deadline_changed' : 'phase_deadline_set'
    const stepLabel = step.label
    const stepLabelAr = step.labelAr || stepLabel
    const event: CircularTimelineEvent = {
      id: nanoid(),
      title: deadline
        ? previous
          ? `Deadline for "${stepLabel}" changed from ${previous} to ${deadline}`
          : `Deadline for "${stepLabel}" set to ${deadline}`
        : `Deadline cleared on "${stepLabel}"`,
      titleAr: deadline
        ? previous
          ? `تم تغيير الموعد النهائي لـ "${stepLabelAr}" من ${previous} إلى ${deadline}`
          : `تم تعيين الموعد النهائي لـ "${stepLabelAr}" إلى ${deadline}`
        : `تم مسح الموعد النهائي لـ "${stepLabelAr}"`,
      textEn: deadline
        ? previous
          ? `Deadline for "${stepLabel}" changed from ${previous} to ${deadline}`
          : `Deadline for "${stepLabel}" set to ${deadline}`
        : `Deadline cleared on "${stepLabel}"`,
      textAr: deadline
        ? previous
          ? `تم تغيير الموعد النهائي لـ "${stepLabelAr}" من ${previous} إلى ${deadline}`
          : `تم تعيين الموعد النهائي لـ "${stepLabelAr}" إلى ${deadline}`
        : `تم مسح الموعد النهائي لـ "${stepLabelAr}"`,
      date: today,
      user: actingUser,
      status: 'completed',
      type: action,
    }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: newSteps,
        timeline: [...(c.timeline ?? []), event],
        updatedAt: now,
      })),
    )
    // Fire-and-forget API call so the inline picker stays synchronous and
    // returns the boolean shape its caller expects. Errors surface via store.error.
    if (step.id && !step.id.startsWith('temp-')) {
      void api
        .patch(`/circulars/${circularId}/workflow/steps/${step.id}`, {
          deadline: deadline ?? null,
        })
        .catch((e) => {
          set({ error: errorMessage(e, 'Failed to update step deadline') })
        })
    }
    return { ok: true }
  },

  addWorkflowStep: async (circularId, payload, actingUser) => {
    const snapshot = get().byId[circularId]
    const circular = snapshot
    if (!circular) return
    const existingSteps = circular.workflowSteps ?? buildInitialWorkflowSteps()
    const currentStep = existingSteps.find((s) => s.status === 'current')
    const phase = (payload.phase ?? currentStep?.phase ?? 2) as 0 | 1 | 2
    const tempId = `temp-${nanoid()}`
    const newStep: CircularWorkflowStep = {
      id: tempId,
      phase,
      label: payload.label.trim(),
      labelAr: (payload.labelAr ?? payload.label).trim(),
      status: 'pending',
      actionLabel: 'Advance',
      actionLabelAr: 'تقديم',
      requiresNotes: false,
      actionType: payload.actionType ?? 'advance',
    }
    const today = new Date().toISOString().split('T')[0]
    const event: CircularTimelineEvent = {
      id: nanoid(),
      title: `Workflow step "${newStep.label}" added`,
      titleAr: `تمت إضافة خطوة "${newStep.labelAr}" إلى مسار العمل`,
      textEn: `Workflow step "${newStep.label}" added`,
      textAr: `تمت إضافة خطوة "${newStep.labelAr}" إلى مسار العمل`,
      date: today,
      user: actingUser,
      status: 'completed',
      type: 'step_added',
    }
    const now = new Date().toISOString()
    // Optimistic append.
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: [...existingSteps, newStep],
        timeline: [...(c.timeline ?? []), event],
        updatedAt: now,
      })),
    )

    try {
      const row = await api.post<WorkflowStepApiRow>(
        `/circulars/${circularId}/workflow/steps`,
        {
          phase,
          label: newStep.label,
          label_ar: newStep.labelAr,
          action_label: newStep.actionLabel,
          action_label_ar: newStep.actionLabelAr,
          action_type: newStep.actionType,
          requires_notes: newStep.requiresNotes,
          sort_order: existingSteps.length,
        },
      )
      const real = mapWorkflowStepRow(row)
      // Swap temp row for server row.
      set((state) =>
        applyCircular(state, circularId, (c) => ({
          ...c,
          workflowSteps: (c.workflowSteps ?? []).map((s) => (s.id === tempId ? real : s)),
        })),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to add workflow step') })
      throw e
    }
  },

  renameWorkflowStep: async (circularId, stepIndex, newLabel, actingUser) => {
    const snapshot = get().byId[circularId]
    const circular = snapshot
    if (!circular) return
    const steps = circular.workflowSteps ?? []
    if (stepIndex < 0 || stepIndex >= steps.length) return
    const step = steps[stepIndex]
    if (step.status === 'completed') return
    const trimmed = newLabel.trim()
    if (!trimmed || trimmed === step.label) return
    const previous = step.label
    const newSteps = steps.map((s, i) =>
      i === stepIndex ? { ...s, label: trimmed, labelAr: trimmed } : s,
    )
    const today = new Date().toISOString().split('T')[0]
    const event: CircularTimelineEvent = {
      id: nanoid(),
      title: `Step renamed from "${previous}" to "${trimmed}"`,
      titleAr: `تمت إعادة تسمية الخطوة من "${previous}" إلى "${trimmed}"`,
      textEn: `Step renamed from "${previous}" to "${trimmed}"`,
      textAr: `تمت إعادة تسمية الخطوة من "${previous}" إلى "${trimmed}"`,
      date: today,
      user: actingUser,
      status: 'completed',
      type: 'step_renamed',
    }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: newSteps,
        timeline: [...(c.timeline ?? []), event],
        updatedAt: now,
      })),
    )

    if (step.id.startsWith('temp-')) return

    try {
      await api.patch(`/circulars/${circularId}/workflow/steps/${step.id}`, {
        label: trimmed,
        label_ar: trimmed,
      })
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to rename workflow step') })
      throw e
    }
  },

  removeWorkflowStep: async (circularId, stepIndex, actingUser) => {
    const snapshot = get().byId[circularId]
    const circular = snapshot
    if (!circular) return
    const steps = circular.workflowSteps ?? []
    if (stepIndex < 0 || stepIndex >= steps.length) return
    const step = steps[stepIndex]
    if (step.status === 'completed') return
    const removed = step.label
    const removedId = step.id
    const filtered = steps.filter((_, i) => i !== stepIndex)
    let foundCurrent = false
    const restated = filtered.map((s) => {
      if (s.status === 'completed') return s
      if (!foundCurrent) {
        foundCurrent = true
        return { ...s, status: 'current' as const }
      }
      return { ...s, status: 'pending' as const }
    })
    const today = new Date().toISOString().split('T')[0]
    const event: CircularTimelineEvent = {
      id: nanoid(),
      title: `Workflow step "${removed}" removed`,
      titleAr: `تم حذف الخطوة "${removed}" من مسار العمل`,
      textEn: `Workflow step "${removed}" removed`,
      textAr: `تم حذف الخطوة "${removed}" من مسار العمل`,
      date: today,
      user: actingUser,
      status: 'completed',
      type: 'step_removed',
    }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: restated,
        timeline: [...(c.timeline ?? []), event],
        updatedAt: now,
      })),
    )

    if (removedId.startsWith('temp-')) return

    try {
      await api.delete(`/circulars/${circularId}/workflow/steps/${removedId}`)
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to remove workflow step') })
      throw e
    }
  },

  reorderWorkflowSteps: async (circularId, fromIndex, toIndex, actingUser) => {
    if (fromIndex === toIndex) return
    const snapshot = get().byId[circularId]
    const circular = snapshot
    if (!circular) return
    const steps = circular.workflowSteps ?? []
    if (fromIndex < 0 || fromIndex >= steps.length) return
    if (toIndex < 0 || toIndex >= steps.length) return
    const moved = steps[fromIndex]
    if (moved.status === 'completed') return
    if (steps[toIndex].status === 'completed') return
    const next = [...steps]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    let foundCurrent = false
    const restated = next.map((s) => {
      if (s.status === 'completed') return s
      if (!foundCurrent) {
        foundCurrent = true
        return { ...s, status: 'current' as const }
      }
      return { ...s, status: 'pending' as const }
    })
    const today = new Date().toISOString().split('T')[0]
    const event: CircularTimelineEvent = {
      id: nanoid(),
      title: `Workflow steps reordered`,
      titleAr: `تمت إعادة ترتيب خطوات مسار العمل`,
      textEn: `Workflow steps reordered`,
      textAr: `تمت إعادة ترتيب خطوات مسار العمل`,
      date: today,
      user: actingUser,
      status: 'completed',
      type: 'steps_reordered',
    }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: restated,
        timeline: [...(c.timeline ?? []), event],
        updatedAt: now,
      })),
    )

    const reorderItems = restated
      .filter((s) => !s.id.startsWith('temp-'))
      .map((s, idx) => ({ id: s.id, sort_order: idx }))
    if (reorderItems.length === 0) return

    try {
      await api.post(`/circulars/${circularId}/workflow/steps/reorder`, {
        items: reorderItems,
      })
    } catch (e) {
      if (snapshot) {
        set((state) => ({
          circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
          byId: { ...state.byId, [circularId]: snapshot },
          selectedCircular:
            state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
        }))
      }
      set({ error: errorMessage(e, 'Failed to reorder workflow steps') })
      throw e
    }
  },

  requestCircularEdit: async (circularId, editData) => {
    // Per HANDOFF §11 Wave 3 #5 the multi-stage approval workflow is deferred;
    // route edits straight through to PATCH so they actually persist.
    await get().update(circularId, editData)
  },

  approveCircularEditStep: (circularId, approvalId, notes) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) =>
      applyCircular(state, circularId, (c) => {
        if (!c.pendingEdit) return c
        const updatedApprovals = c.pendingEdit.approvals.map((ap) =>
          ap.id === approvalId
            ? {
                ...ap,
                status: 'approved' as const,
                date: today,
                user: 'Current User',
                notes,
              }
            : ap,
        )
        const allApproved = updatedApprovals.every((ap) => ap.status === 'approved')
        if (allApproved) {
          const nextVersion = (c.versions?.length ?? 0) + 1
          const newVersion: CircularVersionEntry = {
            version: nextVersion,
            date: today,
            author: 'Current User',
            changes: 'Edit approved and applied',
            fieldChanges: c.pendingEdit?.fieldChanges,
            approved: true,
          }
          const approvedEvent: CircularTimelineEvent = {
            id: nanoid(),
            title: 'Edit Approved',
            titleAr: 'تمت الموافقة على التعديل',
            date: today,
            user: 'Current User',
            status: 'completed',
          }
          return {
            ...c,
            ...c.pendingEdit.data,
            pendingEdit: undefined,
            versions: [...(c.versions ?? []), newVersion],
            timeline: [...(c.timeline ?? []), approvedEvent],
            updatedAt: now,
          }
        }
        const approvedEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: 'Edit Approved',
          titleAr: 'تمت الموافقة على التعديل',
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        return {
          ...c,
          pendingEdit: { ...c.pendingEdit, approvals: updatedApprovals },
          timeline: [...(c.timeline ?? []), approvedEvent],
          updatedAt: now,
        }
      }),
    )
  },

  rejectCircularEditStep: (circularId, approvalId, notes) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) =>
      applyCircular(state, circularId, (c) => {
        if (!c.pendingEdit) return c
        const updatedApprovals = c.pendingEdit.approvals.map((ap) =>
          ap.id === approvalId
            ? {
                ...ap,
                status: 'rejected' as const,
                date: today,
                user: 'Current User',
                notes,
              }
            : ap,
        )
        const rejectedEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: 'Edit Rejected',
          titleAr: 'تم رفض التعديل',
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        return {
          ...c,
          pendingEdit: {
            ...c.pendingEdit,
            status: 'rejected' as const,
            approvals: updatedApprovals,
          },
          timeline: [...(c.timeline ?? []), rejectedEvent],
          updatedAt: now,
        }
      }),
    )
  },

  addCAPAttachment: (circularId, file) => {
    const now = new Date().toISOString()
    const attachment: Attachment = {
      id: nanoid(),
      name: file.name,
      url: file.dataUrl ?? '',
      dataUrl: file.dataUrl,
      type: file.type ?? 'application/pdf',
      size: file.size ?? 0,
      uploadedAt: now,
      uploadedBy: 'Current User',
    }
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        capAttachments: [...(c.capAttachments ?? []), attachment],
        updatedAt: now,
      })),
    )
  },

  addRemediationAttachment: (circularId, file) => {
    const now = new Date().toISOString()
    const attachment: Attachment = {
      id: nanoid(),
      name: file.name,
      url: file.dataUrl ?? '',
      dataUrl: file.dataUrl,
      type: file.type ?? 'application/pdf',
      size: file.size ?? 0,
      uploadedAt: now,
      uploadedBy: 'Current User',
    }
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        remediationAttachments: [...(c.remediationAttachments ?? []), attachment],
        updatedAt: now,
      })),
    )
  },

  removeCAPAttachment: (circularId, attachmentId) => {
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        capAttachments: (c.capAttachments ?? []).filter((a) => a.id !== attachmentId),
        updatedAt: now,
      })),
    )
  },

  removeRemediationAttachment: (circularId, attachmentId) => {
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        remediationAttachments: (c.remediationAttachments ?? []).filter(
          (a) => a.id !== attachmentId,
        ),
        updatedAt: now,
      })),
    )
  },

  addTimelineEvent: (circularId, event) => {
    const newEvent: CircularTimelineEvent = { ...event, id: nanoid() }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        timeline: [...(c.timeline ?? []), newEvent],
        updatedAt: now,
      })),
    )
  },
}))

// Suppress "unused" lint for the CircularPendingEdit type while the approval
// workflow is deferred (still referenced by other modules / future wiring).
export type { CircularPendingEdit }
