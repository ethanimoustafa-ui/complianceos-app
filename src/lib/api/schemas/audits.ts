// Zod schemas for the audits resource family.
// W26-A: hardened to PORTING-TEMPLATE §2 countermeasures 3/4/5/15/16.
//
//   §2.3 — hand-written default-free UpdateAuditSchema (never .partial(Create))
//   §2.4 — .nullable() clearable fields + client sends explicit null
//   §2.5 — raw-body key-presence gate via .strict()
//   §2.15 — HTML strip on every free-text field via PlainText helpers
//   §2.16 — no server-generated columns in Create/Update schemas
//   §8 — enum shapes use open-string (z.string().min().max()) not z.enum([])
//          for user-domain concepts (status, priority, type/category)
//
// The closed z.enum() forms on AuditStatus / AuditType / Priority have been
// REPLACED with open-string shapes per §8 (configurable enum invariant).
// DocType, TaskStatus remain closed — they are schema/storage concerns, not
// user-domain concepts.

import { z } from 'zod'
import { stripHtml } from '../sanitize'

// ---------- shared scalars ----------------------------------------------------

const Uuid = z.string().uuid()
// HTML date inputs send YYYY-MM-DD. Accept either an ISO string or that form.
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// SEC-4: plain-text helpers — strip ALL HTML/event-handler markup server-side.
// `.transform(stripHtml)` runs AFTER the length checks.
const PlainText = (max: number) => z.string().max(max).transform(stripHtml)
const PlainTextMin = (max: number) =>
  z.string().min(1).max(max).transform(stripHtml)

// §8 — open-string user-domain enums.
// Lowercase convention (W21-BUG-A): transform to lowercase on ingress so
// a client sending 'High' or 'PENDING' doesn't crash the writer.
const AuditTypeField    = z.string().min(1).max(100).transform((s) => s.toLowerCase())
const AuditStatusField  = z.string().min(1).max(50).transform((s) => s.toLowerCase())
const AuditPriorityField = z.string().min(1).max(50).transform((s) => s.toLowerCase())
const AuditCategoryField = z.string().min(1).max(200)
const AuditFrequencyField = z.string().min(1).max(100)

// Storage-schema enums (not user-configurable) — kept closed.
const DocType = z.enum(['pdf', 'image', 'doc'])
const TaskStatus = z.enum(['pending', 'in_progress', 'completed', 'overdue'])

// ---------- audits ------------------------------------------------------------

export const CreateAuditSchema = z
  .object({
    title: PlainTextMin(500),
    description: PlainText(10_000).optional(),
    type: AuditTypeField,
    framework_ids: z.array(z.string().min(1)).optional(),
    category: AuditCategoryField.optional(),
    priority: AuditPriorityField.optional(),
    due_date: DateString,
    assignee_id: Uuid.optional(),
    frequency: AuditFrequencyField.optional(),
    review_schedule: z.record(z.string(), z.unknown()).optional(),
  })
  // SEC-8: reject unknown keys with a clean 400 at the validation boundary.
  .strict()
export type CreateAuditInput = z.infer<typeof CreateAuditSchema>

// P2 / HANI-3: hand-written default-free Update schema. NEVER .partial(Create).
// .nullable() on every clearable optional column so the client can NULL it out.
export const UpdateAuditSchema = z
  .object({
    title: PlainTextMin(500).optional(),
    description: PlainText(10_000).nullable().optional(),
    type: AuditTypeField.optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    category: AuditCategoryField.nullable().optional(),
    priority: AuditPriorityField.nullable().optional(),
    due_date: DateString.optional(),
    assignee_id: Uuid.nullable().optional(),
    frequency: AuditFrequencyField.nullable().optional(),
    review_schedule: z.record(z.string(), z.unknown()).nullable().optional(),
    status: AuditStatusField.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    closed_overdue: z.boolean().optional(),
    completed_at: DateString.nullable().optional(),
  })
  .strict()
export type UpdateAuditInput = z.infer<typeof UpdateAuditSchema>

export const ListAuditsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.string().optional(),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
  priority: z.string().optional(),
  assignee_id: Uuid.optional(),
  type: z.string().optional(),
  q: z.string().max(200).optional(),
})
export type ListAuditsQuery = z.infer<typeof ListAuditsQuerySchema>

// ---------- audit tasks -------------------------------------------------------

