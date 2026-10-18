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
import { validateChildDeadline } from '@/lib/workflow/deadline-validation'
import { api, ApiClientError } from '@/lib/api-client'
import { pushToast, type ToastMessage } from '@/stores/toast-store'
import { computeCircularProgress } from '@/lib/workflow/progress-formula'
import { optimisticMutation, isPermissionDenied } from '@/lib/optimistic'

// Wave-19.4 / Item-3 — the synthetic "Initial registration" entry shown when a
// freshly-created circular has no real `circular_versions` rows yet. Inlined
// to mirror what the server would emit via `renderBilingual` for the
// `regulatoryUpdates.timeline.initialRegistration` key (dictionaries stay the
// source of truth; this client-only fallback never reaches the DB).
const INITIAL_REGISTRATION_EN = 'Initial registration'
const INITIAL_REGISTRATION_AR = 'التسجيل الأولي'

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
  // Wave-19 / Q3 — persisted `circulars.is_overdue` from migration 055.
  is_overdue?: boolean
  framework_ids: string[] | null
  created_at: string
  updated_at: string
  // List-stamped: server side-query that returns the phase of the row's
  // current workflow step (or null if no current step exists). Lets the row
  // card render the right phase chip before `fetchById` resolves.
  current_phase?: number | null
  // Detail-only:
  workflow_steps?: unknown[]
  implementations?: unknown[]
  timeline?: unknown[]
  timeline_has_more?: boolean
  cap_attachments?: unknown[]
  remediation_attachments?: unknown[]
  pdf_attachments?: unknown[]
  versions?: unknown[]
  // W15-5: detail-GET version-history pagination flag.
  versions_has_more?: boolean
}

// GAP-19 + Wave-19.4 / Item-3: circular_versions row shape from the API.
// Dual-store columns `text_en` + `text_ar` (migration 057).
interface CircularVersionApiRow {
  id: string
  circular_id?: string
  version: number
  date: string
  author: string
  text_en: string
  text_ar: string
  field_changes?: { field: string; from: string; to: string }[] | null
  approved: boolean
}

// GAP-1: CAP / remediation attachment row shape from the API.
interface CircularAttachmentApiRow {
  id: string
  circular_id: string
  name: string
  storage_path: string
  type: string | null
  size: number | null
  uploaded_at: string
  uploaded_by: string | null
  // W17-1 / SEC-1: optimistic-locking token from the server.
  updated_at?: string
}

interface ArticleChecklistApiRow {
  id: string
  article_id?: string
  text: string
  completed: boolean
  sort_order: number
  // Task D / #32: per-item deadline (DATE column).
  deadline?: string | null
  // W17-1 / SEC-1: optimistic-locking token from the server.
  updated_at?: string
}

interface ArticleTimelineApiRow {
  id: string
  article_id?: string
  // Wave-19.1 / Q8 — dual-store columns (migration 056).
  text_en: string
  text_ar: string
  date: string
  user_name?: string | null
  status?: string | null
}

interface ArticleVersionApiRow {
  id: string
  article_id?: string
  version_no: number
  date: string
  author: string
  // Wave-19.4 / Item-3 — dual-store columns (migration 057).
  text_en: string
  text_ar: string
  // GAP-13: structured per-field diff. NULL for pre-migration (Wave-9) rows.
  field_changes?: { field: string; from: string; to: string }[] | null
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
  // W17-1 / SEC-1: optimistic-locking token from the server.
  updated_at?: string
  // Detail-endpoint nested children (`/api/circulars/[id]` aliases these via
  // `checklist:article_checklist_items(...)`, `timeline:article_timeline(...)`,
  // `versions:article_versions(...)`).
  checklist?: ArticleChecklistApiRow[]
  timeline?: ArticleTimelineApiRow[]
  versions?: ArticleVersionApiRow[]
  // W15-5: per-article first-page pagination flags from the detail GET.
  timeline_has_more?: boolean
  versions_has_more?: boolean
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
  assigned_to?: string | null
  // W17-1 / SEC-1: optimistic-locking token from the server.
  updated_at?: string
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
  // FORENSIC §5 / Task-B: the GAP-16 dynamic 50/50 formula now lives in ONE
  // shared module (`src/lib/workflow/progress-formula.ts`) imported by both this client
  // store and the server's `recomputeCircularProgress` — it can no longer
  // drift between layers. This function just gathers the four counts.
  const steps = c.workflowSteps ?? []
  const stepsTotal = steps.length
  const stepsDone = steps.filter((s) => s.status === 'completed').length

  let checklistTotal = 0
  let checklistDone = 0
  for (const art of c.articles ?? []) {
    for (const item of art.checklist ?? []) {
      checklistTotal += 1
      if (item.completed) checklistDone += 1
    }
  }

