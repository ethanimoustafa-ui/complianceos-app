// Wave-18 — Zod schemas for the policies resource family, hardened to the
// Rules-page pattern (PORTING-TEMPLATE §2 countermeasures 3/4/5/15/16).
//
// Tables (per migration 007_policies_circulars.sql, 053, 054):
//   policies, policy_versions, policy_workflow_steps, policy_activity_log,
//   policy_attachments, policy_evidence, policy_review_cycles, policy_templates.
// Also: policy_categories (system lookup, migration 003).

import { z } from 'zod'
import { isSafeHttpUrl, stripHtml } from '../sanitize'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// SEC-4: a plain-text field — strips ALL HTML/event-handler markup server-side
// (defence-in-depth, never trust the client). `.transform(stripHtml)` runs
// after the length checks so an attacker can't smuggle an oversized payload
// that only shrinks below the limit after stripping.
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

const PolicyStatus = z.enum([
  'draft',
  'under-review',
  'approved',
  'expired',
  'overdue',
  'requires-review',
])
// PolicyCategory and PolicyApprovalTier are open strings — users add custom
// categories via Settings → Policy Categories, and approval tiers vary by
// organization. Validation is non-empty + length-bound only.
const PolicyCategory = z.string().min(1).max(100)
const PolicyApprovalTier = z.string().min(1).max(100)
const WorkflowStepStatus = z.enum(['completed', 'current', 'pending'])
const WorkflowStepState = z.enum(['pending-approval', 'awaiting-response', 'awaiting-manager'])

// ---------- policies top-level -----------------------------------------------

// Wave-19 / Q1 — `ref_code` is server-generated from the policy `name` via
// `refCodeSlug` + sequence (`{SLUG}-{YYYY}-{NNNN}`). The client never supplies
// it; the field is intentionally absent from CreatePolicySchema. See
// `src/lib/api/services/refcode.ts`.
export const CreatePolicySchema = z
  .object({
    // SEC-4: plain-text — strip HTML server-side.
    name: PlainTextMin(500),
    description: PlainTextMin(10_000),
    category: PolicyCategory,
    // No `.default('v1.0')` here: keeping defaults out of Create avoids accidental
    // leak via `.partial()`-style update derivations. Callers pass it explicitly.
    version: z.string().min(1).max(50).optional(),
    approval_tier: PolicyApprovalTier,
    owner_id: Uuid.optional(),
    owner_name: PlainText(200).optional(),
    owner_department: PlainText(200).optional(),
    business_owner_department_id: Uuid.optional(),
    last_review_date: DateString.optional(),
    next_review_date: DateString.optional(),
    review_cycle_days: z.number().int().min(1).max(3650).optional(),
    approved_date: DateString.optional(),
    review_schedule: z.record(z.string(), z.unknown()).optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    affected_departments: z.array(z.string().min(1)).optional(),
  })
  // SEC-8: reject unknown keys (`org_id`, `is_admin`, `owner_id`, `role`, …)
  // with a clean 400 at the validation boundary instead of letting them reach
  // the DB and surface as a 500.
  .strict()
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>

// HANI-3 / P2: hand-written default-free Update schema. `.partial()` would
// keep inner `.default(...)`s — a PATCH that omits a field would silently
// inject a default, wiping the DB row's real value. Update fields stay
// optional, no defaults; `.nullable()` on clearable optional columns so the
// client can send `null` to NULL the column when the user clears the field.
export const UpdatePolicySchema = z
  .object({
    name: PlainTextMin(500).optional(),
    description: PlainTextMin(10_000).optional(),
    category: PolicyCategory.optional(),
    version: z.string().min(1).max(50).optional(),
    approval_tier: PolicyApprovalTier.optional(),
    owner_id: Uuid.nullable().optional(),
    owner_name: PlainText(200).nullable().optional(),
    owner_department: PlainText(200).nullable().optional(),
    business_owner_department_id: Uuid.nullable().optional(),
    last_review_date: DateString.nullable().optional(),
    next_review_date: DateString.nullable().optional(),
    review_cycle_days: z.number().int().min(1).max(3650).optional(),
    approved_date: DateString.nullable().optional(),
    status: PolicyStatus.optional(),
    review_schedule: z.record(z.string(), z.unknown()).nullable().optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    affected_departments: z.array(z.string().min(1)).optional(),
    current_review_cycle_id: z.string().max(200).nullable().optional(),
    current_review_cycle_label: PlainText(200).nullable().optional(),
    current_review_cycle_date: DateString.nullable().optional(),
  })
  // SEC-8: reject unknown keys.
  .strict()
export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>

export const ListPoliciesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  id: Uuid.optional(),
  status: PolicyStatus.optional(),
  category: PolicyCategory.optional(),
  approval_tier: PolicyApprovalTier.optional(),
  framework_id: z.string().optional(),
  owner_department_id: Uuid.optional(),
  leader_id: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListPoliciesQuery = z.infer<typeof ListPoliciesQuerySchema>

// ---------- versions ---------------------------------------------------------

export const PublishPolicyVersionSchema = z
  .object({
    version: z.string().min(1).max(50),
    date: DateString,
    author: PlainTextMin(200),
    changes: PlainTextMin(10_000),
  })
  .strict()
export type PublishPolicyVersionInput = z.infer<typeof PublishPolicyVersionSchema>

// ---------- workflow ---------------------------------------------------------

export const CreatePolicyWorkflowStepSchema = z
  .object({
    // SEC-4: plain-text fields — strip HTML server-side.
    step: PlainTextMin(200),
    description: PlainText(2_000).optional(),
    action_type: z.string().max(100).optional(),
    step_state: WorkflowStepState.optional(),
    // SEC-11 / GAP-12: server-authoritative MAX+1; the route ignores client values.
    sort_order: z.number().int().min(0).optional(),
    // P1: optional deadline for the step (YYYY-MM-DD).
    deadline: DateString.nullable().optional(),
  })
  .strict()
