// Zod schemas for the SAMA letters resource family (and its templates/types/
// sub-categories/authority-departments lookups). The same family generalises
// to other authorities (CMA, IA) via `letters.authority` FK to frameworks.
//
// Wave-21 hardening applied:
//   - `.strict()` on every Create/Update schema (SEC-8 — unknown-key rejection)
//   - Hand-written UpdateLetterSchema (NEVER `CreateSchema.partial()` — P2/HANI-3)
//   - `PlainText` / `PlainTextMin` helpers strip HTML at parse time (SEC-4)
//   - `HttpUrl` helper rejects non-http(s) URLs (SEC-3)
//   - No `.default()` in Update schema (P2 — default-leak through partial)

import { z } from 'zod'
import { isSafeHttpUrl, stripHtml } from '../sanitize'

// ---------- scalar helpers --------------------------------------------------

const Uuid = z.string().uuid()
const IsoDateTime = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid datetime' })

// SEC-4: strip HTML tags at the Zod layer. `.transform(stripHtml)` runs AFTER
// the length check so oversized payloads are rejected before touching the DB.
const PlainText = (max: number) => z.string().max(max).transform(stripHtml)
const PlainTextMin = (max: number) =>
  z.string().min(1).max(max).transform(stripHtml)

// SEC-3: only `http`/`https` URLs are allowed. The empty-string branch lets
// callers omit the field with `''`; callers that want to REQUIRE a URL use
// `.min(1)` separately.
const HttpUrl = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => s.length === 0 || isSafeHttpUrl(s), {
      message: 'Only http/https URLs are allowed',
    })

// ---------- letters ----------------------------------------------------------

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

export const CreateLetterSchema = z
  .object({
    // W24-2 fix: normalise to lowercase before the DB insert so that
    // `authority:'SAMA'` hits the frameworks FK (which stores lowercase ids)
    // instead of crashing with a FK violation → 500. Decision: normalise +
    // accept either case (vs. rejecting uppercase with 400) so the API is
    // lenient for callers that capitalise authority codes.
    authority: z.string().min(1).max(100).transform((s) => s.toLowerCase()),
    type: z.string().min(1).max(100), // letter type key — e.g. 'non-objection','inquiry','submission','notification'
    sub_category: PlainText(200).optional(),
    sama_department: PlainText(200).optional(),
    subject: PlainTextMin(2_000),
    subject_ar: PlainText(2_000).optional(),
    body: PlainTextMin(50_000),
    body_ar: PlainText(50_000).optional(),
    priority: z.enum(['standard', 'urgent']),
    assigned_to: Uuid.optional(),
    recipient_name: PlainText(200).optional(),
    recipient_org: PlainText(200).optional(),
    recipient_city: PlainText(200).optional(),
    recipient_name_ar: PlainText(200).optional(),
    recipient_org_ar: PlainText(200).optional(),
    recipient_city_ar: PlainText(200).optional(),
    signer_name: PlainText(200).optional(),
    signer_title: PlainText(200).optional(),
    signer_name_ar: PlainText(200).optional(),
    signer_title_ar: PlainText(200).optional(),
    // SEC-3: signature_image_url must be http/https
    signature_image_url: HttpUrl(2_000).optional(),
    framework_ids: z.array(z.string().min(1)),
    placeholder_defs: z.array(PlaceholderDef),
    placeholder_values: z.record(z.string(), PlaceholderValue),
    /** Optional template id whose `usage_count` should be incremented. */
    template_id: Uuid.optional(),
  })
  .strict()
export type CreateLetterInput = z.infer<typeof CreateLetterSchema>