  return computeCircularProgress({ stepsTotal, stepsDone, checklistTotal, checklistDone })
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
  // True when the row carries the detail-endpoint's nested children. Used by
  // the UI to gate skeleton placeholders — falling back to a stale `previous`
  // is fine, but never start fresh with the static client default and pretend
  // detail is ready.
  const hasDetailPayload =
    Array.isArray(row.workflow_steps) && row.workflow_steps.length > 0
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
    currentPhase:
      typeof row.current_phase === 'number'
        ? (row.current_phase as 0 | 1 | 2)
        : previous?.currentPhase,
    detailHydrated: hasDetailPayload || previous?.detailHydrated || false,
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
      ? row.implementations.map((r) => {
          const apiRow = r as ImplementationApiRow
          const prevArticle = previous?.articles?.find((a) => a.id === apiRow.id)
          return mapImplementationRow(apiRow, prevArticle)
        })
      : previous?.articles ?? [],
    description: row.description ?? previous?.description ?? undefined,
    pdfUrl: row.pdf_url ?? previous?.pdfUrl ?? undefined,
    // When list response carries no workflow_steps AND no prior detail-loaded
    // copy exists, leave an empty array so skeleton placeholders render. Once
    // fetchById resolves, we fall through to the mapWorkflowStepRow branch.
    workflowSteps: hasDetailPayload
      ? (row.workflow_steps as WorkflowStepApiRow[]).map(mapWorkflowStepRow)
      : previous?.workflowSteps ?? [],
    timeline: Array.isArray(row.timeline)
      ? [...row.timeline]
          .map(mapTimelineRow)
          .sort((a, b) => {
            const ta = a.date ? Date.parse(a.date) : 0
            const tb = b.date ? Date.parse(b.date) : 0
            return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
          })
      : previous?.timeline ?? [],
    // GAP-19: surface the nested `circular_versions` array (detail GET) so the
    // circular Version History tab renders persisted edit history. Sort
    // ascending by version. When the detail GET carries an empty array the
    // circular genuinely has no version rows yet — synthesise the "Initial
    // registration" entry so the tab is never blank. List responses (no
    // `versions` key) keep any previously hydrated rows.
    versions: Array.isArray(row.versions)
      ? (() => {
          const mapped = (row.versions as CircularVersionApiRow[])
            .map(mapCircularVersionRow)
            .sort((a, b) => a.version - b.version)
          return mapped.length > 0
            ? mapped
            : [
                {
                  version: 1,
                  date: row.created_at.slice(0, 10),
                  author: 'System',
                  textEn: INITIAL_REGISTRATION_EN,
                  textAr: INITIAL_REGISTRATION_AR,
                  fieldChanges: [],
                  approved: true,
                },
              ]
        })()
      : previous?.versions ?? [
          {
            version: 1,
            date: row.created_at.slice(0, 10),
            author: 'System',
            textEn: INITIAL_REGISTRATION_EN,
            textAr: INITIAL_REGISTRATION_AR,
            fieldChanges: [],
            approved: true,
          },
        ],
    // GAP-1: persisted CAP / remediation attachments from the detail GET.
    // When the row is a list response (no attachment arrays) keep the prior
    // hydrated value rather than wiping to [].
    capAttachments: Array.isArray(row.cap_attachments)
      ? (row.cap_attachments as CircularAttachmentApiRow[]).map(mapAttachmentRow)
      : previous?.capAttachments ?? [],
    capResponseDeadline: row.cap_response_deadline ?? previous?.capResponseDeadline ?? undefined,
    remediationAttachments: Array.isArray(row.remediation_attachments)
      ? (row.remediation_attachments as CircularAttachmentApiRow[]).map(mapAttachmentRow)
      : previous?.remediationAttachments ?? [],
    // GAP-21: persisted multi-file circular PDF attachments.
    pdfAttachments: Array.isArray(row.pdf_attachments)
      ? (row.pdf_attachments as CircularAttachmentApiRow[]).map(mapAttachmentRow)
      : previous?.pdfAttachments ?? [],
    capDeadline: row.cap_deadline ?? previous?.capDeadline ?? undefined,
    remediationDeadline: row.remediation_deadline ?? previous?.remediationDeadline ?? undefined,
    referenceUrl: row.reference_url ?? previous?.referenceUrl ?? undefined,
    pendingEdit: previous?.pendingEdit,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
    // Wave-19 / Q3 — persisted `circulars.is_overdue` from migration 055.
    isOverdue: row.is_overdue ?? previous?.isOverdue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapArticleChecklistRow(row: ArticleChecklistApiRow): ChecklistItem {
  return {
    id: row.id,
    title: row.text,
    completed: !!row.completed,
    order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    // Task D / #32: per-item deadline.
    deadline: row.deadline ?? undefined,
    // W17-1 / SEC-1: server-stamped optimistic-locking token threaded to PATCH/DELETE.
    updatedAt: row.updated_at,
  }
}

function mapArticleTimelineRow(row: ArticleTimelineApiRow): ArticleTimelineEvent {
  // Wave-19.1 / Q8 — server stores both languages in `text_en` / `text_ar`.
  // `title` stays populated with the English string for backward-compatible
  // consumers (snapshots, optimistic placeholders); the renderer picks the
  // locale column directly.
  return {
    id: row.id,
    title: row.text_en ?? '',
    textEn: row.text_en ?? '',
    textAr: row.text_ar ?? '',
    date: row.date,
    user: row.user_name ?? undefined,
    status: (row.status as ArticleTimelineEvent['status']) ?? 'completed',
  }
}

// GAP-11/GAP-13: nested `article_versions` row → client `ArticleVersionEntry`.
// `changes` maps to `summary`; `field_changes` (jsonb) maps to the structured
// `fieldChanges` array which the Version History tab renders as a Field /
// From / To table. Pre-migration (Wave-9) rows have a NULL `field_changes` →
// an empty array, which makes the tab fall back to the `summary` text.
function mapArticleVersionRow(row: ArticleVersionApiRow): ArticleVersionEntry {
  return {
    version: row.version_no,
    date: row.date,
    author: row.author,
    // Wave-19.4 / Item-3 — dual-store. Reader picks per-locale at render time.
    textEn: row.text_en ?? '',
    textAr: row.text_ar ?? '',
    fieldChanges: Array.isArray(row.field_changes) ? row.field_changes : [],
    approved: true,
  }
}

// GAP-19: nested `circular_versions` row → client `CircularVersionEntry`.
// Wave-19.4 / Item-3 — dual-store `text_en` + `text_ar`; `field_changes`
// (jsonb) maps to the structured `fieldChanges` array the shared Version
// History diff renders.
function mapCircularVersionRow(row: CircularVersionApiRow): CircularVersionEntry {
  return {
    version: row.version,
    date: row.date,
    author: row.author,
    textEn: row.text_en ?? '',
    textAr: row.text_ar ?? '',
    fieldChanges: Array.isArray(row.field_changes) ? row.field_changes : [],
    approved: !!row.approved,
  }
}

function mapImplementationRow(row: ImplementationApiRow, previous?: CircularArticle): CircularArticle {
  // HANI-1: the detail endpoint nests `checklist` + `timeline` arrays on each
  // implementation row. Map them onto the client `Article` (snake_case →
  // camelCase). Resilient: if the nested array is absent (e.g. a row coming
  // back from a sub-resource PATCH that doesn't re-select children), keep any
  // previously hydrated rows rather than wiping to [].
  const checklist = Array.isArray(row.checklist)
    ? [...row.checklist]
        .map(mapArticleChecklistRow)
        .sort((a, b) => a.order - b.order)
    : previous?.checklist ?? []
  // GAP-15: article timeline is sorted NEWEST-FIRST so the Activity tab can
  // render it in array order (newest-at-top); Load More appends older rows.
  const timeline = Array.isArray(row.timeline)
    ? [...row.timeline]
        .map(mapArticleTimelineRow)
        .sort((a, b) => {
          const ta = a.date ? Date.parse(a.date) : 0
          const tb = b.date ? Date.parse(b.date) : 0
          return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
        })
    : previous?.timeline
  // GAP-11 / GAP-17: surface the nested `article_versions` array (detail GET)
  // so the Article Version History tab renders persisted edit history. The
  // detail GET embeds `versions:article_versions(...)` — when that array is
  // present (even empty) it is authoritative. ONLY when the key is entirely
  // absent (a sub-resource PATCH response that doesn't re-select children) do
  // we keep previously hydrated rows, so a hard reload never wipes the tab.
  const versions = Array.isArray(row.versions)
    ? [...row.versions]
        .map(mapArticleVersionRow)
        .sort((a, b) => a.version - b.version)
    : previous?.versions ?? []
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
    checklist,
    attachments: previous?.attachments ?? [],
    versions,
    timeline,
    // W17-1 / SEC-1: server `updated_at` — emitted as `If-Match` on PATCH/DELETE.
    updatedAt: row.updated_at ?? previous?.updatedAt,
  }
}

function mapTimelineRow(row: unknown): CircularTimelineEvent {
  // Wave-19.1 / Q8 — dual-store `text_en` / `text_ar` columns. `title` is
  // kept in sync with the English string so any legacy consumer reading the
  // `title` field continues to work; the actual renderer picks the locale
  // column directly via `event.textEn` / `event.textAr`.
  const r = row as {
    id: string
    text_en?: string | null
    text_ar?: string | null
    date: string
    user_name?: string | null
    status?: string | null
  }
  return {
    id: r.id,
    title: r.text_en ?? '',
    textEn: r.text_en ?? '',
    textAr: r.text_ar ?? '',
    date: r.date,
    user: r.user_name ?? undefined,
    status: (r.status as CircularTimelineEvent['status']) ?? 'completed',
  }
}

// GAP-1: snake_case attachment row → client `Attachment`. `storage_path`
// holds a base64 data URL, mapped to both `url` and `dataUrl` so the existing
// download button works unchanged.
function mapAttachmentRow(row: CircularAttachmentApiRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    url: row.storage_path,
    dataUrl: row.storage_path,
    type: row.type ?? 'application/octet-stream',
    size: row.size ?? 0,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by ?? '',
    // W17-1 / SEC-1: optimistic-locking token threaded to attachment DELETE.
    updatedAt: row.updated_at,
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
    assignedTo: row.assigned_to ?? undefined,
    // W17-1 / SEC-1: optimistic-locking token threaded to workflow-step PATCH/DELETE.
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
  // GAP-3: a clearable optional field the user emptied must be sent as an
  // explicit `null` so the PATCH route NULLs the DB column. Sending `undefined`
  // (omit) leaves the stale value; sending `""` fails the schema's `min(1)`.
  // Only fields actually present on `patch` are sent — untouched fields stay
  // absent. `|| null` collapses empty-string → null for clearable fields.
  const out: Record<string, unknown> = {}
  if (patch.authority !== undefined) out.authority = patch.authority
  if (patch.title !== undefined) out.title = patch.title
  if (patch.priority !== undefined) out.priority = patch.priority
  if (patch.status !== undefined) out.status = patch.status
  if (patch.applicability !== undefined) out.applicability = patch.applicability
  if (patch.departments !== undefined) out.departments = patch.departments
  if (patch.businessOwnerDepartment !== undefined)
    out.business_owner_department = patch.businessOwnerDepartment || null
  if (patch.assignedTo !== undefined) out.assigned_to = patch.assignedTo || null
  if (patch.progress !== undefined) out.progress = patch.progress
  if (patch.issuanceDate !== undefined) out.issuance_date = patch.issuanceDate
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate
  if (patch.capStatus !== undefined) out.cap_status = patch.capStatus
  if (patch.capDueDate !== undefined) out.cap_due_date = patch.capDueDate || null
  if (patch.capDeadline !== undefined) out.cap_deadline = patch.capDeadline || null
  if (patch.capResponseDeadline !== undefined)
    out.cap_response_deadline = patch.capResponseDeadline || null
  if (patch.remediationDeadline !== undefined)
    out.remediation_deadline = patch.remediationDeadline || null
  if (patch.description !== undefined) out.description = patch.description || null
  if (patch.pdfUrl !== undefined) out.pdf_url = patch.pdfUrl || null
  if (patch.referenceUrl !== undefined) out.reference_url = patch.referenceUrl || null
  if (patch.frameworkIds !== undefined) out.framework_ids = patch.frameworkIds
  return out
}

// GAP-20: a child mutation (checklist toggle/delete) must never PATCH a
// non-persisted id. A persisted row always has a real Postgres UUID; an
// optimistic/temp row has a `temp-…` id OR (legacy) a short client random id.
// `isPersistedId` returns true ONLY for a canonical UUID, so any client-side
// placeholder — `temp-…` or `Math.random().toString(36)` — is treated as
// not-yet-persisted and the server call is skipped until the row reconciles.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isPersistedId(id: string): boolean {
  return UUID_RE.test(id)
}