export type CreatePolicyWorkflowStepInput = z.infer<typeof CreatePolicyWorkflowStepSchema>

export const AdvancePolicyWorkflowSchema = z
  .object({
    /** action key — `submit-for-review`, `approve`, `undo`, `initiate-review`. */
    action: z.enum(['submit-for-review', 'approve', 'undo', 'initiate-review']),
    step_id: Uuid.optional(),
    note: PlainText(5_000).optional(),
    user_name: PlainText(200).optional(),
  })
  .strict()
export type AdvancePolicyWorkflowInput = z.infer<typeof AdvancePolicyWorkflowSchema>

export const SetPhaseDeadlineSchema = z
  .object({
    step_id: Uuid,
    deadline: DateString.nullable(),
  })
  .strict()
export type SetPhaseDeadlineInput = z.infer<typeof SetPhaseDeadlineSchema>

// ---------- policy_workflow_steps PATCH ------------------------------------

// HANI-3 / P2: default-free Update. `.nullable()` on every clearable column.
export const UpdatePolicyWorkflowStepSchema = z
  .object({
    step: PlainTextMin(200).optional(),
    description: PlainText(2_000).nullable().optional(),
    action_type: z.string().max(100).nullable().optional(),
    step_state: WorkflowStepState.nullable().optional(),
    status: WorkflowStepStatus.optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
    note: PlainText(5_000).nullable().optional(),
    date: DateString.nullable().optional(),
    user_name: PlainText(200).nullable().optional(),
  })
  .strict()
export type UpdatePolicyWorkflowStepInput = z.infer<typeof UpdatePolicyWorkflowStepSchema>

// ---------- policy attachments --------------------------------------------

export const CreatePolicyAttachmentSchema = z
  .object({
    // SEC-4 + SEC-10: strip HTML; the route additionally reduces this to a
    // safe basename (path-traversal defence) before persistence.
    name: PlainTextMin(500),
    storage_path: z.string().min(1).max(15_000_000),
    size: z.coerce.number().int().min(0).optional(),
  })
  .strict()
export type CreatePolicyAttachmentInput = z.infer<typeof CreatePolicyAttachmentSchema>

// Attachments are immutable (name/storage); only DELETE is exposed. No
// UpdatePolicyAttachmentSchema needed.

// ---------- policy evidence -----------------------------------------------

export const CreatePolicyEvidenceSchema = z
  .object({
    name: PlainTextMin(500),
    storage_path: z.string().min(1).max(15_000_000),
    review_cycle_id: z.string().min(1).max(200),
    review_cycle_label: PlainTextMin(200),
    notes: PlainText(5_000).optional(),
  })
  .strict()
export type CreatePolicyEvidenceInput = z.infer<typeof CreatePolicyEvidenceSchema>

export const UpdatePolicyEvidenceSchema = z
  .object({
    name: PlainTextMin(500).optional(),
    notes: PlainText(5_000).nullable().optional(),
  })
  .strict()
export type UpdatePolicyEvidenceInput = z.infer<typeof UpdatePolicyEvidenceSchema>

// ---------- policy review cycles ------------------------------------------

export const CreatePolicyReviewCycleSchema = z
  .object({
    label: PlainTextMin(200),
    initiated_at: z.string().optional(),
  })
  .strict()
export type CreatePolicyReviewCycleInput = z.infer<typeof CreatePolicyReviewCycleSchema>

export const UpdatePolicyReviewCycleSchema = z
  .object({
    label: PlainTextMin(200).optional(),
  })
  .strict()
export type UpdatePolicyReviewCycleInput = z.infer<typeof UpdatePolicyReviewCycleSchema>

// ---------- policy templates -------------------------------------------------

export const CreatePolicyTemplateSchema = z.object({
  name: PlainTextMin(200),
  name_ar: PlainText(200).optional(),
  category: z.string().min(1).max(100),
  approval_tier: z.string().min(1).max(100),
  frequency: z.string().max(100).optional(),
  frequency_schedule: z.record(z.string(), z.unknown()).optional(),
  default_description: PlainTextMin(10_000),
  default_description_ar: PlainText(10_000).optional(),
  default_workflow_steps: z.array(z.record(z.string(), z.unknown())).default([]),
  version_pattern: z.string().max(100).default('v{major}.{minor}'),
  framework: z.string().max(100).optional(),
  status: z.enum(['active', 'archived']).default('active'),
})
export type CreatePolicyTemplateInput = z.infer<typeof CreatePolicyTemplateSchema>

export const UpdatePolicyTemplateSchema = CreatePolicyTemplateSchema.partial()
export type UpdatePolicyTemplateInput = z.infer<typeof UpdatePolicyTemplateSchema>

// ---------- policy categories ------------------------------------------------

export const CreatePolicyCategorySchema = z.object({
  key: z.string().min(1).max(100),
  name_en: PlainTextMin(200),
  name_ar: PlainTextMin(200),
  is_default: z.boolean().default(false),
})
export type CreatePolicyCategoryInput = z.infer<typeof CreatePolicyCategorySchema>

export const UpdatePolicyCategorySchema = CreatePolicyCategorySchema.partial()
export type UpdatePolicyCategoryInput = z.infer<typeof UpdatePolicyCategorySchema>

// Re-export for workflow-step constants
export const PolicyWorkflowStepStatus = WorkflowStepStatus
export const PolicyWorkflowStepState = WorkflowStepState
