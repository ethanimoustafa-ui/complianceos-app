// Zod schemas for circulars + workflow steps + implementations (articles) +
// timeline reads.

import { z } from 'zod'
import { isSafeHttpUrl, stripHtml } from '../sanitize'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// SEC-4: a plain-text field — strips ALL HTML/event-handler markup server-side
// (defence-in-depth, never trust the client). `.transform(stripHtml)` runs
// after the length checks; normal text/punctuation/Arabic survive unharmed.
// `max` is enforced on the RAW input so an attacker can't smuggle an oversized
// payload that only shrinks below the limit after stripping.
const PlainText = (max: number) => z.string().max(max).transform(stripHtml)
const PlainTextMin = (max: number) =>
  z.string().min(1).max(max).transform(stripHtml)

// SEC-3: a URL-shaped field. Rejects any scheme other than http/https
// (`javascript:`, `data:`, `vbscript:`, …) with a 400 before persistence.
const HttpUrl = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => s.length === 0 || isSafeHttpUrl(s), {
      message: 'URL must use http or https',
    })

// Authority is a framework slug. We don't enforce a closed enum here because
// the user can add custom frameworks via Settings → Frameworks (e.g. sharia,
// nca-ecc, citc, pdpl, iso-27001, etc.). Validation is open-string + a check
// constraint at the DB layer if needed.
const Authority = z.string().min(1).max(100)
const Priority = z.enum(['critical', 'high', 'medium', 'low'])
const Status = z.enum(['pending', 'in-progress', 'completed', 'overdue'])
const Applicability = z.enum(['applicable', 'not-applicable', 'pending'])

// ---------- circular --------------------------------------------------------

export const CreateCircularSchema = z
  .object({
  authority: Authority,
  // SEC-4: plain-text — strip HTML server-side.
  title: PlainTextMin(2_000),
  priority: Priority.default('medium'),
  status: Status.default('pending'),
  applicability: Applicability.default('pending'),
  departments: z.array(z.string().min(1)).default([]),
  business_owner_department: z.string().max(200).optional(),
  business_owner_department_id: Uuid.optional(),
  assigned_to: Uuid.optional(),
  // No .default(0) here: `UpdateCircularSchema = CreateSchema.partial()`
  // preserves the default, so Zod was injecting `progress: 0` into every PATCH
  // even when the client omitted it — wiping a circular's real progress on
  // every edit. POST callers always send `progress: 0` explicitly anyway.
  progress: z.number().int().min(0).max(100).optional(),
  // issuance_date: if the form leaves it blank, default to today server-side.
  // This matches the UI which doesn't enforce it as required (only due_date +
  // cap_deadline are required per the modal's pre-submit check).
  issuance_date: DateString.optional().default(() => new Date().toISOString().slice(0, 10)),
  due_date: DateString,
  cap_status: z.string().max(100).default('not-started'),
  cap_due_date: DateString.optional(),
  cap_deadline: DateString.optional(),
  cap_response_deadline: DateString.optional(),
  remediation_deadline: DateString.optional(),
  // SEC-4: plain-text — strip HTML server-side.
  description: PlainText(50_000).optional(),
  pdf_url: z.string().max(15_000_000).optional(),
  // SEC-3: only http/https schemes accepted.
  reference_url: HttpUrl(2_000).optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
  })
  // SEC-8: reject unknown keys (`org_id`, `is_admin`, `owner_id`, `role`, …)
  // with a clean 400 at the validation boundary instead of letting them reach
  // the DB and surface as a 500.
  .strict()
export type CreateCircularInput = z.infer<typeof CreateCircularSchema>