export const CreateAuditTaskSchema = z
  .object({
    title: PlainTextMin(500),
    description: PlainText(10_000).optional(),
    assignee_id: Uuid.optional(),
    priority: AuditPriorityField.optional(),
    due_date: DateString.optional(),
    severity: z.string().min(1).max(50).optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type CreateAuditTaskInput = z.infer<typeof CreateAuditTaskSchema>

export const UpdateAuditTaskSchema = z
  .object({
    title: PlainTextMin(500).optional(),
    description: PlainText(10_000).nullable().optional(),
    assignee_id: Uuid.nullable().optional(),
    priority: AuditPriorityField.nullable().optional(),
    due_date: DateString.nullable().optional(),
    severity: z.string().min(1).max(50).nullable().optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    status: TaskStatus.optional(),
    completed: z.boolean().optional(),
  })
  .strict()
export type UpdateAuditTaskInput = z.infer<typeof UpdateAuditTaskSchema>

// ---------- audit documents ---------------------------------------------------

export const RegisterAuditDocumentSchema = z
  .object({
    name: PlainTextMin(500),
    type: DocType,
    storage_path: z.string().min(1).max(1024),
  })
  .strict()
export type RegisterAuditDocumentInput = z.infer<typeof RegisterAuditDocumentSchema>

// ---------- audit team members -----------------------------------------------

export const AddAuditTeamMemberSchema = z
  .object({
    user_id: Uuid,
    // `name` is accepted for symmetry with client store shape but not persisted
    // server-side (name is read from profiles table).
    name: PlainText(200).optional(),
    role: PlainText(100).optional(),
    is_owner: z.boolean().optional(),
  })
  .strict()
export type AddAuditTeamMemberInput = z.infer<typeof AddAuditTeamMemberSchema>

// ---------- audit comments ---------------------------------------------------

export const CreateAuditCommentSchema = z
  .object({
    content: PlainTextMin(50_000),
  })
  .strict()
export type CreateAuditCommentInput = z.infer<typeof CreateAuditCommentSchema>

export const UpdateAuditCommentSchema = z
  .object({
    content: PlainTextMin(50_000),
  })
  .strict()
export type UpdateAuditCommentInput = z.infer<typeof UpdateAuditCommentSchema>

// ---------- audit templates ---------------------------------------------------

export const CreateAuditTemplateSchema = z
  .object({
    name: PlainTextMin(200),
    name_ar: PlainText(200).optional(),
    // audit_type stays open-string — templates support user-defined framework types.
    audit_type: z.string().min(1).max(100),
    category: z.string().min(1),
    priority: AuditPriorityField.optional(),
    frequency: z.string().default('annual'),
    frequency_schedule: z.record(z.string(), z.unknown()).optional(),
    default_title: PlainTextMin(500),
    default_title_ar: PlainText(500).optional(),
    default_description: PlainTextMin(10_000),
    default_description_ar: PlainText(10_000).optional(),
    default_checklist_items: z.array(z.string()).default([]),
    default_team_roles: z.array(z.string()).default([]),
    framework: z.string().optional(),
    status: z.enum(['active', 'archived']).default('active'),
  })
  .strict()
export type CreateAuditTemplateInput = z.infer<typeof CreateAuditTemplateSchema>

// P2: hand-written Update schema for templates; never .partial(Create).
export const UpdateAuditTemplateSchema = z
  .object({
    name: PlainTextMin(200).optional(),
    name_ar: PlainText(200).nullable().optional(),
    audit_type: z.string().min(1).max(100).optional(),
    category: z.string().min(1).optional(),
    priority: AuditPriorityField.nullable().optional(),
    frequency: z.string().optional(),
    frequency_schedule: z.record(z.string(), z.unknown()).nullable().optional(),
    default_title: PlainTextMin(500).optional(),
    default_title_ar: PlainText(500).nullable().optional(),
    default_description: PlainTextMin(10_000).optional(),
    default_description_ar: PlainText(10_000).nullable().optional(),
    default_checklist_items: z.array(z.string()).optional(),
    default_team_roles: z.array(z.string()).optional(),
    framework: z.string().nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
export type UpdateAuditTemplateInput = z.infer<typeof UpdateAuditTemplateSchema>

// ---------- audit categories --------------------------------------------------

export const CreateAuditCategorySchema = z
  .object({
    key: z.string().min(1).max(100),
    name_en: PlainTextMin(200),
    name_ar: PlainTextMin(200),
    is_default: z.boolean().default(false),
  })
  .strict()
export type CreateAuditCategoryInput = z.infer<typeof CreateAuditCategorySchema>

// P2: hand-written Update schema for categories; never .partial(Create).
export const UpdateAuditCategorySchema = z
  .object({
    key: z.string().min(1).max(100).optional(),
    name_en: PlainTextMin(200).optional(),
    name_ar: PlainTextMin(200).optional(),
    is_default: z.boolean().optional(),
  })
  .strict()
export type UpdateAuditCategoryInput = z.infer<typeof UpdateAuditCategorySchema>
