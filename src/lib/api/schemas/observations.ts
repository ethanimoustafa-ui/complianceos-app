// Zod schemas for the observations resource family.
//
// Tables (per migration 008_audits_observations.sql):
//   observations, observation_assignees, observation_team, observation_checklist,
//   observation_updates (comments), observation_documents, observation_timeline,
//   remediation_plans, closure_requests, closure_reviews.

import { z } from 'zod'

// ---------- shared scalars ----------------------------------------------------

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

const ObservationSource = z.enum(['sama', 'internal', 'sharia'])
const ObservationSeverity = z.enum(['critical', 'high', 'medium', 'low'])
const ObservationStatus = z.enum(['open', 'in_progress', 'resolved', 'closed'])
const DocType = z.enum(['pdf', 'image', 'doc'])

// ---------- observations top-level -------------------------------------------

export const CreateObservationSchema = z.object({
  title: z.string().min(1).max(500),
  sub_title: z.string().max(500).optional(),
  description: z.string().min(1).max(10_000),
  source: ObservationSource,
  severity: ObservationSeverity,
  due_date: DateString,
  remediation_submission_due: DateString.optional(),
  department: z.string().max(200).optional(),
  reference: z.string().min(1).max(100),
  leader_id: Uuid.optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateObservationInput = z.infer<typeof CreateObservationSchema>

export const UpdateObservationSchema = CreateObservationSchema.partial().extend({
  status: ObservationStatus.optional(),
  progress: z.number().int().min(0).max(100).optional(),
})
export type UpdateObservationInput = z.infer<typeof UpdateObservationSchema>

export const ListObservationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  id: Uuid.optional(),
  status: ObservationStatus.optional(),
  severity: ObservationSeverity.optional(),
  source: ObservationSource.optional(),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
  leader_id: Uuid.optional(),
  audit_id: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListObservationsQuery = z.infer<typeof ListObservationsQuerySchema>

// ---------- assignment / leadership ------------------------------------------

export const AssignObservationSchema = z.object({
  leader_id: Uuid.optional(),
  assignees: z
    .array(
      z.object({
        user_id: Uuid.optional(),
        name: z.string().min(1).max(200),
        role: z.string().max(100).optional(),
      }),
    )
    .optional(),
})
export type AssignObservationInput = z.infer<typeof AssignObservationSchema>

export const CloseObservationSchema = z.object({
  notes: z.string().max(5_000).optional(),
})
export type CloseObservationInput = z.infer<typeof CloseObservationSchema>

// ---------- checklist --------------------------------------------------------

export const CreateChecklistItemSchema = z.object({
  text: z.string().min(1).max(1_000),
  sort_order: z.number().int().min(0).optional(),
})
export type CreateChecklistItemInput = z.infer<typeof CreateChecklistItemSchema>

export const UpdateChecklistItemSchema = z.object({
  text: z.string().min(1).max(1_000).optional(),
  completed: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
})
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemSchema>

// ---------- evidence / documents / attachments -------------------------------
//
// `observation_documents` is the canonical table. We accept the spec's terms
// (evidence/attachments) as aliases that all route into this table.

export const RegisterObservationDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  type: DocType,
  storage_path: z.string().min(1).max(1024),
})
export type RegisterObservationDocumentInput = z.infer<typeof RegisterObservationDocumentSchema>

// ---------- remediation ------------------------------------------------------

export const CreateRemediationPlanSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10_000),
  due_date: DateString,
})
export type CreateRemediationPlanInput = z.infer<typeof CreateRemediationPlanSchema>

export const ReviewRemediationPlanSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(5_000).optional(),
})
export type ReviewRemediationPlanInput = z.infer<typeof ReviewRemediationPlanSchema>

// ---------- comments ---------------------------------------------------------

export const CreateObservationCommentSchema = z.object({
  text: z.string().min(1).max(10_000),
})
export type CreateObservationCommentInput = z.infer<typeof CreateObservationCommentSchema>
