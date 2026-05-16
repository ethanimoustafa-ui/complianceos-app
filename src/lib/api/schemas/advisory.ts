// Zod schemas for advisory_requests (+ advisory_notes — not exposed here but
// covered indirectly via correspondence-style threading on the request).

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

const Status = z.enum(['pending', 'in_progress', 'completed'])
const Priority = z.enum(['low', 'medium', 'high'])

export const CreateAdvisorySchema = z.object({
  subject: z.string().min(1).max(2_000),
  description: z.string().min(1).max(50_000),
  business_unit: z.string().min(1).max(200),
  status: Status.default('pending'),
  priority: Priority.default('medium'),
  requested_by: z.string().min(1).max(200),
  requested_date: DateString,
  assigned_to: Uuid.optional(),
})
export type CreateAdvisoryInput = z.infer<typeof CreateAdvisorySchema>

export const UpdateAdvisorySchema = CreateAdvisorySchema.partial()
export type UpdateAdvisoryInput = z.infer<typeof UpdateAdvisorySchema>

/**
 * Schema for creating an advisory note attached to an advisory_request. The
 * request_id is path-parameterised by the Route Handler. (Fix-3 wave.)
 */
export const CreateAdvisoryNoteSchema = z.object({
  author: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
})
export type CreateAdvisoryNoteInput = z.infer<typeof CreateAdvisoryNoteSchema>

export const ListAdvisoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: Status.optional(),
  priority: Priority.optional(),
  business_unit: z.string().optional(),
  business_unit_id: z.string().optional(), // alias for filter
  /**
   * Schema doesn't store `department_id` on advisory_requests directly;
   * accepted for API surface compatibility but ignored at the query level.
   */
  department_id: z.string().optional(),
  assigned_to: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListAdvisoryQuery = z.infer<typeof ListAdvisoryQuerySchema>