// W17-1 / SEC-1: build an `If-Match: W/"<updatedAt>"` header object when the
// child entity carries an `updatedAt` token. Returned `undefined` keeps the
// request backward-compatible with rows hydrated before the column existed —
// the server will accept the write rather than 412 in that case.
function ifMatchHeader(updatedAt: string | undefined): Record<string, string> | undefined {
  if (!updatedAt) return undefined
  return { 'If-Match': `W/"${updatedAt}"` }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// GAP-14 / RTL-8: friendly toast copy for a reverted optimistic mutation. The
// store lives outside React and has no `t()`, so `revertMessage` returns a
// `{key,params}` translation spec — `<ToastHost />` translates it at render
// time. For validation-style errors a short, clean server reason is passed as
// the `{{reason}}` param; network / unknown errors omit it.
function revertMessage(e: unknown): ToastMessage {
  if (e instanceof ApiClientError) {
    // SEC-1: an optimistic-concurrency conflict (412) — someone else changed
    // the record. Show a dedicated, actionable conflict toast instead of the
    // generic "didn't register" copy.
    if (e.status === 412 || e.code === 'precondition_failed') {
      return { key: 'regulatoryUpdates.optimisticConflict' }
    }
    // Validation errors carry a human-readable, short reason worth showing.
    // Skip auth/network/server codes whose messages are not user-friendly.
    const showable =
      e.code === 'validation_error' ||
      e.code === 'validation_failed' ||
      e.code === 'bad_request' ||
      e.code === 'conflict'
    if (showable && e.message && e.message.length < 120) {
      return {
        key: 'regulatoryUpdates.optimisticRevertWithReason',
        params: { reason: e.message },
      }
    }
  }
  return { key: 'regulatoryUpdates.optimisticRevert' }
}

// ---------- store ----------------------------------------------------------

// GAP-15: per-list timeline pagination state. `offset` is the count of rows
// already loaded; `hasMore` gates the Load More button; `loadingMore` drives
// the on-button spinner. Keyed by circularId (circular timeline) and by
// `${circularId}:${articleId}` (article timeline).
export interface TimelinePagination {
  offset: number
  hasMore: boolean
  loadingMore: boolean
}

// Wave-19.6 — the W15-2 single-shot `lastStepMutation` ephemeral undo was
// REMOVED in favour of DB-backed step-by-step Undo + workflow-wide Reset
// driven by `circular_workflow_steps.completed_at` (migration 062). The new
// actions live further down on this store: `undoLastWorkflowStep` /
// `resetWorkflow`. The old `StepMutationUndo` type + 5-minute window + UI
// banner are gone.

interface CircularState {
  circulars: Circular[]
  byId: Record<string, Circular>
  selectedCircular: Circular | null
  filters: CircularFilters

  // GAP-15: timeline pagination — circular timelines keyed by circularId,
  // article timelines keyed by `${circularId}:${articleId}`.
  circularTimelinePagination: Record<string, TimelinePagination>
  articleTimelinePagination: Record<string, TimelinePagination>
  // W15-5: Version History pagination — same shape, same keying scheme.
  circularVersionPagination: Record<string, TimelinePagination>
  articleVersionPagination: Record<string, TimelinePagination>

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
  addChecklistItem: (circularId: string, articleId: string, title: string, deadline?: string) => Promise<void>
  deleteChecklistItem: (circularId: string, articleId: string, itemId: string) => Promise<void>
  // Task D / #32: set/clear a per-item deadline (optimistic + rollback).
  setArticleChecklistItemDeadline: (
    circularId: string,
    articleId: string,
    itemId: string,
    deadline: string | undefined,
  ) => Promise<void>
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
  // Story 11.3: edit a step's notes / assignee / action-type from the inline
  // editor on the Workflow tab.
  updateWorkflowStep: (
    circularId: string,
    stepId: string,
    updates: {
      notes?: string | null
      assignedTo?: string | null
      actionType?: CircularWorkflowStep['actionType']
    },
  ) => Promise<void>
  removeWorkflowStep: (circularId: string, stepIndex: number, actingUser: string) => Promise<void>
  reorderWorkflowSteps: (
    circularId: string,
    fromIndex: number,
    toIndex: number,
    actingUser: string,
  ) => Promise<void>
  // Wave-19.6 — DB-backed undo / reset of the workflow.
  //   `undoLastWorkflowStep` pops the most-recently-completed step back to
  //   'pending' (server-side `ORDER BY completed_at DESC LIMIT 1`).
  //   `resetWorkflow` reverts every step to 'pending' (only valid when 100%
  //   of steps are currently completed).
  undoLastWorkflowStep: (circularId: string) => Promise<void>
  resetWorkflow: (circularId: string) => Promise<void>

  requestCircularEdit: (circularId: string, editData: Partial<Circular>) => Promise<void>
  approveCircularEditStep: (circularId: string, approvalId: string, notes: string) => void
  rejectCircularEditStep: (circularId: string, approvalId: string, notes: string) => void

  // GAP-1: now API-backed (persist to circular_cap_attachments /
  // circular_remediation_attachments). Async so the dropzone can show a
  // loading state for the full request.
  addCAPAttachment: (
    circularId: string,
    file: { name: string; size?: number; dataUrl?: string; type?: string },
  ) => Promise<void>
  addRemediationAttachment: (
    circularId: string,
    file: { name: string; size?: number; dataUrl?: string; type?: string },
  ) => Promise<void>
  removeCAPAttachment: (circularId: string, attachmentId: string) => Promise<void>
  removeRemediationAttachment: (circularId: string, attachmentId: string) => Promise<void>

  addTimelineEvent: (circularId: string, event: Omit<CircularTimelineEvent, 'id'>) => void

  // GAP-15: Activity timeline pagination. `loadMoreTimeline` fetches the next
  // page of the circular timeline; `loadArticleTimeline` loads the first page
  // for an article (lazy, on modal open); `loadMoreArticleTimeline` pages it.
  loadMoreTimeline: (circularId: string) => Promise<void>
  loadArticleTimeline: (circularId: string, articleId: string) => Promise<void>
  loadMoreArticleTimeline: (circularId: string, articleId: string) => Promise<void>

  // W15-5: Version History pagination — `loadMoreCircularVersions` pages the
  // circular detail-modal Version History tab; `loadArticleVersions` lazily
  // loads an article's first version page on modal open; `loadMoreArticleVersions`
  // pages it. Mirrors the timeline pagination actions above.
  loadMoreCircularVersions: (circularId: string) => Promise<void>
  loadArticleVersions: (circularId: string, articleId: string) => Promise<void>
  loadMoreArticleVersions: (circularId: string, articleId: string) => Promise<void>

  // GAP-21: multi-file circular PDF attachments (circular_pdf_attachments).
  addPdfAttachment: (
    circularId: string,
    file: { name: string; size?: number; dataUrl?: string; type?: string },
  ) => Promise<void>
  removePdfAttachment: (circularId: string, attachmentId: string) => Promise<void>
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

// GAP-14: entity-granular revert. `snapshot` is a copy of ONE circular taken
// BEFORE the optimistic mutation; restoring it touches only that circular's
// slot in `circulars` / `byId` / `selectedCircular`, so a concurrent mutation
// on a *different* circular is never clobbered. The circular's own rollups
// (Implementation Progress, workflow status) live inside the snapshot, so
// putting the snapshot back also reverts the rolled-up state in one step.
function restoreCircularState(
  state: CircularState,
  circularId: string,
  snapshot: Circular,
): Pick<CircularState, 'circulars' | 'byId' | 'selectedCircular'> {
  return {
    circulars: state.circulars.map((c) => (c.id === circularId ? snapshot : c)),
    byId: { ...state.byId, [circularId]: snapshot },
    selectedCircular:
      state.selectedCircular?.id === circularId ? snapshot : state.selectedCircular,
  }
}

// GAP-1: shared CAP / remediation attachment persistence. `kind` selects the
// list field + the API `?kind=`. Optimistic-insert a temp row, POST, swap in
// the server row; restore the snapshot on failure.
type StoreSet = (
  partial:
    | CircularState
    | Partial<CircularState>
    | ((state: CircularState) => CircularState | Partial<CircularState>),
) => void
type StoreGet = () => CircularState

type AttachmentKind = 'cap' | 'remediation' | 'pdf'
type AttachmentField = 'capAttachments' | 'remediationAttachments' | 'pdfAttachments'

function attachmentField(kind: AttachmentKind): AttachmentField {
  if (kind === 'cap') return 'capAttachments'
  if (kind === 'pdf') return 'pdfAttachments'
  return 'remediationAttachments'
}

async function uploadCircularAttachment(
  get: StoreGet,
  set: StoreSet,
  circularId: string,
  kind: AttachmentKind,
  file: { name: string; size?: number; dataUrl?: string; type?: string },
): Promise<void> {
  const field = attachmentField(kind)
  const snapshot = get().byId[circularId]
  const tempId = `temp-${nanoid()}`
  const now = new Date().toISOString()
  const optimistic: Attachment = {
    id: tempId,
    name: file.name,
    url: file.dataUrl ?? '',
    dataUrl: file.dataUrl,
    type: file.type ?? 'application/octet-stream',
    size: file.size ?? 0,
    uploadedAt: now,
    uploadedBy: 'Current User',
  }
  set((state) =>
    applyCircular(state, circularId, (c) => ({
      ...c,
      [field]: [optimistic, ...(c[field] ?? [])],
      updatedAt: now,
    })),
  )

  try {
    const row = await api.post<CircularAttachmentApiRow>(
      `/circulars/${circularId}/attachments`,
      {
        kind,
        name: file.name,
        storage_path: file.dataUrl ?? '',
        type: file.type || undefined,
        size: file.size ?? undefined,
      },
    )
    const real = mapAttachmentRow(row)
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        [field]: (c[field] ?? []).map((a) => (a.id === tempId ? real : a)),
      })),
    )
  } catch (e) {
    if (snapshot) {
      set((state) => restoreCircularState(state, circularId, snapshot))
    }
    set({ error: errorMessage(e, 'Failed to upload document') })
    if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
    console.error('[optimistic:uploadCircularAttachment] failed —', e)
    throw e
  }
}

