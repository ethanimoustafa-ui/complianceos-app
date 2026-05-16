// Zod schemas for circulars + workflow steps + implementations (articles) +
// timeline reads.

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

const Authority = z.enum(['sama', 'cma', 'ia', 'zatca', 'misa', 'safiu'])
const Priority = z.enum(['critical', 'high', 'medium', 'low'])
const Status = z.enum(['pending', 'in-progress', 'completed', 'overdue'])
const Applicability = z.enum(['applicable', 'not-applicable', 'pending'])

// ---------- circular --------------------------------------------------------

export const CreateCircularSchema = z.object({
  authority: Authority,
  title: z.string().min(1).max(2_000),
  priority: Priority.default('medium'),
  status: Status.default('pending'),
  applicability: Applicability.default('pending'),
  departments: z.array(z.string().min(1)).default([]),
  business_owner_department: z.string().max(200).optional(),
  business_owner_department_id: Uuid.optional(),
  assigned_to: Uuid.optional(),
  progress: z.number().int().min(0).max(100).default(0),
  issuance_date: DateString,
  due_date: DateString,
  cap_status: z.string().max(100).default('not-started'),
  cap_due_date: DateString.optional(),
  cap_deadline: DateString.optional(),
  cap_response_deadline: DateString.optional(),
  remediation_deadline: DateString.optional(),
  description: z.string().max(50_000).optional(),
  pdf_url: z.string().max(8_000).optional(),
  reference_url: z.string().max(2_000).optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateCircularInput = z.infer<typeof CreateCircularSchema>

export const UpdateCircularSchema = CreateCircularSchema.partial()
export type UpdateCircularInput = z.infer<typeof UpdateCircularSchema>

export const ListCircularsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: Status.optional(),
  authority: Authority.optional(),
  authority_id: z.string().optional(), // alias
  priority: Priority.optional(),
  applicability: Applicability.optional(),
  has_pending_edits: z.enum(['true', 'false']).optional(),
  framework_id: z.string().optional(),
  q: z.string().max(200).optional(),
})
export type ListCircularsQuery = z.infer<typeof ListCircularsQuerySchema>

// ---------- workflow phase advance -----------------------------------------

export const AdvancePhaseSchema = z.object({
  notes: z.string().max(5_000).optional(),
  next_phase: z.coerce.number().int().min(0).max(2).optional(),
})
export type AdvancePhaseInput = z.infer<typeof AdvancePhaseSchema>

export const SetPhaseDeadlineSchema = z.object({
  phase: z.coerce.number().int().min(0).max(2),
  deadline: DateString,
})
export type SetPhaseDeadlineInput = z.infer<typeof SetPhaseDeadlineSchema>

// ---------- implementations (mapped to circular_articles) -----------------

export const CreateImplementationSchema = z.object({
  article_number: z.string().min(1).max(100),
  title: z.string().min(1).max(2_000),
  description: z.string().max(50_000).optional(),
  risk_level: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  responsible_department: z.string().max(200).optional(),
  compliance_status: z.string().max(100).default('not-started'),
  assigned_to: Uuid.optional(),
  notes: z.string().max(5_000).optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
})
export type CreateImplementationInput = z.infer<typeof CreateImplementationSchema>

export const UpdateImplementationSchema = CreateImplementationSchema.partial()
export type UpdateImplementationInput = z.infer<typeof UpdateImplementationSchema>
