// Circulars store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: /api/circulars (GET list, POST create),
//            /api/circulars/[circularId] (GET detail, PATCH, DELETE).
//
// Reference numbers (e.g. SAMA-2026-001) are server-generated on POST.
//
// Article CRUD, workflow steps, attachments, timeline events, edit-approval
// workflow and PDF tracking all stay local-only for now — Phase 4 only
// shipped the top-level circular CRUD plus a workflow-advance route, and the
// existing UI surfaces (articles, attachments, edit-approval) lean heavily on
// in-memory state. A follow-up phase wires those to the corresponding
// `/api/circulars/[circularId]/...` sub-routes (`/implementations`,
// `/timeline`, `/workflow/advance`, etc.). Local-only actions are tagged with
// a TODO comment and mutate `byId` / `circulars` so the UI continues to
// respond.
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
    articles: previous?.articles ?? [],
    description: row.description ?? previous?.description ?? undefined,
    pdfUrl: row.pdf_url ?? previous?.pdfUrl ?? undefined,
    workflowSteps: previous?.workflowSteps ?? buildInitialWorkflowSteps(),
    timeline: previous?.timeline ?? [],
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
  if (patch.pdfUrl !== undefined) out.pdf_url = patch.pdfUrl || undefined
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
  fetchAll: () => Promise<void>
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

  // Local-only sub-resource mutations (Phase 4 backend not yet shipped).
  assignBusinessOwner: (id: string, dept: string) => void
  setPdfUrl: (circularId: string, dataUrl: string) => void
  clearPdfUrl: (circularId: string) => void

  addArticle: (circularId: string, article: Omit<CircularArticle, 'id'>) => void
  updateArticle: (circularId: string, articleId: string, data: Partial<CircularArticle>) => void
  deleteArticle: (circularId: string, articleId: string) => void
  toggleChecklistItem: (circularId: string, articleId: string, itemId: string) => void
  addChecklistItem: (circularId: string, articleId: string, title: string) => void
  deleteChecklistItem: (circularId: string, articleId: string, itemId: string) => void
  addArticleTimelineEvent: (
    circularId: string,
    articleId: string,
    event: Omit<ArticleTimelineEvent, 'id'>,
  ) => void

  advanceWorkflowStep: (circularId: string, stepId: string, notes?: string) => void
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
  ) => void
  renameWorkflowStep: (
    circularId: string,
    stepIndex: number,
    newLabel: string,
    actingUser: string,
  ) => void
  removeWorkflowStep: (circularId: string, stepIndex: number, actingUser: string) => void
  reorderWorkflowSteps: (
    circularId: string,
    fromIndex: number,
    toIndex: number,
    actingUser: string,
  ) => void

  requestCircularEdit: (circularId: string, editData: Partial<Circular>) => void
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