async function deleteCircularAttachment(
  get: StoreGet,
  set: StoreSet,
  circularId: string,
  kind: AttachmentKind,
  attachmentId: string,
): Promise<void> {
  const field = attachmentField(kind)
  const snapshot = get().byId[circularId]
  // W17-1 / SEC-1: capture the attachment's last-known `updatedAt` BEFORE the
  // optimistic remove so the wire DELETE can echo it back as `If-Match`.
  const attachment = snapshot?.[field]?.find((a) => a.id === attachmentId)
  const now = new Date().toISOString()
  set((state) =>
    applyCircular(state, circularId, (c) => ({
      ...c,
      [field]: (c[field] ?? []).filter((a) => a.id !== attachmentId),
      updatedAt: now,
    })),
  )

  // A temp row never reached the server — nothing to delete remotely.
  if (attachmentId.startsWith('temp-')) return

  try {
    await api.delete(
      `/circulars/${circularId}/attachments/${attachmentId}?kind=${kind}`,
      ifMatchHeader(attachment?.updatedAt),
    )
  } catch (e) {
    if (snapshot) {
      set((state) => restoreCircularState(state, circularId, snapshot))
    }
    set({ error: errorMessage(e, 'Failed to remove document') })
    if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
    console.error('[optimistic:deleteCircularAttachment] failed —', e)
    throw e
  }
}