// Hand-written Update schema — NEVER `CreateLetterSchema.partial()`.
// Reasons: (1) `.partial()` propagates `.default()` values so an omitted field
// gets the default injected and writes it (P2/HANI-3). (2) Update allows
// `status` transitions that Create does not. (3) Every field is independently
// nullable or optional without dragging along Create-only validation.
export const UpdateLetterSchema = z
  .object({
    // W24-2 fix: same lowercase normalisation as CreateLetterSchema.
    authority: z.string().min(1).max(100).transform((s) => s.toLowerCase()).optional(),
    type: z.string().min(1).max(100).optional(),
    sub_category: PlainText(200).nullable().optional(),
    sama_department: PlainText(200).nullable().optional(),
    subject: PlainTextMin(2_000).optional(),
    subject_ar: PlainText(2_000).nullable().optional(),
    body: PlainTextMin(50_000).optional(),
    body_ar: PlainText(50_000).nullable().optional(),
    priority: z.enum(['standard', 'urgent']).optional(),
    assigned_to: Uuid.nullable().optional(),
    status: z
      .enum([
        'draft',
        'pending-approval',
        'approved',
        'sent',
        'response-received',
        'overdue',
      ])
      .optional(),
    recipient_name: PlainText(200).nullable().optional(),
    recipient_org: PlainText(200).nullable().optional(),
    recipient_city: PlainText(200).nullable().optional(),
    recipient_name_ar: PlainText(200).nullable().optional(),
    recipient_org_ar: PlainText(200).nullable().optional(),
    recipient_city_ar: PlainText(200).nullable().optional(),
    signer_name: PlainText(200).nullable().optional(),
    signer_title: PlainText(200).nullable().optional(),
    signer_name_ar: PlainText(200).nullable().optional(),
    signer_title_ar: PlainText(200).nullable().optional(),
    signature_image_url: HttpUrl(2_000).nullable().optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    placeholder_defs: z.array(PlaceholderDef).optional(),
    placeholder_values: z.record(z.string(), PlaceholderValue).optional(),
    response_deadline: IsoDateTime.nullable().optional(),
  })
  .strict()
export type UpdateLetterInput = z.infer<typeof UpdateLetterSchema>

export const ListLettersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum([
      'draft',
      'pending-approval',
      'approved',
      'sent',
      'response-received',
      'overdue',
    ])
    .optional(),
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

export const RegisterLetterAttachmentSchema = z
  .object({
    name: PlainTextMin(500),
    storage_path: z.string().min(1).max(2_000),
    type: z.string().max(120).optional(),
    size: z.number().int().min(0).optional(),
  })
  .strict()
export type RegisterLetterAttachmentInput = z.infer<typeof RegisterLetterAttachmentSchema>

// ---------- approval actions ------------------------------------------------

export const ApproveStepSchema = z
  .object({
    step_index: z.coerce.number().int().min(1).max(3),
    notes: PlainText(5_000).optional(),
  })
  .strict()
export type ApproveStepInput = z.infer<typeof ApproveStepSchema>

export const RejectStepSchema = z
  .object({
    step_index: z.coerce.number().int().min(1).max(3),
    reason: PlainTextMin(5_000),
  })
  .strict()
export type RejectStepInput = z.infer<typeof RejectStepSchema>

// ---------- placeholder update ----------------------------------------------

export const UpdatePlaceholdersSchema = z
  .object({
    placeholder_values: z.record(z.string(), PlaceholderValue),
  })
  .strict()
export type UpdatePlaceholdersInput = z.infer<typeof UpdatePlaceholdersSchema>

// ---------- templates -------------------------------------------------------

export const CreateLetterTemplateSchema = z
  .object({
    name: PlainTextMin(200),
    type: z.string().min(1).max(100),
    icon: z.string().max(100).optional(),
    color: z.string().max(50).optional(),
    description: PlainText(2_000).optional(),
    status: z.enum(['active', 'archived']),
    default_subject_en: PlainText(2_000).optional(),
    default_subject_ar: PlainText(2_000).optional(),
    default_body_en: PlainText(50_000).optional(),
    default_body_ar: PlainText(50_000).optional(),
    default_signer_name: PlainText(200).optional(),
    default_signer_title: PlainText(200).optional(),
    default_signer_name_ar: PlainText(200).optional(),
    default_signer_title_ar: PlainText(200).optional(),
    default_signature_image_url: HttpUrl(2_000).optional(),
    default_sama_department: PlainText(200).optional(),
    default_recipient_name: PlainText(200).optional(),
    default_recipient_org: PlainText(200).optional(),
    default_recipient_city: PlainText(200).optional(),
    default_recipient_name_ar: PlainText(200).optional(),
    default_recipient_org_ar: PlainText(200).optional(),
    default_recipient_city_ar: PlainText(200).optional(),
    placeholder_defs: z.array(PlaceholderDef),
  })
  .strict()
