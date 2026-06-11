// Zod schemas for the settings resource family.
//
// Covers: frameworks, framework_config, framework_pins, departments,
// business_units, policy_categories, scale_label_overrides (singleton-ish),
// compliance_settings (singleton), saudization_metrics (singleton), onboarding state.

import { z } from 'zod'

const Uuid = z.string().uuid()
const Lang = z.enum(['en', 'ar'])

// ---------- framework config -------------------------------------------------

export const UpdateFrameworkConfigSchema = z.object({
  enabled: z.boolean().optional(),
  pinned: z.boolean().optional(),
  weight: z.number().int().min(0).max(100).optional(),
  threshold: z.number().int().min(0).max(100).optional(),
  department_id: Uuid.nullable().optional(),
})
export type UpdateFrameworkConfigInput = z.infer<typeof UpdateFrameworkConfigSchema>

export const PinFrameworkSchema = z.object({
  framework_id: z.string().min(1).max(100),
  pin_index: z.number().int().min(1).max(3),
})
export type PinFrameworkInput = z.infer<typeof PinFrameworkSchema>

// ---------- departments ------------------------------------------------------

export const CreateDepartmentSchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
  // Optional contact inbox for "inform the department" mailto actions.
  // Accepts a valid email or null (to clear it). Empty string is coerced to null.
  email: z
    .union([z.string().email().max(320), z.literal(''), z.null()])
    .transform((v) => (v === '' ? null : v))
    .optional(),
})
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().extend({
  // Override the create-schema default: CreateDepartmentSchema.partial() keeps
  // `.default(false)`, so a PATCH omitting is_default would silently re-inject
  // false and un-default a system department. Plain optional, no default.
  is_default: z.boolean().optional(),
})
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>

// ---------- business units ---------------------------------------------------

export const CreateBusinessUnitSchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateBusinessUnitInput = z.infer<typeof CreateBusinessUnitSchema>

export const UpdateBusinessUnitSchema = CreateBusinessUnitSchema.partial()
export type UpdateBusinessUnitInput = z.infer<typeof UpdateBusinessUnitSchema>

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

// ---------- scale labels (scale_label_overrides) -----------------------------

export const UpsertScaleLabelSchema = z.object({
  scale: z.string().min(1).max(100),
  key: z.string().min(1).max(100),
  lang: Lang,
  value: z.string().min(1).max(500),
})
export type UpsertScaleLabelInput = z.infer<typeof UpsertScaleLabelSchema>

/** Batch upsert: `{ overrides: [...] }`. Whole batch is treated atomically. */
export const PatchScaleLabelsSchema = z.object({
  overrides: z.array(UpsertScaleLabelSchema).min(1).max(500),
})
export type PatchScaleLabelsInput = z.infer<typeof PatchScaleLabelsSchema>

// ---------- compliance settings (singleton) ----------------------------------

export const PatchComplianceSettingsSchema = z.object({
  weights: z
    .object({
      auditCompletion: z.number().int().min(0).max(100).optional(),
      observationClosure: z.number().int().min(0).max(100).optional(),
      riskPosture: z.number().int().min(0).max(100).optional(),
      policyCurrency: z.number().int().min(0).max(100).optional(),
      trainingCompletion: z.number().int().min(0).max(100).optional(),
    })
    .partial()
    .optional(),
  target_score: z.number().int().min(0).max(100).optional(),
  audit_retention_years: z.number().int().min(1).max(50).optional(),
})
export type PatchComplianceSettingsInput = z.infer<typeof PatchComplianceSettingsSchema>

// ---------- saudization (singleton) ------------------------------------------

const SaudizationDeptEntry = z.object({
  department_id: Uuid.nullable().optional(),
  department_name: z.string().optional(),
  total: z.number().int().min(0).optional(),
  saudi: z.number().int().min(0).optional(),
  ratio: z.number().min(0).max(1).optional(),
})

export const PatchSaudizationSchema = z.object({
  target: z.number().min(0).max(100).optional(),
  actual: z.number().min(0).max(100).optional(),
  total_employees: z.number().int().min(0).optional(),
  saudi_employees: z.number().int().min(0).optional(),
  by_department: z.array(SaudizationDeptEntry).optional(),
  last_data_source: z.string().max(200).optional(),
  last_updated: z.string().optional(),
})
export type PatchSaudizationInput = z.infer<typeof PatchSaudizationSchema>

// ---------- onboarding -------------------------------------------------------

export const OnboardingStepSchema = z.object({
  step: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).default({}),
})
export type OnboardingStepInput = z.infer<typeof OnboardingStepSchema>