export const useCircularStore = create<CircularState>()((set, get) => ({
  circulars: [],
  byId: {},
  selectedCircular: null,
  filters: {},
  circularTimelinePagination: {},
  articleTimelinePagination: {},
  circularVersionPagination: {},
  articleVersionPagination: {},
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
        // Only refresh the selection if THIS circular is still selected — a
        // late-resolving detail GET must not resurrect the modal of a
        // circular the user has since closed or DELETED (the W38 "details
        // panel of a just-deleted circular reopens" race lived here), nor
        // clobber a newer selection. Mirrors policy-store.fetchById.
        selectedCircular:
          state.selectedCircular?.id === id ? circular : state.selectedCircular,
        // GAP-15: seed the circular timeline pagination from the detail GET —
        // it returned the first page (`timeline`) + `timeline_has_more`.
        circularTimelinePagination: {
          ...state.circularTimelinePagination,
          [id]: {
            offset: circular.timeline?.length ?? 0,
            hasMore: !!row.timeline_has_more,
            loadingMore: false,
          },
        },
        // W15-5: seed the circular Version History pagination from the detail
        // GET — it returned the first 10 versions + `versions_has_more`.
        circularVersionPagination: {
          ...state.circularVersionPagination,
          [id]: {
            offset: circular.versions?.length ?? 0,
            hasMore: !!row.versions_has_more,
            loadingMore: false,
          },
        },
        // W15-5: seed each article's timeline + version pagination from the
        // detail GET's per-article first page + `*_has_more` flags so the
        // article-modal tabs render Load More without an extra round-trip.
        articleTimelinePagination: (() => {
          const acc = { ...state.articleTimelinePagination }
          for (const r of (row.implementations ?? []) as ImplementationApiRow[]) {
            const art = circular.articles?.find((a) => a.id === r.id)
            acc[`${id}:${r.id}`] = {
              offset: art?.timeline?.length ?? 0,
              hasMore: !!r.timeline_has_more,
              loadingMore: false,
            }
          }
          return acc
        })(),
        articleVersionPagination: (() => {
          const acc = { ...state.articleVersionPagination }
          for (const r of (row.implementations ?? []) as ImplementationApiRow[]) {
            const art = circular.articles?.find((a) => a.id === r.id)
            acc[`${id}:${r.id}`] = {
              offset: art?.versions?.length ?? 0,
              hasMore: !!r.versions_has_more,
              loadingMore: false,
            }
          }
          return acc
        })(),
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
    // GAP-14: optimistic register. Insert a temp row at the TOP of the list
    // synchronously, BEFORE the POST returns, so the new circular appears
    // instantly. The server stamps `reference` (SAMA-2026-NNN) + real UUID;
    // we swap the temp row for the server row on success. On error the temp
    // row is removed and a friendly toast is raised.
    const tempId = `temp-${nanoid()}`
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const optimistic: Circular = {
      id: tempId,
      reference: '…', // server-generated; placeholder until reconcile.
      authority: data.authority,
      title: data.title,
      priority: data.priority ?? 'medium',
      status: data.status ?? 'pending',
      applicability: data.applicability ?? 'pending',
      departments: data.departments ?? [],
      businessOwnerDepartment: data.businessOwnerDepartment,
      assignedTo: data.assignedTo,
      progress: data.progress ?? 0,
      currentPhase: 0,
      detailHydrated: false,
      issuanceDate: data.issuanceDate,
      dueDate: data.dueDate,
      capStatus: data.capStatus ?? 'not-started',
      capDueDate: data.capDueDate,
      capDeadline: data.capDeadline,
      remediationDeadline: data.remediationDeadline,
      referenceUrl: data.referenceUrl,
      description: data.description,
      pdfUrl: data.pdfUrl,
      articles: [],
      workflowSteps: [],
      timeline: [],
      versions: [
        { version: 1, date: today, author: 'System', textEn: INITIAL_REGISTRATION_EN, textAr: INITIAL_REGISTRATION_AR, fieldChanges: [], approved: true },
      ],
      capAttachments: [],
      remediationAttachments: [],
      frameworkIds: data.frameworkIds ?? [],
      createdAt: now,
      updatedAt: now,
    }
    // NOTE: deliberately do NOT set `selectedCircular` to the temp row — the
    // detail-modal effect would fire `fetchById('temp-…')` and 500. The row
    // just appears in the list; the user opens it after the real id lands.
    set((state) => ({
      circulars: [optimistic, ...state.circulars],
      byId: { ...state.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))

    try {
      const row = await api.post<CircularApiRow>('/circulars', toCreatePayload(data))
      const created = mapRow(row)
      // Reconcile: swap the temp row for the server row (real UUID + reference).
      set((state) => ({
        circulars: [
          created,
          ...state.circulars.filter((c) => c.id !== tempId && c.id !== created.id),
        ],
        byId: (() => {
          const { [tempId]: _drop, ...rest } = state.byId
          return { ...rest, [created.id]: created }
        })(),
        selectedCircular:
          state.selectedCircular?.id === tempId ? created : state.selectedCircular,
        isMutating: false,
      }))
      return created
    } catch (e) {
      // Revert: drop the temp row.
      set((state) => {
        const { [tempId]: _drop, ...rest } = state.byId
        return {
          circulars: state.circulars.filter((c) => c.id !== tempId),
          byId: rest,
          selectedCircular:
            state.selectedCircular?.id === tempId ? null : state.selectedCircular,
          error: errorMessage(e, 'Failed to create circular'),
          isMutating: false,
        }
      })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:create] failed —', e)
      throw e
    }
  },

  update: async (id, data) => {
    // GAP-14: optimistic update. Apply the patch to the circular synchronously
    // so the row / detail panel reflects the new values immediately, then PATCH
    // in the background. On success reconcile server-authoritative fields; on
    // error restore the entity snapshot + raise a friendly toast.
    const snapshot = get().byId[id]
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, id, (c) => ({ ...c, ...data, updatedAt: now })),
    )
    set({ isMutating: true, error: null })

    try {
      // SEC-1: send the entity's last-known `updatedAt` as an `If-Match`
      // optimistic-locking token. If a concurrent writer changed the row
      // since we read it the server returns 412 — caught below: the snapshot
      // is restored and a conflict toast is shown.
      const ifMatch = snapshot?.updatedAt
        ? { 'If-Match': `W/"${snapshot.updatedAt}"` }
        : undefined
      const row = await api.patch<CircularApiRow>(
        `/circulars/${id}`,
        toUpdatePayload(data),
        ifMatch,
      )
      // Reconcile against the CURRENT (already-optimistic) circular so nested
      // children added by concurrent mutations are preserved.
      const updated = mapRow(row, get().byId[id])
      set((state) => ({
        ...applyCircular(state, id, () => updated),
        isMutating: false,
      }))
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, id, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to update circular'), isMutating: false })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:update] failed —', e)
      throw e
    }
  },

  delete: async (id) => {
    // GAP-14: optimistic delete. Drop the circular from the list synchronously
    // so the row vanishes the same tick the user confirms; DELETE in the
    // background. On error re-insert the snapshot at its original position +
    // raise a friendly toast.
    const snapshot = get().byId[id]
    const originalIndex = get().circulars.findIndex((c) => c.id === id)
    set((state) => {
      const { [id]: _drop, ...rest } = state.byId
      return {
        circulars: state.circulars.filter((c) => c.id !== id),
        byId: rest,
        selectedCircular:
          state.selectedCircular?.id === id ? null : state.selectedCircular,
        isMutating: true,
        error: null,
      }
    })

    // A temp row never reached the server — nothing to delete remotely.
    if (id.startsWith('temp-')) {
      set({ isMutating: false })
      return
    }

    try {
      await api.delete(`/circulars/${id}`)
      set({ isMutating: false })
    } catch (e) {
      if (snapshot) {
        set((state) => {
          const next = [...state.circulars]
          const insertAt = originalIndex >= 0 ? originalIndex : next.length
          next.splice(insertAt, 0, snapshot)
          return {
            circulars: next,
            byId: { ...state.byId, [id]: snapshot },
            error: errorMessage(e, 'Failed to delete circular'),
            isMutating: false,
          }
        })
      } else {
        set({ error: errorMessage(e, 'Failed to delete circular'), isMutating: false })
      }
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:delete] failed —', e)
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
          // Wave-19.4 / Item-3 — dual-store optimistic fallback.
          textEn: 'Article created',
          textAr: 'تم إنشاء المادة',
          fieldChanges: [],
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
    // GAP-16: optimistic insert + recalc. The new dynamic 50/50 formula means
    // adding an article (with seed checklist items) changes `totalItems`, so
    // progress is recomputed locally to match the server-side recompute that
    // now fires on the implementations POST. An article with no checklist
    // items doesn't change either total, so the bar holds steady in that case.
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
      // Swap temp row for server row, then recalc — `real` carries the
      // server-reconciled checklist (with real ids), so `totalItems` is stable
      // but we recompute to stay aligned with the server-side recompute.
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
      // The optimistic items carry client-side placeholder IDs; the server-side
      // rows get real UUIDs that the toggle/delete routes require. Swap each
      // response back into local state so the UI's IDs match DB.
      //
      // GAP-20: read each item's `completed` from the LIVE store state at POST
      // time, not the frozen `article` param — the user may have toggled an
      // optimistic checkbox during the create reconcile window (that toggle's
      // server PATCH was skipped by the persisted-id guard, so its value must
      // be carried into the create POST instead).
      const seedItems = article.checklist ?? []
      if (seedItems.length > 0) {
        const persisted: { tempId: string; row: { id: string; text: string; completed: boolean; sort_order: number } }[] = []
        let seedFailures = 0
        for (const item of seedItems) {
          try {
            const liveItem = get()
              .byId[circularId]?.articles.find((a) => a.id === real.id)
              ?.checklist.find((i) => i.id === item.id)
            const completed = liveItem ? !!liveItem.completed : !!item.completed
            const row = await api.post<{ id: string; text: string; completed: boolean; sort_order: number }>(
              `/circulars/${circularId}/implementations/${real.id}/checklist`,
              { title: item.title, completed },
            )
            persisted.push({ tempId: item.id, row })
          } catch {
            // The article itself saved; only some seed checklist items failed to
            // persist. Don't fail the whole create — count failures and surface a
            // single toast below so the user knows to re-add them manually.
            seedFailures += 1
          }
        }
        if (seedFailures > 0) {
          pushToast(
            { key: 'errors.rules.checklistItemsNotSaved', params: { count: String(seedFailures) } },
            'error',
          )
        }
        if (persisted.length > 0) {
          set((state) =>
            applyCircular(state, circularId, (c) => {
              const updated = {
                ...c,
                articles: c.articles.map((a) => {
                  if (a.id !== real.id) return a
                  return {
                    ...a,
                    checklist: a.checklist.map((i) => {
                      const swap = persisted.find((p) => p.tempId === i.id)
                      return swap
                        ? { id: swap.row.id, title: swap.row.text, completed: swap.row.completed, order: swap.row.sort_order }
                        : i
                    }),
                  }
                }),
              }
              return { ...updated, progress: recalcProgress(updated) }
            }),
          )
        }
      }

      return real
    } catch (e) {
      // Restore snapshot — drops the optimistic article + any rollups.
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to add article') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:addArticle] failed —', e)
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
          const fieldChanges: { field: string; from: string; to: string }[] = []
          for (const field of trackedFields) {
            const oldVal = String(a[field] ?? '')
            const newVal = String((updates as Record<string, unknown>)[field] ?? a[field] ?? '')
            if (oldVal !== newVal) fieldChanges.push({ field, from: oldVal, to: newVal })
          }
          const nextVer = (a.versions?.length ?? 0) + 1
          const newVersion: ArticleVersionEntry = {
            version: nextVer,
            date: today,
            author: 'Current User',
            // Wave-19.4 / Item-3 — dual-store optimistic fallback.
            textEn: 'Article updated',
            textAr: 'تم تحديث المادة',
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
            timeline: [newTimelineEvent, ...(a.timeline ?? [])],
          }
        })
        // Article field edits don't touch checklist/workflow data, so the DB
        // progress doesn't change — don't recalc locally either.
        return { ...c, articles, updatedAt: now }
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
      // W17-1 / SEC-1: send the article's last-known `updatedAt` as `If-Match`.
      const article = snapshot?.articles.find((a) => a.id === articleId)
      const row = await api.patch<ImplementationApiRow>(
        `/circulars/${circularId}/implementations/${articleId}`,
        payload,
        ifMatchHeader(article?.updatedAt),
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
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to update article') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:updateArticle] failed —', e)
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
      // W17-1 / SEC-1: send the article's last-known `updatedAt` as `If-Match`.
      const article = snapshot?.articles.find((a) => a.id === articleId)
      await api.delete(
        `/circulars/${circularId}/implementations/${articleId}`,
        ifMatchHeader(article?.updatedAt),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to delete article') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:deleteArticle] failed —', e)
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
              timeline: [newEvent, ...(a.timeline ?? [])],
            }
          }),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // GAP-20: skip the server PATCH unless BOTH the article and the item carry
    // real persisted UUIDs. A freshly-created article (or a seed checklist
    // item) may still hold a client placeholder id during the reconcile
    // window; PATCHing `/…/<placeholder>` would 500 on an invalid uuid. The
    // optimistic UI state already reflects the toggle, and the row's persisted
    // value lands with its real id once the create chain finishes.
    if (!isPersistedId(articleId) || !isPersistedId(itemId)) return

    try {
      // W17-1 / SEC-1: thread the item's last-known `updatedAt` as `If-Match`.
      // Refresh local `updatedAt` from the response so the next PATCH wins.
      const row = await api.patch<ArticleChecklistApiRow>(
        `/circulars/${circularId}/implementations/${articleId}/checklist/${itemId}`,
        { completed: newCompleted },
        ifMatchHeader(item?.updatedAt),
      )
      if (row?.updated_at) {
        set((state) =>
          applyCircular(state, circularId, (c) => ({
            ...c,
            articles: c.articles.map((a) => {
              if (a.id !== articleId) return a
              return {
                ...a,
                checklist: a.checklist.map((i) =>
                  i.id === itemId ? { ...i, updatedAt: row.updated_at } : i,
                ),
              }
            }),
          })),
        )
      }
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to update checklist item') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:toggleChecklistItem] failed —', e)
      throw e
    }
  },

  addChecklistItem: async (circularId, articleId, title, deadline) => {
    const snapshot = get().byId[circularId]
    const tempId = `temp-${nanoid()}`
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newItem: ChecklistItem = {
      id: tempId,
      title,
      completed: false,
      order: Date.now(),
      deadline: deadline || undefined,
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
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            return {
              ...a,
              checklist: [...a.checklist, newItem],
              timeline: [newEvent, ...(a.timeline ?? [])],
            }
          }),
          updatedAt: now,
        }
        // Monotonic blend never drops the bar for an uncompleted add; recalc
        // keeps client + server in sync once the server-side recompute fires.
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // GAP-20: only POST when the parent article is a persisted UUID.
    if (!isPersistedId(articleId)) return

    try {
      const row = await api.post<ArticleChecklistApiRow>(
        `/circulars/${circularId}/implementations/${articleId}/checklist`,
        { title, deadline: deadline || undefined },
      )
      set((state) =>
        applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            return {
              ...a,
              checklist: a.checklist.map((i) =>
                i.id === tempId ? mapArticleChecklistRow(row) : i,
              ),
            }
          }),
        })),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to add checklist item') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:addChecklistItem] failed —', e)
      throw e
    }
  },

  // Task D / #32: set/clear a per-item deadline. Mirrors the observation/risk
  // checklist deadline actions — optimistic apply, PATCH, rollback on failure.
  setArticleChecklistItemDeadline: async (circularId, articleId, itemId, deadline) => {
    const snapshot = get().byId[circularId]
    const article = snapshot?.articles.find((a) => a.id === articleId)
    const item = article?.checklist.find((i) => i.id === itemId)
    const now = new Date().toISOString()
    const next = deadline || undefined
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        articles: c.articles.map((a) =>
          a.id === articleId
            ? {
                ...a,
                checklist: a.checklist.map((i) =>
                  i.id === itemId ? { ...i, deadline: next } : i,
                ),
              }
            : a,
        ),
        updatedAt: now,
      })),
    )

    // GAP-20: only PATCH when BOTH article and item carry real persisted ids.
    if (!isPersistedId(articleId) || !isPersistedId(itemId)) return

    try {
      // W17-1 / SEC-1: thread the item's last-known `updatedAt` as `If-Match`.
      const row = await api.patch<ArticleChecklistApiRow>(
        `/circulars/${circularId}/implementations/${articleId}/checklist/${itemId}`,
        { deadline: deadline ?? null },
        ifMatchHeader(item?.updatedAt),
      )
      if (row?.updated_at) {
        set((state) =>
          applyCircular(state, circularId, (c) => ({
            ...c,
            articles: c.articles.map((a) =>
              a.id === articleId
                ? {
                    ...a,
                    checklist: a.checklist.map((i) =>
                      i.id === itemId ? { ...i, updatedAt: row.updated_at } : i,
                    ),
                  }
                : a,
            ),
          })),
        )
      }
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to set checklist deadline') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:setArticleChecklistItemDeadline] failed —', e)
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
              timeline: [newEvent, ...(a.timeline ?? [])],
            }
          }),
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // GAP-20: same persisted-id guard as toggle — never DELETE a placeholder id.
    if (!isPersistedId(articleId) || !isPersistedId(itemId)) return

    try {
      // W17-1 / SEC-1: thread the item's last-known `updatedAt` as `If-Match`.
      await api.delete(
        `/circulars/${circularId}/implementations/${articleId}/checklist/${itemId}`,
        ifMatchHeader(item?.updatedAt),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to delete checklist item') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:deleteChecklistItem] failed —', e)
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
          return { ...a, timeline: [newEvent, ...(a.timeline ?? [])] }
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
        // GAP-16: completing a step changes `completedSteps`, so recalc the
        // dynamic 50/50 progress optimistically to match the server recompute.
        const updated = {
          ...c,
          workflowSteps: updatedSteps,
          timeline: [newEvent, ...(c.timeline ?? [])],
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // Wave-19.6 — the ephemeral `lastStepMutation` undo plumbing was removed.
    // Step Undo now reads from the DB via `undoLastWorkflowStep`.

    try {
      await api.post(`/circulars/${circularId}/workflow/advance`, {
        step_id: stepId,
        notes,
      })
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to advance workflow step') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:advanceWorkflowStep] failed —', e)
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
    // GAP-14: entity snapshot for the background revert path. The picker is
    // synchronous (returns ok/false immediately), so the PATCH is fire-and-
    // forget — but on failure we still revert the optimistic deadline + the
    // timeline row, and raise a friendly toast.
    const snapshot = get().byId[circularId]
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: newSteps,
        timeline: [event, ...(c.timeline ?? [])],
        updatedAt: now,
      })),
    )
    // Fire-and-forget API call so the inline picker stays synchronous and
    // returns the boolean shape its caller expects.
    if (step.id && !step.id.startsWith('temp-')) {
      // W17-1 / SEC-1: thread the step's last-known `updatedAt` as `If-Match`.
      void api
        .patch(
          `/circulars/${circularId}/workflow/steps/${step.id}`,
          { deadline: deadline ?? null },
          ifMatchHeader(step.updatedAt),
        )
        .catch((e) => {
          if (snapshot) {
            set((state) => restoreCircularState(state, circularId, snapshot))
          }
          set({ error: errorMessage(e, 'Failed to update step deadline') })
          if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
          console.error('[optimistic:setRuleStepDeadline] failed —', e)
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
    // Optimistic append. GAP-16: adding a step grows `totalSteps`, so recalc.
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          workflowSteps: [...existingSteps, newStep],
          timeline: [event, ...(c.timeline ?? [])],
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
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
      // Wave-19.6 supersedes the W15-2 ephemeral-undo plumbing entirely —
      // the new flow is DB-backed via `undoLastWorkflowStep` / `resetWorkflow`.
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to add workflow step') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:addWorkflowStep] failed —', e)
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
        timeline: [event, ...(c.timeline ?? [])],
        updatedAt: now,
      })),
    )

    // Wave-19.6 — ephemeral edit-undo plumbing removed (see store header).

    if (step.id.startsWith('temp-')) return

    try {
      // W17-1 / SEC-1: thread the step's last-known `updatedAt` as `If-Match`.
      const row = await api.patch<WorkflowStepApiRow>(
        `/circulars/${circularId}/workflow/steps/${step.id}`,
        { label: trimmed, label_ar: trimmed },
        ifMatchHeader(step.updatedAt),
      )
      if (row?.updated_at) {
        set((state) =>
          applyCircular(state, circularId, (c) => ({
            ...c,
            workflowSteps: (c.workflowSteps ?? []).map((s) =>
              s.id === step.id ? { ...s, updatedAt: row.updated_at } : s,
            ),
          })),
        )
      }
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to rename workflow step') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:renameWorkflowStep] failed —', e)
      throw e
    }
  },

  updateWorkflowStep: async (circularId, stepId, updates) => {
    const snapshot = get().byId[circularId]
    const now = new Date().toISOString()
    // Optimistic patch.
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        workflowSteps: (c.workflowSteps ?? []).map((s) =>
          s.id === stepId
            ? {
                ...s,
                ...(updates.notes !== undefined ? { notes: updates.notes ?? undefined } : {}),
                ...(updates.assignedTo !== undefined
                  ? { assignedTo: updates.assignedTo ?? undefined }
                  : {}),
                ...(updates.actionType !== undefined ? { actionType: updates.actionType } : {}),
              }
            : s,
        ),
        updatedAt: now,
      })),
    )

    // Wave-19.6 — ephemeral edit-undo plumbing removed (see store header).

    if (stepId.startsWith('temp-')) return

    try {
      const payload: Record<string, unknown> = {}
      // `null` clears the column; the schema accepts `.nullable()` for these.
      if (updates.notes !== undefined) payload.notes = updates.notes || null
      if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo || null
      if (updates.actionType !== undefined) payload.action_type = updates.actionType
      if (Object.keys(payload).length === 0) return
      // W17-1 / SEC-1: thread the step's last-known `updatedAt` as `If-Match`,
      // and refresh local `updatedAt` from the response.
      const snapStep = snapshot?.workflowSteps?.find((s) => s.id === stepId)
      const row = await api.patch<WorkflowStepApiRow>(
        `/circulars/${circularId}/workflow/steps/${stepId}`,
        payload,
        ifMatchHeader(snapStep?.updatedAt),
      )
      if (row?.updated_at) {
        set((state) =>
          applyCircular(state, circularId, (c) => ({
            ...c,
            workflowSteps: (c.workflowSteps ?? []).map((s) =>
              s.id === stepId ? { ...s, updatedAt: row.updated_at } : s,
            ),
          })),
        )
      }
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to update workflow step') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:updateWorkflowStep] failed —', e)
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
    // GAP-16: removing a step shrinks `totalSteps`, so recalc progress.
    set((state) =>
      applyCircular(state, circularId, (c) => {
        const updated = {
          ...c,
          workflowSteps: restated,
          timeline: [event, ...(c.timeline ?? [])],
          updatedAt: now,
        }
        return { ...updated, progress: recalcProgress(updated) }
      }),
    )

    // Wave-19.6 — ephemeral remove-undo plumbing removed (see store header).

    if (removedId.startsWith('temp-')) return

    try {
      // W17-1 / SEC-1: thread the step's last-known `updatedAt` as `If-Match`.
      await api.delete(
        `/circulars/${circularId}/workflow/steps/${removedId}`,
        ifMatchHeader(step.updatedAt),
      )
    } catch (e) {
      if (snapshot) {
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to remove workflow step') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:removeWorkflowStep] failed —', e)
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
        timeline: [event, ...(c.timeline ?? [])],
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
        set((state) => restoreCircularState(state, circularId, snapshot))
      }
      set({ error: errorMessage(e, 'Failed to reorder workflow steps') })
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[optimistic:reorderWorkflowSteps] failed —', e)
      throw e
    }
  },

  // Wave-19.6 (corrected) — DB-backed UNDO with dual-flip cursor model.
  // One click walks the cursor backwards by exactly one step:
  //   • most-recently-completed step → 'current' (cursor moves here)
  //   • previously-current step → 'pending' (un-highlights)
  // Reconciliation accepts the server's full refreshed workflow array so we
  // pick up the canonical state regardless of any client/server race.
  // Uses the parent circular's `updated_at` as `If-Match` (W17.2).
  undoLastWorkflowStep: async (circularId) => {
    const snapshot = get().byId[circularId]
    if (!snapshot) return
    const steps = snapshot.workflowSteps ?? []
    // The client doesn't hydrate `completed_at`; fall back to the LAST
    // `status==='completed'` in sort_order — in practice the same step.
    let lastCompletedIdx = -1
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].status === 'completed') lastCompletedIdx = i
    }
    if (lastCompletedIdx === -1) return
    const currentIdx = steps.findIndex((s) => s.status === 'current')

    await optimisticMutation<{ items: WorkflowStepApiRow[] }>({
      context: 'circular.undoStep',
      errorMessage: revertMessage,
      apply: () => {
        set((state) =>
          applyCircular(state, circularId, (c) => {
            const next = (c.workflowSteps ?? []).map((s, i) => {
              if (i === lastCompletedIdx) {
                // Promote — most-recently-completed becomes the new active step.
                return { ...s, status: 'current' as const, date: undefined, user: undefined }
              }
              if (i === currentIdx && currentIdx !== lastCompletedIdx) {
                // Demote — previously-current step un-highlights.
                return { ...s, status: 'pending' as const, date: undefined, user: undefined }
              }
              return s
            })
            const updated = { ...c, workflowSteps: next, updatedAt: new Date().toISOString() }
            return { ...updated, progress: recalcProgress(updated) }
          }),
        )
      },
      request: () =>
        api.post<{ items: WorkflowStepApiRow[] }>(
          `/circulars/${circularId}/workflow/undo`,
          {},
          ifMatchHeader(snapshot.updatedAt),
        ),
      reconcile: (res) => {
        // Server returns the full refreshed workflow array (mirrors reset).
        // Apply it directly so we don't depend on a background refetch racing
        // with the optimistic apply.
        const rows = Array.isArray(res?.items) ? res.items : []
        if (rows.length > 0) {
          set((state) =>
            applyCircular(state, circularId, (c) => {
              const updated = { ...c, workflowSteps: rows.map(mapWorkflowStepRow) }
              return { ...updated, progress: recalcProgress(updated) }
            }),
          )
        }
        void get().fetchById(circularId)
      },
      revert: () => {
        set((state) => restoreCircularState(state, circularId, snapshot))
      },
    }).catch(() => {
      // toast + console.error already raised inside `optimisticMutation`.
    })
  },

  // Wave-19.6 — DB-backed RESET. Only valid when 100% of steps are completed.
  // Bulk-revert via POST /api/circulars/:id/workflow/reset. Optimistic flip
  // every step to 'pending'; reconcile from the server response.
  resetWorkflow: async (circularId) => {
    const snapshot = get().byId[circularId]
    if (!snapshot) return
    const steps = snapshot.workflowSteps ?? []
    if (steps.length === 0 || steps.some((s) => s.status !== 'completed')) return

    await optimisticMutation<{ items: WorkflowStepApiRow[] }>({
      context: 'circular.resetWorkflow',
      errorMessage: revertMessage,
      apply: () => {
        set((state) =>
          applyCircular(state, circularId, (c) => {
            const next = (c.workflowSteps ?? []).map((s) => ({
              ...s,
              status: 'pending' as const,
              date: undefined,
              user: undefined,
            }))
            const updated = { ...c, workflowSteps: next, updatedAt: new Date().toISOString() }
            return { ...updated, progress: recalcProgress(updated) }
          }),
        )
      },
      request: () =>
        api.post<{ items: WorkflowStepApiRow[] }>(
          `/circulars/${circularId}/workflow/reset`,
          {},
          ifMatchHeader(snapshot.updatedAt),
        ),
      reconcile: (res) => {
        const rows = Array.isArray(res?.items) ? res.items : []
        set((state) =>
          applyCircular(state, circularId, (c) => {
            const updated = { ...c, workflowSteps: rows.map(mapWorkflowStepRow) }
            return { ...updated, progress: recalcProgress(updated) }
          }),
        )
        void get().fetchById(circularId)
      },
      revert: () => {
        set((state) => restoreCircularState(state, circularId, snapshot))
      },
    }).catch(() => {
      // toast + console.error already raised inside `optimisticMutation`.
    })
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
            // Wave-19.4 / Item-3 — dual-store optimistic fallback.
            textEn: 'Edit approved and applied',
            textAr: 'تمت الموافقة على التعديل وتطبيقه',
            // GAP-19: `CircularVersionEntry.fieldChanges` is now a structured
            // array; the legacy `pendingEdit.fieldChanges` keyed Record is
            // flattened into `[{field,from,to}]`.
            fieldChanges: c.pendingEdit?.fieldChanges
              ? Object.entries(c.pendingEdit.fieldChanges).map(([field, diff]) => ({
                  field,
                  from: diff.from,
                  to: diff.to,
                }))
              : [],
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
            timeline: [approvedEvent, ...(c.timeline ?? [])],
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
          timeline: [approvedEvent, ...(c.timeline ?? [])],
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
          timeline: [rejectedEvent, ...(c.timeline ?? [])],
          updatedAt: now,
        }
      }),
    )
  },

  // GAP-1: CAP / remediation attachments are now persisted via
  // /api/circulars/[id]/attachments. Optimistic insert with a temp id, then
  // swap in the server row; on failure restore the snapshot.
  addCAPAttachment: async (circularId, file) => {
    await uploadCircularAttachment(get, set, circularId, 'cap', file)
  },

  addRemediationAttachment: async (circularId, file) => {
    await uploadCircularAttachment(get, set, circularId, 'remediation', file)
  },

  removeCAPAttachment: async (circularId, attachmentId) => {
    await deleteCircularAttachment(get, set, circularId, 'cap', attachmentId)
  },

  removeRemediationAttachment: async (circularId, attachmentId) => {
    await deleteCircularAttachment(get, set, circularId, 'remediation', attachmentId)
  },

  addTimelineEvent: (circularId, event) => {
    const newEvent: CircularTimelineEvent = { ...event, id: nanoid() }
    const now = new Date().toISOString()
    set((state) =>
      applyCircular(state, circularId, (c) => ({
        ...c,
        timeline: [newEvent, ...(c.timeline ?? [])],
        updatedAt: now,
      })),
    )
  },

  // GAP-15: load the NEXT page (10 rows) of the circular Activity timeline.
  // The timeline is stored newest-first; new rows are appended (older) so the
  // Activity tab — which renders the array reversed for oldest-at-bottom —
  // shows them correctly. A `loadingMore` flag drives the on-button spinner.
  loadMoreTimeline: async (circularId) => {
    const page = get().circularTimelinePagination[circularId]
    if (!page || page.loadingMore || !page.hasMore) return
    set((state) => ({
      circularTimelinePagination: {
        ...state.circularTimelinePagination,
        [circularId]: { ...page, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: unknown[]; hasMore: boolean }>(
        `/circulars/${circularId}/timeline`,
        { offset: page.offset, limit: 10 },
      )
      const newRows = res.items.map(mapTimelineRow)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => {
          // De-dupe against ids already present (race-safe).
          const existing = new Set((c.timeline ?? []).map((e) => e.id))
          const merged = [
            ...(c.timeline ?? []),
            ...newRows.filter((e) => !existing.has(e.id)),
          ]
          return { ...c, timeline: merged }
        })
        const newOffset =
          (next.byId[circularId]?.timeline?.length ?? page.offset)
        return {
          ...next,
          circularTimelinePagination: {
            ...state.circularTimelinePagination,
            [circularId]: {
              offset: newOffset,
              hasMore: res.hasMore,
              loadingMore: false,
            },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        circularTimelinePagination: {
          ...state.circularTimelinePagination,
          [circularId]: { ...page, loadingMore: false },
        },
      }))
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[loadMoreTimeline] failed —', e)
    }
  },

  // GAP-15: lazily load the FIRST page of an article's Activity timeline when
  // its modal opens. Replaces the article's `timeline` with the first 10 rows.
  loadArticleTimeline: async (circularId, articleId) => {
    const key = `${circularId}:${articleId}`
    // Skip if already loaded once (pagination state exists).
    if (get().articleTimelinePagination[key]) return
    if (!isPersistedId(articleId)) return
    set((state) => ({
      articleTimelinePagination: {
        ...state.articleTimelinePagination,
        [key]: { offset: 0, hasMore: false, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: ArticleTimelineApiRow[]; hasMore: boolean }>(
        `/circulars/${circularId}/implementations/${articleId}/timeline`,
        { offset: 0, limit: 10 },
      )
      const rows = res.items.map(mapArticleTimelineRow)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) =>
            a.id === articleId ? { ...a, timeline: rows } : a,
          ),
        }))
        return {
          ...next,
          articleTimelinePagination: {
            ...state.articleTimelinePagination,
            [key]: { offset: rows.length, hasMore: res.hasMore, loadingMore: false },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        articleTimelinePagination: {
          ...state.articleTimelinePagination,
          [key]: { offset: 0, hasMore: false, loadingMore: false },
        },
      }))
      console.error('[loadArticleTimeline] failed —', e)
    }
  },

  // GAP-15: load the NEXT page of an article's Activity timeline.
  loadMoreArticleTimeline: async (circularId, articleId) => {
    const key = `${circularId}:${articleId}`
    const page = get().articleTimelinePagination[key]
    if (!page || page.loadingMore || !page.hasMore) return
    set((state) => ({
      articleTimelinePagination: {
        ...state.articleTimelinePagination,
        [key]: { ...page, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: ArticleTimelineApiRow[]; hasMore: boolean }>(
        `/circulars/${circularId}/implementations/${articleId}/timeline`,
        { offset: page.offset, limit: 10 },
      )
      const newRows = res.items.map(mapArticleTimelineRow)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const existing = new Set((a.timeline ?? []).map((e) => e.id))
            return {
              ...a,
              timeline: [
                ...(a.timeline ?? []),
                ...newRows.filter((e) => !existing.has(e.id)),
              ],
            }
          }),
        }))
        const newOffset =
          next.byId[circularId]?.articles.find((a) => a.id === articleId)?.timeline
            ?.length ?? page.offset
        return {
          ...next,
          articleTimelinePagination: {
            ...state.articleTimelinePagination,
            [key]: { offset: newOffset, hasMore: res.hasMore, loadingMore: false },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        articleTimelinePagination: {
          ...state.articleTimelinePagination,
          [key]: { ...page, loadingMore: false },
        },
      }))
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[loadMoreArticleTimeline] failed —', e)
    }
  },

  // W15-5: load the NEXT page (10 rows) of the circular Version History tab.
  // Versions are stored newest-first (after the server's DESC fetch); the
  // store keeps `versions` ASC-sorted, so the next page (older versions) is
  // merged and re-sorted. A `loadingMore` flag drives the on-button spinner.
  loadMoreCircularVersions: async (circularId) => {
    const page = get().circularVersionPagination[circularId]
    if (!page || page.loadingMore || !page.hasMore) return
    set((state) => ({
      circularVersionPagination: {
        ...state.circularVersionPagination,
        [circularId]: { ...page, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: CircularVersionApiRow[]; hasMore: boolean }>(
        `/circulars/${circularId}/versions`,
        { offset: page.offset, limit: 10 },
      )
      const newRows = res.items.map(mapCircularVersionRow)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => {
          const existing = new Set((c.versions ?? []).map((v) => v.version))
          const merged = [
            ...(c.versions ?? []),
            ...newRows.filter((v) => !existing.has(v.version)),
          ].sort((a, b) => a.version - b.version)
          return { ...c, versions: merged }
        })
        const newOffset = next.byId[circularId]?.versions?.length ?? page.offset
        return {
          ...next,
          circularVersionPagination: {
            ...state.circularVersionPagination,
            [circularId]: {
              offset: newOffset,
              hasMore: res.hasMore,
              loadingMore: false,
            },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        circularVersionPagination: {
          ...state.circularVersionPagination,
          [circularId]: { ...page, loadingMore: false },
        },
      }))
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[loadMoreCircularVersions] failed —', e)
    }
  },

  // W15-5: lazily load the FIRST page of an article's Version History when its
  // modal opens — replaces the article's `versions` with the newest 10 rows.
  loadArticleVersions: async (circularId, articleId) => {
    const key = `${circularId}:${articleId}`
    if (get().articleVersionPagination[key]) return
    if (!isPersistedId(articleId)) return
    set((state) => ({
      articleVersionPagination: {
        ...state.articleVersionPagination,
        [key]: { offset: 0, hasMore: false, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: ArticleVersionApiRow[]; hasMore: boolean }>(
        `/circulars/${circularId}/implementations/${articleId}/versions`,
        { offset: 0, limit: 10 },
      )
      const rows = res.items.map(mapArticleVersionRow).sort((a, b) => a.version - b.version)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) =>
            a.id === articleId ? { ...a, versions: rows } : a,
          ),
        }))
        return {
          ...next,
          articleVersionPagination: {
            ...state.articleVersionPagination,
            [key]: { offset: rows.length, hasMore: res.hasMore, loadingMore: false },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        articleVersionPagination: {
          ...state.articleVersionPagination,
          [key]: { offset: 0, hasMore: false, loadingMore: false },
        },
      }))
      console.error('[loadArticleVersions] failed —', e)
    }
  },

  // W15-5: load the NEXT page of an article's Version History.
  loadMoreArticleVersions: async (circularId, articleId) => {
    const key = `${circularId}:${articleId}`
    const page = get().articleVersionPagination[key]
    if (!page || page.loadingMore || !page.hasMore) return
    set((state) => ({
      articleVersionPagination: {
        ...state.articleVersionPagination,
        [key]: { ...page, loadingMore: true },
      },
    }))
    try {
      const res = await api.get<{ items: ArticleVersionApiRow[]; hasMore: boolean }>(
        `/circulars/${circularId}/implementations/${articleId}/versions`,
        { offset: page.offset, limit: 10 },
      )
      const newRows = res.items.map(mapArticleVersionRow)
      set((state) => {
        const next = applyCircular(state, circularId, (c) => ({
          ...c,
          articles: c.articles.map((a) => {
            if (a.id !== articleId) return a
            const existing = new Set((a.versions ?? []).map((v) => v.version))
            const merged = [
              ...(a.versions ?? []),
              ...newRows.filter((v) => !existing.has(v.version)),
            ].sort((x, y) => x.version - y.version)
            return { ...a, versions: merged }
          }),
        }))
        const newOffset =
          next.byId[circularId]?.articles.find((a) => a.id === articleId)?.versions
            ?.length ?? page.offset
        return {
          ...next,
          articleVersionPagination: {
            ...state.articleVersionPagination,
            [key]: { offset: newOffset, hasMore: res.hasMore, loadingMore: false },
          },
        }
      })
    } catch (e) {
      set((state) => ({
        articleVersionPagination: {
          ...state.articleVersionPagination,
          [key]: { ...page, loadingMore: false },
        },
      }))
      if (!isPermissionDenied(e)) pushToast(revertMessage(e), 'error')
      console.error('[loadMoreArticleVersions] failed —', e)
    }
  },

  // GAP-21: circular PDF attachments — optimistic add/remove, mirroring the
  // CAP / Remediation document actions.
  addPdfAttachment: async (circularId, file) => {
    await uploadCircularAttachment(get, set, circularId, 'pdf', file)
  },

  removePdfAttachment: async (circularId, attachmentId) => {
    await deleteCircularAttachment(get, set, circularId, 'pdf', attachmentId)
  },
}))

// Suppress "unused" lint for the CircularPendingEdit type while the approval
// workflow is deferred (still referenced by other modules / future wiring).
export type { CircularPendingEdit }