export type CreateLetterTemplateInput = z.infer<typeof CreateLetterTemplateSchema>

// Hand-written Update — no `.partial()` of Create.
export const UpdateLetterTemplateSchema = z
  .object({
    name: PlainTextMin(200).optional(),
    type: z.string().min(1).max(100).optional(),
    icon: z.string().max(100).nullable().optional(),
    color: z.string().max(50).nullable().optional(),
    description: PlainText(2_000).nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
    default_subject_en: PlainText(2_000).nullable().optional(),
    default_subject_ar: PlainText(2_000).nullable().optional(),
    default_body_en: PlainText(50_000).nullable().optional(),
    default_body_ar: PlainText(50_000).nullable().optional(),
    default_signer_name: PlainText(200).nullable().optional(),
    default_signer_title: PlainText(200).nullable().optional(),
    default_signer_name_ar: PlainText(200).nullable().optional(),
    default_signer_title_ar: PlainText(200).nullable().optional(),
    default_signature_image_url: HttpUrl(2_000).nullable().optional(),
    default_sama_department: PlainText(200).nullable().optional(),
    default_recipient_name: PlainText(200).nullable().optional(),
    default_recipient_org: PlainText(200).nullable().optional(),
    default_recipient_city: PlainText(200).nullable().optional(),
    default_recipient_name_ar: PlainText(200).nullable().optional(),
    default_recipient_org_ar: PlainText(200).nullable().optional(),
    default_recipient_city_ar: PlainText(200).nullable().optional(),
    placeholder_defs: z.array(PlaceholderDef).optional(),
  })
  .strict()
export type UpdateLetterTemplateInput = z.infer<typeof UpdateLetterTemplateSchema>

// ---------- letter types lookup --------------------------------------------

export const CreateLetterTypeSchema = z
  .object({
    key: z.string().min(1).max(100),
    name_en: PlainTextMin(200),
    name_ar: PlainTextMin(200),
    is_default: z.boolean(),
  })
  .strict()
export type CreateLetterTypeInput = z.infer<typeof CreateLetterTypeSchema>

export const UpdateLetterTypeSchema = z
  .object({
    key: z.string().min(1).max(100).optional(),
    name_en: PlainTextMin(200).optional(),
    name_ar: PlainTextMin(200).optional(),
    is_default: z.boolean().optional(),
  })
  .strict()
export type UpdateLetterTypeInput = z.infer<typeof UpdateLetterTypeSchema>

// ---------- framework sub-categories lookup --------------------------------

export const CreateLetterSubCategorySchema = z
  .object({
    framework_id: z.string().min(1).max(100),
    key: z.string().min(1).max(100),
    name_en: PlainTextMin(200),
    name_ar: PlainTextMin(200),
    is_default: z.boolean(),
  })
  .strict()
export type CreateLetterSubCategoryInput = z.infer<typeof CreateLetterSubCategorySchema>

export const UpdateLetterSubCategorySchema = z
  .object({
    framework_id: z.string().min(1).max(100).optional(),
    key: z.string().min(1).max(100).optional(),
    name_en: PlainTextMin(200).optional(),
    name_ar: PlainTextMin(200).optional(),
    is_default: z.boolean().optional(),
  })
  .strict()
export type UpdateLetterSubCategoryInput = z.infer<typeof UpdateLetterSubCategorySchema>

// ---------- authority departments lookup ----------------------------------

export const CreateAuthorityDepartmentSchema = z
  .object({
    authority_id: z.string().min(1).max(100),
    name_en: PlainTextMin(200),
    name_ar: PlainTextMin(200),
    email: z.string().email().max(320).optional(),
    is_seed: z.boolean(),
  })
  .strict()
export type CreateAuthorityDepartmentInput = z.infer<typeof CreateAuthorityDepartmentSchema>

export const UpdateAuthorityDepartmentSchema = z
  .object({
    authority_id: z.string().min(1).max(100).optional(),
    name_en: PlainTextMin(200).optional(),
    name_ar: PlainTextMin(200).optional(),
    email: z.string().email().max(320).nullable().optional(),
    is_seed: z.boolean().optional(),
  })
  .strict()
export type UpdateAuthorityDepartmentInput = z.infer<typeof UpdateAuthorityDepartmentSchema>
