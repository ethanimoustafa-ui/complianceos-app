// Zod schemas for the risks resource family.
//
// Tables (per migration 009_risks.sql):
//   risks, risk_mitigation_checklist, risk_department_proposed_plan, risk_history.

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// Open string, not z.enum — categories are user-extensible rows in
// risk_categories (keys like 'cybersecurity-risk'), so a closed enum 400s
// every non-legacy pick. Mirrors audits.ts §8 + migration 095 (DB CHECK is
// length-only for the same reason).
const RiskCategory = z.string().min(1).max(100)
const RiskStatus = z.enum(['identified', 'mitigating', 'accepted', 'resolved'])
const RiskMitigationWorkflowStatus = z.enum([
  'not-started',
  'sent-to-department',
  'plan-proposed',
  'in-progress',
  'resolved',
])

// ---------- risks top-level --------------------------------------------------

export const CreateRiskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10_000),
  category: RiskCategory,
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  owner_id: Uuid.optional(),
  mitigation_plan: z.string().max(10_000).optional(),
  monitoring_frequency: z.string().max(100).default('quarterly'),
  last_review_date: DateString.optional(),
  next_review_date: DateString.optional(),
  review_schedule: z.record(z.string(), z.unknown()).optional(),
  intended_department_id: Uuid.optional(),
  mitigation_deadline: DateString.optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateRiskInput = z.infer<typeof CreateRiskSchema>

export const UpdateRiskSchema = CreateRiskSchema.partial().extend({
  status: RiskStatus.optional(),
  mitigation_progress: z.number().int().min(0).max(100).optional(),
  // CRITICAL: re-declare the two create-schema fields that carry `.default()`.
  // `CreateRiskSchema.partial()` keeps those defaults, so a PATCH that omits
  // `monitoring_frequency` / `framework_ids` would otherwise re-inject
  // 'quarterly' / [] and the route would write them — silently resetting a
  // monthly cadence to quarterly and wiping framework tags on every unrelated
  // edit (mark-reviewed, status change, checklist toggle, title-only edit).
  monitoring_frequency: z.string().max(100).optional(),
  framework_ids: z.array(z.string().min(1)).optional(),
})
export type UpdateRiskInput = z.infer<typeof UpdateRiskSchema>

export const ListRisksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  id: Uuid.optional(),
  status: RiskStatus.optional(),
  category: RiskCategory.optional(),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
  intended_department_id: Uuid.optional(),
  mitigation_workflow_status: RiskMitigationWorkflowStatus.optional(),
  owner_id: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListRisksQuery = z.infer<typeof ListRisksQuerySchema>

// ---------- workflow sub-actions --------------------------------------------

export const AssignRiskDepartmentSchema = z.object({
  intended_department_id: Uuid.nullable(),
})
export type AssignRiskDepartmentInput = z.infer<typeof AssignRiskDepartmentSchema>

export const SetRiskDeadlineSchema = z.object({
  mitigation_deadline: DateString.nullable(),
})
export type SetRiskDeadlineInput = z.infer<typeof SetRiskDeadlineSchema>

export const SubmitRiskPlanSchema = z.object({
  plan: z.string().min(1).max(10_000),
  checklist: z
    .array(
      z.object({
        text: z.string().min(1).max(1_000),
        sort_order: z.number().int().min(0).optional(),
        deadline: DateString.nullable().optional(),
      }),
    )
    .default([]),
})
export type SubmitRiskPlanInput = z.infer<typeof SubmitRiskPlanSchema>

// ---------- mitigation checklist (top-level risk checklist) ------------------

export const CreateRiskChecklistItemSchema = z.object({
  text: z.string().min(1).max(1_000),
  sort_order: z.number().int().min(0).optional(),
  deadline: DateString.nullable().optional(),
})
export type CreateRiskChecklistItemInput = z.infer<typeof CreateRiskChecklistItemSchema>

export const UpdateRiskChecklistItemSchema = z.object({
  text: z.string().min(1).max(1_000).optional(),
  completed: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
  // Nullable so the picker can CLEAR a deadline (send null), distinct from
  // "not provided" (undefined → leave unchanged).
  deadline: DateString.nullable().optional(),
})
export type UpdateRiskChecklistItemInput = z.infer<typeof UpdateRiskChecklistItemSchema>

// ---------- received-plan documents ------------------------------------------

export const RegisterRiskPlanDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  type: z.string().max(50).default('doc'),
  storage_path: z.string().min(1).max(1000),
})
export type RegisterRiskPlanDocumentInput = z.infer<typeof RegisterRiskPlanDocumentSchema>

// ---------- risk categories --------------------------------------------------

export const CreateRiskCategorySchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  color: z.string().max(50).optional(),
  icon: z.string().max(100).optional(),
  is_default: z.boolean().default(false),
})
export type CreateRiskCategoryInput = z.infer<typeof CreateRiskCategorySchema>

export const UpdateRiskCategorySchema = CreateRiskCategorySchema.partial()
export type UpdateRiskCategoryInput = z.infer<typeof UpdateRiskCategorySchema>
