// Wave-20 — Zod schemas for the observations resource family, hardened to the
// Rules + Policy pattern (PORTING-TEMPLATE §2 countermeasures 3/4/5/15/16).
//
// Tables (per migration 008_audits_observations.sql, 058–060):
//   observations, observation_assignees, observation_team, observation_checklist,
//   observation_updates (comments), observation_documents, observation_timeline,
//   remediation_plans, closure_requests, closure_reviews.
//
// Future Option-B: observation_versions (per-field version-history table —
// NOT yet created at the SQL level; the relevant Update writer is guarded so
// it no-ops until the table exists).

import { z } from 'zod'
import { stripHtml } from '../sanitize'

// ---------- shared scalars ----------------------------------------------------

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// SEC-4: plain-text helpers — strip ALL HTML/event-handler markup server-side.
// `.transform(stripHtml)` runs AFTER the length checks so an oversized payload
// can't squeak past min/max by virtue of stripping reducing its length.
const PlainText = (max: number) => z.string().max(max).transform(stripHtml)
const PlainTextMin = (max: number) =>
  z.string().min(1).max(max).transform(stripHtml)

// Open-string enums per PORTING-TEMPLATE §8 — these are user-domain concepts
// that may be tuned in Settings; keep the shape validation, not the set.
// Length-bound + non-empty + .strict() on the wrapping object remains the gate.
const ObservationSource = z.string().min(1).max(50)
const ObservationSeverity = z.string().min(1).max(50)
const ObservationStatus = z.string().min(1).max(50)
const DocType = z.enum(['pdf', 'image', 'doc'])

// ---------- observations top-level -------------------------------------------

// Wave-20 / Q1 — `reference` is server-generated from the observation title via
// `refCodeSlug` + sequence (`{SLUG}-{YYYY}-{NNNN}`). The client never supplies
// it; the field is intentionally absent from CreateObservationSchema. The DB
// column is still named `reference` (not `ref_code`) to minimise impact.
export const CreateObservationSchema = z
  .object({
    title: PlainTextMin(500),
    sub_title: PlainText(500).optional(),
    description: PlainTextMin(10_000),
    source: ObservationSource,
    severity: ObservationSeverity,
    due_date: DateString,
    remediation_submission_due: DateString.optional(),
    department: PlainText(200).optional(),
    leader_id: Uuid.optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
  })
  // SEC-8: reject unknown keys with a clean 400 at the validation boundary.
  .strict()
export type CreateObservationInput = z.infer<typeof CreateObservationSchema>

// P2 / HANI-3: hand-written default-free Update schema. NEVER `.partial(Create)`.
// `.nullable()` on every clearable optional column so the client can NULL it.
export const UpdateObservationSchema = z
  .object({
    title: PlainTextMin(500).optional(),
    sub_title: PlainText(500).nullable().optional(),
    description: PlainTextMin(10_000).optional(),
    source: ObservationSource.optional(),
    severity: ObservationSeverity.optional(),
    status: ObservationStatus.optional(),
    due_date: DateString.optional(),
    remediation_submission_due: DateString.nullable().optional(),
    department: PlainText(200).nullable().optional(),
    leader_id: Uuid.nullable().optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    // O7: archive / un-archive support. Null clears the archived_at timestamp.
    archived_at: z.string().nullable().optional(),
  })
  .strict()
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

export const AssignObservationSchema = z
  .object({
    leader_id: Uuid.nullable().optional(),
    // O6d: from/to leader names for i18n interpolation in the server activity write.
    from_leader_name: PlainText(200).optional(),
    to_leader_name: PlainText(200).optional(),
    assignees: z
      .array(
        z
          .object({
            user_id: Uuid.optional(),
            name: PlainTextMin(200),
            role: PlainText(100).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
export type AssignObservationInput = z.infer<typeof AssignObservationSchema>

export const CloseObservationSchema = z
  .object({
    notes: PlainText(5_000).optional(),
  })
  .strict()
export type CloseObservationInput = z.infer<typeof CloseObservationSchema>

// ---------- checklist --------------------------------------------------------

export const CreateChecklistItemSchema = z
  .object({
    text: PlainTextMin(1_000),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()
export type CreateChecklistItemInput = z.infer<typeof CreateChecklistItemSchema>

export const UpdateChecklistItemSchema = z
  .object({
    text: PlainTextMin(1_000).optional(),
    completed: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemSchema>

// ---------- evidence / documents / attachments -------------------------------
//
// `observation_documents` is the canonical table. Spec's terms
// (evidence/attachments) are aliases routed into the same table by the
// existing route stubs.

export const RegisterObservationDocumentSchema = z
  .object({
    // SEC-4 + SEC-10: strip HTML; route additionally reduces to safe basename.
    name: PlainTextMin(500),
    type: DocType,
    storage_path: z.string().min(1).max(15_000_000),
  })
  .strict()
export type RegisterObservationDocumentInput = z.infer<typeof RegisterObservationDocumentSchema>

// ---------- remediation ------------------------------------------------------

export const CreateRemediationPlanSchema = z
  .object({
    title: PlainTextMin(500),
    description: PlainTextMin(10_000),
    due_date: DateString,
  })
  .strict()
export type CreateRemediationPlanInput = z.infer<typeof CreateRemediationPlanSchema>

export const ReviewRemediationPlanSchema = z
  .object({
    approved: z.boolean(),
    notes: PlainText(5_000).optional(),
  })
  .strict()
export type ReviewRemediationPlanInput = z.infer<typeof ReviewRemediationPlanSchema>

// ---------- comments ---------------------------------------------------------

export const CreateObservationCommentSchema = z
  .object({
    text: PlainTextMin(10_000),
  })
  .strict()
export type CreateObservationCommentInput = z.infer<typeof CreateObservationCommentSchema>

export const UpdateObservationCommentSchema = z
  .object({
    text: PlainTextMin(10_000),
  })
  .strict()
export type UpdateObservationCommentInput = z.infer<typeof UpdateObservationCommentSchema>