// HANI-3: `CreateCircularSchema.partial()` makes every field optional but
// KEEPS each field's inner `.default(...)`. Zod runs the default whenever the
// key is absent, so a PATCH that omits e.g. `departments` was getting
// `departments: []` injected — silently wiping the DB row's real value.
//
// The UPDATE schema must therefore be DEFAULT-FREE: an absent key must stay
// `undefined` so the PATCH route can skip it. We define it explicitly with
// `.optional()` fields and zero defaults. POST keeps `CreateCircularSchema`
// (with defaults) untouched.
//
// GAP-3: clearable optional string/date columns are `.nullable()` so the
// client can send an explicit `null` to NULL the DB column when the user
// clears the field. Required fields (title/authority/due_date) stay non-null.
export const UpdateCircularSchema = z
  .object({
  authority: Authority.optional(),
  title: PlainTextMin(2_000).optional(),
  priority: Priority.optional(),
  status: Status.optional(),
  applicability: Applicability.optional(),
  departments: z.array(z.string().min(1)).optional(),
  business_owner_department: z.string().max(200).nullable().optional(),
  business_owner_department_id: Uuid.nullable().optional(),
  assigned_to: Uuid.nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  issuance_date: DateString.optional(),
  due_date: DateString.optional(),
  cap_status: z.string().max(100).optional(),
  cap_due_date: DateString.nullable().optional(),
  cap_deadline: DateString.nullable().optional(),
  cap_response_deadline: DateString.nullable().optional(),
  remediation_deadline: DateString.nullable().optional(),
  // SEC-4: plain-text — strip HTML; `null` still allowed (GAP-3 clear).
  description: PlainText(50_000).nullable().optional(),
  pdf_url: z.string().max(15_000_000).nullable().optional(),
  // SEC-3: only http/https schemes accepted; `null` clears the column.
  reference_url: HttpUrl(2_000).nullable().optional(),
  framework_ids: z.array(z.string().min(1)).optional(),
  })
  // SEC-8: reject unknown keys (`org_id`, `is_admin`, `owner_id`, `role`, …).
  .strict()
export type UpdateCircularInput = z.infer<typeof UpdateCircularSchema>

// ---------- circular attachments (CAP / remediation) ------------------------

// GAP-1 / GAP-21: CAP + Remediation + circular-PDF document uploads. `kind`
// selects the table (`circular_cap_attachments` / `circular_remediation_attachments`
// / `circular_pdf_attachments`). The file is stored base64-inline in
// `storage_path` (consistent with the legacy `pdf_url` column).
export const AttachmentKind = z.enum(['cap', 'remediation', 'pdf'])
export type AttachmentKindInput = z.infer<typeof AttachmentKind>

export const CreateCircularAttachmentSchema = z
  .object({
    kind: AttachmentKind,
    // SEC-4 + SEC-10: strip HTML; the route additionally reduces this to a
    // safe basename (path-traversal defence) before persistence.
    name: PlainTextMin(500),
    // base64 data URL — same precedent as `pdf_url`.
    storage_path: z.string().min(1).max(15_000_000),
    type: z.string().max(200).optional(),
    size: z.number().int().min(0).optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type CreateCircularAttachmentInput = z.infer<typeof CreateCircularAttachmentSchema>

export const ListCircularsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: Status.optional(),
  authority: Authority.optional(),
  authority_id: z.string().optional(), // alias
  priority: Priority.optional(),
  applicability: Applicability.optional(),
  has_pending_edits: z.enum(['true', 'false']).optional(),
  framework_id: z.string().optional(),
  q: z.string().max(200).optional(),
})
export type ListCircularsQuery = z.infer<typeof ListCircularsQuerySchema>

// ---------- workflow phase advance -----------------------------------------

export const AdvancePhaseSchema = z.object({
  notes: z.string().max(5_000).optional(),
  next_phase: z.coerce.number().int().min(0).max(2).optional(),
  step_id: z.string().uuid().optional(),
})
export type AdvancePhaseInput = z.infer<typeof AdvancePhaseSchema>

export const SetPhaseDeadlineSchema = z.object({
  phase: z.coerce.number().int().min(0).max(2),
  deadline: DateString,
})
export type SetPhaseDeadlineInput = z.infer<typeof SetPhaseDeadlineSchema>

// ---------- implementations (mapped to circular_articles) -----------------

