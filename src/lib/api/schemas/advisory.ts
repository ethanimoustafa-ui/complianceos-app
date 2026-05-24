// Zod schemas for advisory_requests (+ advisory_notes).
//
// W23 PORTING-TEMPLATE §2 countermeasures applied:
//   - .strict() on Create and Update schemas (SEC-8 / closes unknown-key injection).
//   - Hand-written UpdateAdvisorySchema — NOT .partial() on Create (P2 / HANI-3 pattern).
//   - No .default() on Update fields (prevents P2 zero-write clobbering).
//   - Status and Priority remain open-strings (PORTING-TEMPLATE §8 —
//     user-domain enums are NOT locked in source; the set is Settings-managed).
//   - stripHtml applied to every free-text field via PlainText helpers (SEC-4).

import { z } from 'zod'
import { stripHtml } from '../sanitize'

// ---------- shared scalars ---------------------------------------------------

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// SEC-4: plain-text helpers — strip ALL HTML/event-handler markup server-side.
const PlainText = (max: number) => z.string().max(max).transform(stripHtml)
const PlainTextMin = (max: number) => z.string().min(1).max(max).transform(stripHtml)

// Status and Priority: open-string with basic shape validation (PORTING-TEMPLATE §8).
// The set of allowed values is managed in Settings / enum_value_definitions, not here.
const StatusField = z.string().min(1).max(50).transform((s) => s.toLowerCase())
const PriorityField = z.string().min(1).max(50).transform((s) => s.toLowerCase())

// ---------- advisory_requests ------------------------------------------------

export const CreateAdvisorySchema = z
  .object({
    subject: PlainTextMin(2_000),
    description: PlainTextMin(50_000),
    business_unit: z.string().min(1).max(200),
    status: StatusField.default('pending'),
    priority: PriorityField.default('medium'),
    requested_by: PlainTextMin(200),
    requested_date: DateString,
    assigned_to: Uuid.optional(),
  })
  .strict()

export type CreateAdvisoryInput = z.infer<typeof CreateAdvisorySchema>

// Hand-written UpdateAdvisorySchema — NEVER CreateAdvisorySchema.partial().
// No .default() on any field — partial PATCH must not clobber real data (P2).
export const UpdateAdvisorySchema = z
  .object({
    subject: PlainTextMin(2_000).optional(),
    description: PlainText(50_000).optional(),
    business_unit: z.string().min(1).max(200).optional(),
    status: StatusField.optional(),
    priority: PriorityField.optional(),
    requested_by: PlainTextMin(200).optional(),
    requested_date: DateString.optional(),
    // null clears the assignment (GAP-3 — clearable optional field).
    assigned_to: Uuid.nullable().optional(),
  })
  .strict()

export type UpdateAdvisoryInput = z.infer<typeof UpdateAdvisorySchema>

// Note creation — appended by POST /api/advisory/[id] co-located handler.
export const CreateAdvisoryNoteSchema = z
  .object({
    author: PlainTextMin(200),
    content: PlainTextMin(50_000),
  })
  .strict()

export type CreateAdvisoryNoteInput = z.infer<typeof CreateAdvisoryNoteSchema>

export const ListAdvisoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  business_unit: z.string().max(200).optional(),
  business_unit_id: z.string().max(200).optional(), // alias for filter compatibility
  /**
   * Schema doesn't store `department_id` on advisory_requests directly;
   * accepted for API surface compatibility but ignored at the query level.
   */
  department_id: z.string().optional(),
  assigned_to: Uuid.optional(),
  q: z.string().max(200).optional(),
})

export type ListAdvisoryQuery = z.infer<typeof ListAdvisoryQuerySchema>
