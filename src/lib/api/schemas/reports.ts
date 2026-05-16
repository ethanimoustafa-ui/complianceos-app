// Zod schemas for compliance evaluations (reports namespace).
//
// Compliance evaluation = officer's verdict on a (kind, item, department) tuple.
// `kind` is `rule` (circular) or `policy`. The row id is constructed as
// `${kind}:${itemId}::${departmentId}` (matches the legacy Zustand store key).

import { z } from 'zod'

const Uuid = z.string().uuid()
const EvaluationKind = z.enum(['rule', 'policy'])
const Verdict = z.enum(['compliant', 'non-compliant', 'na', 'unknown'])
const Period = z.enum(['3months', '6months', '12months', 'fiscal'])

export const CreateEvaluationSchema = z.object({
  kind: EvaluationKind,
  item_id: Uuid,
  department_id: Uuid,
  verdict: Verdict,
  notes: z.string().max(10_000).optional(),
})
export type CreateEvaluationInput = z.infer<typeof CreateEvaluationSchema>

export const UpdateEvaluationSchema = z.object({
  verdict: Verdict.optional(),
  notes: z.string().max(10_000).nullable().optional(),
})
export type UpdateEvaluationInput = z.infer<typeof UpdateEvaluationSchema>

export const ListEvaluationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  kind: EvaluationKind.optional(),
  item_id: Uuid.optional(),
  department_id: Uuid.optional(),
  framework_id: z.string().optional(),
  evaluator_id: Uuid.optional(),
  verdict: Verdict.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
})
export type ListEvaluationsQuery = z.infer<typeof ListEvaluationsQuerySchema>

export const BulkEvaluationsSchema = z.object({
  evaluations: z.array(CreateEvaluationSchema).min(1).max(500),
})
export type BulkEvaluationsInput = z.infer<typeof BulkEvaluationsSchema>

export const ScoreSummaryQuerySchema = z.object({
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
})
export type ScoreSummaryQuery = z.infer<typeof ScoreSummaryQuerySchema>

// ---------- compliance score read endpoint -----------------------------------

export const ScoreReadQuerySchema = z.object({
  period: Period.default('3months'),
  framework_id: z.string().default('overall'),
  department_id: Uuid.optional(),
})
export type ScoreReadQuery = z.infer<typeof ScoreReadQuerySchema>

export const DashboardHealthQuerySchema = z.object({
  period: Period.default('3months'),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
})
export type DashboardHealthQuery = z.infer<typeof DashboardHealthQuerySchema>