export const useCircularStore = create<CircularState>()((set, get) => ({
  circulars: [],
  byId: {},
  selectedCircular: null,
  filters: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
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
      set((state) => ({
        circulars: [created, ...state.circulars],
        byId: { ...state.byId, [created.id]: created },
        isMutating: false,
      }))
      void get().fetchAll()
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

  // ── Local-only mutations (backend not yet shipped) ──────────────────────

  assignBusinessOwner: (id, dept) => {
    const now = new Date().toISOString()
    set((state) => ({
      circulars: state.circulars.map((c) =>
        c.id === id ? { ...c, businessOwnerDepartment: dept, updatedAt: now } : c,
      ),
      byId: state.byId[id]
        ? {
            ...state.byId,
            [id]: { ...state.byId[id], businessOwnerDepartment: dept, updatedAt: now },
          }
        : state.byId,
      selectedCircular:
        state.selectedCircular?.id === id
          ? { ...state.selectedCircular, businessOwnerDepartment: dept, updatedAt: now }
          : state.selectedCircular,
    }))
  },

  setPdfUrl: (circularId, dataUrl) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newEvent: CircularTimelineEvent = {
      id: nanoid(),
      title: 'PDF Uploaded',
      titleAr: 'تم رفع ملف PDF',
      date: today,
      user: 'Current User',
      status: 'completed',
    }
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? { ...c, pdfUrl: dataUrl, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
          : c,
      )
      return {
        circulars,
        byId: state.byId[circularId]
          ? { ...state.byId, [circularId]: circulars.find((c) => c.id === circularId)! }
          : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  clearPdfUrl: (circularId) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newEvent: CircularTimelineEvent = {
      id: nanoid(),
      title: 'PDF Removed',
      titleAr: 'تم حذف ملف PDF',
      date: today,
      user: 'Current User',
      status: 'completed',
    }
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? { ...c, pdfUrl: undefined, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
          : c,
      )
      return {
        circulars,
        byId: state.byId[circularId]
          ? { ...state.byId, [circularId]: circulars.find((c) => c.id === circularId)! }
          : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  addArticle: (circularId, article) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newArticle: CircularArticle = {
      ...article,
      id: crypto.randomUUID(),
      versions: [
        {
          version: 1,
          date: today,
          author: 'Current User',
          summary: 'Article created',
          fieldChanges: {},
          approved: true,
        },
      ],
      timeline: [
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
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        const updated = { ...c, articles: [...c.articles, newArticle], updatedAt: now }
        return { ...updated, progress: recalcProgress(updated) }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  updateArticle: (circularId, articleId, updates) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
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
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  deleteArticle: (circularId, articleId) => {
    const now = new Date().toISOString()
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        const updated = {
          ...c,
          articles: c.articles.filter((a) => a.id !== articleId),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  toggleChecklistItem: (circularId, articleId, itemId) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        const updated = {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const item = a.checklist.find((i) => i.id === itemId)
            const newCompleted = item ? !item.completed : false
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
                i.id === itemId ? { ...i, completed: !i.completed } : i,
              ),
              timeline: [...(a.timeline ?? []), newEvent],
            }
          }),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  addChecklistItem: (circularId, articleId, title) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
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
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        return {
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
        }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  deleteChecklistItem: (circularId, articleId, itemId) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        const updated = {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const item = a.checklist.find((i) => i.id === itemId)
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
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  addArticleTimelineEvent: (circularId, articleId, event) => {
    const now = new Date().toISOString()
    const newEvent: ArticleTimelineEvent = { id: nanoid(), ...event }
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        return {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            return { ...a, timeline: [...(a.timeline ?? []), newEvent] }
          }),
          updatedAt: now,
        }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  advanceWorkflowStep: (circularId, stepId, notes) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
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
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              workflowSteps: newSteps,
              timeline: [...(c.timeline ?? []), event],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
    return { ok: true }
  },

  addWorkflowStep: (circularId, payload, actingUser) => {
    const circular = get().circulars.find((c) => c.id === circularId)
    if (!circular) return
    const existingSteps = circular.workflowSteps ?? buildInitialWorkflowSteps()
    const currentStep = existingSteps.find((s) => s.status === 'current')
    const phase = (payload.phase ?? currentStep?.phase ?? 2) as 0 | 1 | 2
    const newStep: CircularWorkflowStep = {
      id: nanoid(),
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              workflowSteps: [...existingSteps, newStep],
              timeline: [...(c.timeline ?? []), event],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  renameWorkflowStep: (circularId, stepIndex, newLabel, actingUser) => {
    const circular = get().circulars.find((c) => c.id === circularId)
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              workflowSteps: newSteps,
              timeline: [...(c.timeline ?? []), event],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  removeWorkflowStep: (circularId, stepIndex, actingUser) => {
    const circular = get().circulars.find((c) => c.id === circularId)
    if (!circular) return
    const steps = circular.workflowSteps ?? []
    if (stepIndex < 0 || stepIndex >= steps.length) return
    const step = steps[stepIndex]
    if (step.status === 'completed') return
    const removed = step.label
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              workflowSteps: restated,
              timeline: [...(c.timeline ?? []), event],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  reorderWorkflowSteps: (circularId, fromIndex, toIndex, actingUser) => {
    if (fromIndex === toIndex) return
    const circular = get().circulars.find((c) => c.id === circularId)
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              workflowSteps: restated,
              timeline: [...(c.timeline ?? []), event],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  requestCircularEdit: (circularId, editData) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const currentCircular = get().circulars.find((c) => c.id === circularId)
    const fieldChanges: Record<string, { from: string; to: string }> = {}
    if (currentCircular) {
      const scalarFields = [
        'title', 'authority', 'priority', 'issuanceDate', 'dueDate',
        'capDeadline', 'description', 'businessOwnerDepartment', 'referenceUrl',
      ] as const
      for (const field of scalarFields) {
        const from = String(currentCircular[field] ?? '')
        const to = String(
          (editData as Record<string, unknown>)[field] ??
            currentCircular[field] ??
            '',
        )
        if (from !== to) fieldChanges[field] = { from, to }
      }
      const fromDepts = (currentCircular.departments ?? []).join(', ')
      const toDepts = (editData.departments ?? currentCircular.departments ?? []).join(', ')
      if (fromDepts !== toDepts) fieldChanges['departments'] = { from: fromDepts, to: toDepts }
    }
    const pendingEdit: CircularPendingEdit = {
      data: editData,
      requestedBy: 'Current User',
      requestedAt: now,
      status: 'pending',
      fieldChanges: Object.keys(fieldChanges).length > 0 ? fieldChanges : undefined,
      approvals: [
        { id: nanoid(), role: 'Compliance Officer', roleAr: 'مسؤول الامتثال', status: 'pending' },
        { id: nanoid(), role: 'Compliance Manager', roleAr: 'مدير الامتثال', status: 'pending' },
      ],
    }
    const newEvent: CircularTimelineEvent = {
      id: nanoid(),
      title: 'Edit Submitted for Approval',
      titleAr: 'طلب تعديل للاعتماد',
      date: today,
      user: 'Current User',
      status: 'active',
    }
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
        return {
          ...c,
          pendingEdit,
          timeline: [...(c.timeline ?? []), newEvent],
          updatedAt: now,
        }
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  approveCircularEditStep: (circularId, approvalId, notes) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
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
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  rejectCircularEditStep: (circularId, approvalId, notes) => {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    set((state) => {
      const circulars = state.circulars.map((c) => {
        if (c.id !== circularId) return c
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
      })
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              capAttachments: [...(c.capAttachments ?? []), attachment],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
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
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              remediationAttachments: [...(c.remediationAttachments ?? []), attachment],
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  removeCAPAttachment: (circularId, attachmentId) => {
    const now = new Date().toISOString()
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              capAttachments: (c.capAttachments ?? []).filter((a) => a.id !== attachmentId),
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  removeRemediationAttachment: (circularId, attachmentId) => {
    const now = new Date().toISOString()
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? {
              ...c,
              remediationAttachments: (c.remediationAttachments ?? []).filter(
                (a) => a.id !== attachmentId,
              ),
              updatedAt: now,
            }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },

  addTimelineEvent: (circularId, event) => {
    const newEvent: CircularTimelineEvent = { ...event, id: nanoid() }
    const now = new Date().toISOString()
    set((state) => {
      const circulars = state.circulars.map((c) =>
        c.id === circularId
          ? { ...c, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
          : c,
      )
      const updatedCircular = circulars.find((c) => c.id === circularId)
      return {
        circulars,
        byId: updatedCircular ? { ...state.byId, [circularId]: updatedCircular } : state.byId,
        selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
      }
    })
  },
}))
