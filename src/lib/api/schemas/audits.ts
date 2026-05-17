// Zod schemas for the audits resource family.
//
// One file per resource; Stage B agents should mirror this structure under
// `src/lib/api/schemas/<resource>.ts`.

import { z } from 'zod'

// ---------- shared scalars ----------------------------------------------------

const AuditType = z.enum(['internal', 'sama', 'sharia'])
const AuditStatus = z.enum(['pending', 'in_progress', 'completed', 'overdue'])
const Priority = z.enum(['low', 'medium', 'high', 'critical'])
const TaskStatus = z.enum(['pending', 'in_progress', 'completed', 'overdue'])
const DocType = z.enum(['pdf', 'image', 'doc'])

const Uuid = z.string().uuid()
// HTML date inputs send YYYY-MM-DD. Accept either an ISO string or that form.
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// ---------- audits ------------------------------------------------------------

export const CreateAuditSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  type: AuditType,
  framework_ids: z.array(z.string().min(1)).default([]),
  category: z.string().min(1).optional(),
  priority: Priority.default('medium'),
  due_date: DateString,
  assignee_id: Uuid.optional(),
  frequency: z.string().optional(),
  review_schedule: z.record(z.string(), z.unknown()).optional(),
})
export type CreateAuditInput = z.infer<typeof CreateAuditSchema>

export const UpdateAuditSchema = CreateAuditSchema.partial().extend({
  status: AuditStatus.optional(),
  progress: z.number().int().min(0).max(100).optional(),
})
export type UpdateAuditInput = z.infer<typeof UpdateAuditSchema>

export const ListAuditsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: AuditStatus.optional(),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
  priority: Priority.optional(),
  assignee_id: Uuid.optional(),
  type: AuditType.optional(),
  q: z.string().max(200).optional(),
})
export type ListAuditsQuery = z.infer<typeof ListAuditsQuerySchema>

// ---------- audit tasks -------------------------------------------------------

export const CreateAuditTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  assignee_id: Uuid.optional(),
  priority: Priority.default('medium'),
  due_date: DateString.optional(),
  severity: z.string().optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateAuditTaskInput = z.infer<typeof CreateAuditTaskSchema>

export const UpdateAuditTaskSchema = CreateAuditTaskSchema.partial().extend({
  status: TaskStatus.optional(),
  completed: z.boolean().optional(),
})
export type UpdateAuditTaskInput = z.infer<typeof UpdateAuditTaskSchema>

// ---------- audit documents ---------------------------------------------------

export const RegisterAuditDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  type: DocType,
  storage_path: z.string().min(1).max(1024),
})
export type RegisterAuditDocumentInput = z.infer<typeof RegisterAuditDocumentSchema>

// ---------- audit team members -----------------------------------------------

export const AddAuditTeamMemberSchema = z.object({
  user_id: Uuid,
  // `name` and `role` accompany the row for display purposes — they are not
  // persisted on `audit_team_members` directly (name is read from profiles),
  // but the role column IS persisted. We accept name for symmetry with the
  // client store shape and ignore it server-side.
  name: z.string().max(200).optional(),
  role: z.string().min(1).max(100).default('Auditor'),
  is_owner: z.boolean().optional(),
})
export type AddAuditTeamMemberInput = z.infer<typeof AddAuditTeamMemberSchema>

// ---------- audit comments ---------------------------------------------------

export const CreateAuditCommentSchema = z.object({
  content: z.string().min(1).max(50_000),
})
export type CreateAuditCommentInput = z.infer<typeof CreateAuditCommentSchema>

export const UpdateAuditCommentSchema = z.object({
  content: z.string().min(1).max(50_000),
})
export type UpdateAuditCommentInput = z.infer<typeof UpdateAuditCommentSchema>

// ---------- audit templates ---------------------------------------------------

export const CreateAuditTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  audit_type: AuditType,
  category: z.string().min(1),
  priority: Priority.default('medium'),
  frequency: z.string().default('annual'),
  frequency_schedule: z.record(z.string(), z.unknown()).optional(),
  default_title: z.string().min(1),
  default_title_ar: z.string().optional(),
  default_description: z.string().min(1),
  default_description_ar: z.string().optional(),
  default_checklist_items: z.array(z.string()).default([]),
  default_team_roles: z.array(z.string()).default([]),
  framework: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
})
export type CreateAuditTemplateInput = z.infer<typeof CreateAuditTemplateSchema>

export const UpdateAuditTemplateSchema = CreateAuditTemplateSchema.partial()
export type UpdateAuditTemplateInput = z.infer<typeof UpdateAuditTemplateSchema>

// ---------- audit categories --------------------------------------------------

export const CreateAuditCategorySchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateAuditCategoryInput = z.infer<typeof CreateAuditCategorySchema>

export const UpdateAuditCategorySchema = CreateAuditCategorySchema.partial()
export type UpdateAuditCategoryInput = z.infer<typeof UpdateAuditCategorySchema>
