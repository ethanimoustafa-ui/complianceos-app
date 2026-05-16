// Zod schemas for the policies resource family.
//
// Tables (per migration 007_policies_circulars.sql):
//   policies, policy_versions, policy_workflow_steps, policy_activity_log,
//   policy_attachments, policy_evidence, policy_review_cycles, policy_templates.
// Also: policy_categories (system lookup, migration 003).

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

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

export const CreatePolicySchema = z.object({
  ref_code: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  description: z.string().min(1).max(10_000),
  category: PolicyCategory,
  version: z.string().min(1).max(50).default('v1.0'),
  approval_tier: PolicyApprovalTier,
  owner_id: Uuid.optional(),
  owner_name: z.string().max(200).optional(),
  owner_department: z.string().max(200).optional(),
  business_owner_department_id: Uuid.optional(),
  last_review_date: DateString.optional(),
  next_review_date: DateString.optional(),
  review_cycle_days: z.number().int().min(1).max(3650).default(365),
  approved_date: DateString.optional(),
  review_schedule: z.record(z.string(), z.unknown()).optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
  affected_departments: z.array(z.string().min(1)).default([]),
})
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>

export const UpdatePolicySchema = CreatePolicySchema.partial().extend({
  status: PolicyStatus.optional(),
  current_review_cycle_id: z.string().max(200).optional(),
  current_review_cycle_label: z.string().max(200).optional(),
  current_review_cycle_date: DateString.optional(),
})
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

export const PublishPolicyVersionSchema = z.object({
  version: z.string().min(1).max(50),
  date: DateString,
  author: z.string().min(1).max(200),
  changes: z.string().min(1).max(10_000),
})
export type PublishPolicyVersionInput = z.infer<typeof PublishPolicyVersionSchema>

// ---------- workflow ---------------------------------------------------------

export const CreatePolicyWorkflowStepSchema = z.object({
  step: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  action_type: z.string().max(100).optional(),
  step_state: WorkflowStepState.optional(),
  sort_order: z.number().int().min(0).optional(),
})
export type CreatePolicyWorkflowStepInput = z.infer<typeof CreatePolicyWorkflowStepSchema>

export const AdvancePolicyWorkflowSchema = z.object({
  /** action key — `submit-for-review`, `approve`, `undo`, `initiate-review`. */
  action: z.enum(['submit-for-review', 'approve', 'undo', 'initiate-review']),
  step_id: Uuid.optional(),
  note: z.string().max(5_000).optional(),
  user_name: z.string().max(200).optional(),
})
export type AdvancePolicyWorkflowInput = z.infer<typeof AdvancePolicyWorkflowSchema>

export const SetPhaseDeadlineSchema = z.object({
  step_id: Uuid,
  deadline: DateString.nullable(),
})
export type SetPhaseDeadlineInput = z.infer<typeof SetPhaseDeadlineSchema>

// ---------- policy templates -------------------------------------------------

export const CreatePolicyTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  category: z.string().min(1).max(100),
  approval_tier: z.string().min(1).max(100),
  frequency: z.string().max(100).optional(),
  frequency_schedule: z.record(z.string(), z.unknown()).optional(),
  default_description: z.string().min(1).max(10_000),
  default_description_ar: z.string().max(10_000).optional(),
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
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreatePolicyCategoryInput = z.infer<typeof CreatePolicyCategorySchema>

export const UpdatePolicyCategorySchema = CreatePolicyCategorySchema.partial()
export type UpdatePolicyCategoryInput = z.infer<typeof UpdatePolicyCategorySchema>

// Re-export for workflow-step constants
export const PolicyWorkflowStepStatus = WorkflowStepStatus
export const PolicyWorkflowStepState = WorkflowStepState
