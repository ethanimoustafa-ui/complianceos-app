// Zod schemas for the SAMA letters resource family (and its templates/types/
// sub-categories/authority-departments lookups). The same family generalises
// to other authorities (CMA, IA) via `letters.authority` FK to frameworks.

import { z } from 'zod'

// ---------- shared scalars ---------------------------------------------------

const Uuid = z.string().uuid()
const IsoDateTime = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid datetime' })

const LetterStatus = z.enum([
  'draft',
  'pending-approval',
  'approved',
  'sent',
  'response-received',
  'overdue',
])
const LetterPriority = z.enum(['standard', 'urgent'])

// Placeholder shapes mirror types/index.ts. Loose JSON to keep this schema
// service-agnostic — the renderer/validator in services/letters.ts enforces
// stricter shape.
const PlaceholderRefValue = z.object({
  kind: z.enum(['observation', 'audit', 'letter', 'rule', 'policy']),
  id: z.string(),
  reference: z.string(),
  title: z.string(),
})
const PlaceholderValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('date'), value: z.string() }),
  z.object({ type: z.literal('reference'), value: PlaceholderRefValue }),
])
const PlaceholderDef = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  labelAr: z.string().max(200).optional(),
  type: z.enum(['date', 'reference']),
  refKinds: z
    .array(z.enum(['observation', 'audit', 'letter', 'rule', 'policy']))
    .optional(),
})

// ---------- letters ----------------------------------------------------------

export const CreateLetterSchema = z.object({
  authority: z.string().min(1).default('sama'),
  type: z.string().min(1), // letter type key — e.g. 'non-objection','inquiry','submission','notification'
  sub_category: z.string().min(1).optional(),
  sama_department: z.string().min(1).optional(),
  subject: z.string().min(1).max(2_000),
  subject_ar: z.string().max(2_000).optional(),
  body: z.string().min(1).max(50_000),
  body_ar: z.string().max(50_000).optional(),
  priority: LetterPriority.default('standard'),
  assigned_to: Uuid.optional(),
  recipient_name: z.string().max(200).optional(),
  recipient_org: z.string().max(200).optional(),
  recipient_city: z.string().max(200).optional(),
  recipient_name_ar: z.string().max(200).optional(),
  recipient_org_ar: z.string().max(200).optional(),
  recipient_city_ar: z.string().max(200).optional(),
  signer_name: z.string().max(200).optional(),
  signer_title: z.string().max(200).optional(),
  signer_name_ar: z.string().max(200).optional(),
  signer_title_ar: z.string().max(200).optional(),
  signature_image_url: z.string().max(2_000).optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
  placeholder_defs: z.array(PlaceholderDef).default([]),
  placeholder_values: z.record(z.string(), PlaceholderValue).default({}),
  /** Optional template id whose `usage_count` should be incremented. */
  template_id: Uuid.optional(),
})
export type CreateLetterInput = z.infer<typeof CreateLetterSchema>

export const UpdateLetterSchema = CreateLetterSchema.partial().extend({
  status: LetterStatus.optional(),
  response_deadline: IsoDateTime.nullable().optional(),
})
export type UpdateLetterInput = z.infer<typeof UpdateLetterSchema>

export const ListLettersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: LetterStatus.optional(),
  authority: z.string().optional(),
  authority_id: z.string().optional(), // alias for authority
  type: z.string().optional(),
  sub_category: z.string().optional(),
  sama_department: z.string().optional(),
  sender_id: Uuid.optional(),
  assigned_to: Uuid.optional(),
  has_attachments: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  q: z.string().max(200).optional(),
})
export type ListLettersQuery = z.infer<typeof ListLettersQuerySchema>

// ---------- attachments -----------------------------------------------------

export const RegisterLetterAttachmentSchema = z.object({
  name: z.string().min(1).max(500),
  storage_path: z.string().min(1).max(2_000),
  type: z.string().max(120).optional(),
  size: z.number().int().min(0).optional(),
})
export type RegisterLetterAttachmentInput = z.infer<typeof RegisterLetterAttachmentSchema>

// ---------- approval actions ------------------------------------------------

export const ApproveStepSchema = z.object({
  step_index: z.coerce.number().int().min(1).max(3),
  notes: z.string().max(5_000).optional(),
})
export type ApproveStepInput = z.infer<typeof ApproveStepSchema>

export const RejectStepSchema = z.object({
  step_index: z.coerce.number().int().min(1).max(3),
  reason: z.string().min(1).max(5_000),
})
export type RejectStepInput = z.infer<typeof RejectStepSchema>

// ---------- placeholder update ----------------------------------------------

export const UpdatePlaceholdersSchema = z.object({
  placeholder_values: z.record(z.string(), PlaceholderValue),
})
export type UpdatePlaceholdersInput = z.infer<typeof UpdatePlaceholdersSchema>

// ---------- templates -------------------------------------------------------

export const CreateLetterTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  icon: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  description: z.string().max(2_000).optional(),
  status: z.enum(['active', 'archived']).default('active'),
  default_subject_en: z.string().max(2_000).optional(),
  default_subject_ar: z.string().max(2_000).optional(),
  default_body_en: z.string().max(50_000).optional(),
  default_body_ar: z.string().max(50_000).optional(),
  default_signer_name: z.string().max(200).optional(),
  default_signer_title: z.string().max(200).optional(),
  default_signer_name_ar: z.string().max(200).optional(),
  default_signer_title_ar: z.string().max(200).optional(),
  default_signature_image_url: z.string().max(2_000).optional(),
  default_sama_department: z.string().max(200).optional(),
  default_recipient_name: z.string().max(200).optional(),
  default_recipient_org: z.string().max(200).optional(),
  default_recipient_city: z.string().max(200).optional(),
  default_recipient_name_ar: z.string().max(200).optional(),
  default_recipient_org_ar: z.string().max(200).optional(),
  default_recipient_city_ar: z.string().max(200).optional(),
  placeholder_defs: z.array(PlaceholderDef).default([]),
})
export type CreateLetterTemplateInput = z.infer<typeof CreateLetterTemplateSchema>

export const UpdateLetterTemplateSchema = CreateLetterTemplateSchema.partial()
export type UpdateLetterTemplateInput = z.infer<typeof UpdateLetterTemplateSchema>

// ---------- letter types lookup --------------------------------------------

export const CreateLetterTypeSchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateLetterTypeInput = z.infer<typeof CreateLetterTypeSchema>

export const UpdateLetterTypeSchema = CreateLetterTypeSchema.partial()
export type UpdateLetterTypeInput = z.infer<typeof UpdateLetterTypeSchema>

// ---------- framework sub-categories lookup --------------------------------

export const CreateLetterSubCategorySchema = z.object({
  framework_id: z.string().min(1).max(100),
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateLetterSubCategoryInput = z.infer<typeof CreateLetterSubCategorySchema>

export const UpdateLetterSubCategorySchema = CreateLetterSubCategorySchema.partial()
export type UpdateLetterSubCategoryInput = z.infer<typeof UpdateLetterSubCategorySchema>

// ---------- authority departments lookup ----------------------------------

export const CreateAuthorityDepartmentSchema = z.object({
  authority_id: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  email: z.string().email().max(320).optional(),
  is_seed: z.boolean().default(false),
})
export type CreateAuthorityDepartmentInput = z.infer<typeof CreateAuthorityDepartmentSchema>

export const UpdateAuthorityDepartmentSchema = CreateAuthorityDepartmentSchema.partial()
export type UpdateAuthorityDepartmentInput = z.infer<typeof UpdateAuthorityDepartmentSchema>