export const CreateImplementationSchema = z
  .object({
    article_number: z.string().min(1).max(100),
    // SEC-4: plain-text — strip HTML server-side.
    title: PlainTextMin(2_000),
    description: PlainText(50_000).optional(),
    risk_level: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    responsible_department: z.string().max(200).optional(),
    compliance_status: z.string().max(100).default('not-started'),
    assigned_to: Uuid.optional(),
    notes: PlainText(5_000).optional(),
    sort_order: z.coerce.number().int().min(0).default(0),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type CreateImplementationInput = z.infer<typeof CreateImplementationSchema>

// HANI-3: same default-leak hazard as UpdateCircularSchema. `.partial()` would
// carry through `risk_level`/`compliance_status`/`sort_order` defaults and
// overwrite real DB values on any PATCH that omits them. Define default-free.
export const UpdateImplementationSchema = z
  .object({
    article_number: z.string().min(1).max(100).optional(),
    // SEC-4: plain-text — strip HTML server-side.
    title: PlainTextMin(2_000).optional(),
    description: PlainText(50_000).optional(),
    risk_level: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    responsible_department: z.string().max(200).optional(),
    compliance_status: z.string().max(100).optional(),
    assigned_to: Uuid.optional(),
    notes: PlainText(5_000).optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type UpdateImplementationInput = z.infer<typeof UpdateImplementationSchema>

// ---------- article checklist items ----------------------------------------

export const CreateArticleChecklistItemSchema = z
  .object({
    // SEC-4: plain-text — strip HTML server-side (DB column `text`).
    title: PlainTextMin(2_000),
    completed: z.boolean().default(false),
    sort_order: z.coerce.number().int().min(0).default(0),
    // Task D / #32: per-item deadline (DATE). Plain optional string — NO
    // .default() (the UpdateSchema below is hand-written, but keep parity and
    // avoid the zod partial+default footgun). Accepts YYYY-MM-DD; null/empty
    // clears (route coerces falsy → NULL).
    deadline: z.string().nullable().optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type CreateArticleChecklistItemInput = z.infer<typeof CreateArticleChecklistItemSchema>

export const UpdateArticleChecklistItemSchema = z
  .object({
    // SEC-4: plain-text — strip HTML server-side.
    title: PlainTextMin(2_000).optional(),
    completed: z.boolean().optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
    // Task D / #32: per-item deadline (DATE). null/empty clears (→ NULL).
    deadline: z.string().nullable().optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type UpdateArticleChecklistItemInput = z.infer<typeof UpdateArticleChecklistItemSchema>

// ---------- workflow step CRUD ---------------------------------------------

const CircularWorkflowStepStatus = z.enum(['pending', 'current', 'completed'])

export const CreateCircularWorkflowStepSchema = z
  .object({
    phase: z.coerce.number().int().min(0).max(10),
    // SEC-4: plain-text fields — strip HTML server-side.
    label: PlainTextMin(500),
    label_ar: PlainText(500).optional(),
    action_label: PlainTextMin(200),
    action_label_ar: PlainTextMin(200),
    action_type: z.string().min(1).max(100),
    requires_notes: z.boolean().default(false),
    assigned_to: Uuid.optional(),
    notes: PlainText(5_000).optional(),
    deadline: DateString.optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type CreateCircularWorkflowStepInput = z.infer<typeof CreateCircularWorkflowStepSchema>

export const UpdateCircularWorkflowStepSchema = z
  .object({
    // SEC-4: plain-text fields — strip HTML server-side.
    label: PlainTextMin(500).optional(),
    label_ar: PlainText(500).optional(),
    phase: z.coerce.number().int().min(0).max(10).optional(),
    action_label: PlainTextMin(200).optional(),
    action_label_ar: PlainTextMin(200).optional(),
    action_type: z.string().min(1).max(100).optional(),
    requires_notes: z.boolean().optional(),
    status: CircularWorkflowStepStatus.optional(),
    assigned_to: Uuid.nullable().optional(),
    notes: PlainText(5_000).nullable().optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
    deadline: DateString.nullable().optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type UpdateCircularWorkflowStepInput = z.infer<typeof UpdateCircularWorkflowStepSchema>

export const ReorderCircularWorkflowStepsSchema = z.object({
  items: z
    .array(
      z.object({
        id: Uuid,
        sort_order: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
})
export type ReorderCircularWorkflowStepsInput = z.infer<
  typeof ReorderCircularWorkflowStepsSchema
>
