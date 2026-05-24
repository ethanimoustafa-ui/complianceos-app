// Zod schemas for the generic correspondence registry + its attachments + the
// correspondence_types lookup.
//
// W22 hardening:
//   - `.strict()` on Create / Update / RegisterAttachment schemas (SEC-8).
//   - UpdateCorrespondenceSchema is hand-written (NEVER `.partial()` of Create)
//     so `.default([])` from `to_parties` / `framework_ids` cannot leak into
//     PATCH writes and clobber existing data (PORTING-TEMPLATE P2).

import { z } from 'zod'

const Uuid = z.string().uuid()
const IsoDateTime = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid datetime' })

const Status = z.enum(['draft', 'sent', 'received'])

// ---------- correspondence --------------------------------------------------

export const CreateCorrespondenceSchema = z
  .object({
    subject: z.string().min(1).max(2_000),
    from_party: z.string().min(1).max(500),
    to_parties: z.array(z.string().min(1)).default([]),
    date: IsoDateTime,
    type: z.string().min(1).max(100),
    status: Status.default('draft'),
    body: z.string().max(50_000).optional(),
    thread_id: z.string().max(120).optional(),
    archived: z.boolean().default(false),
    assignee_id: Uuid.optional(),
    framework_ids: z.array(z.string().min(1)).default([]),
  })
  .strict()
export type CreateCorrespondenceInput = z.infer<typeof CreateCorrespondenceSchema>

// W22: hand-written Update schema — NEVER CreateCorrespondenceSchema.partial().
// This prevents `.default([])` leaking into PATCH writes and clobbering real data (P2).
export const UpdateCorrespondenceSchema = z
  .object({
    subject: z.string().min(1).max(2_000).optional(),
    from_party: z.string().min(1).max(500).optional(),
    to_parties: z.array(z.string().min(1)).optional(),
    date: IsoDateTime.optional(),
    type: z.string().min(1).max(100).optional(),
    status: Status.optional(),
    body: z.string().max(50_000).nullable().optional(),
    thread_id: z.string().max(120).nullable().optional(),
    archived: z.boolean().optional(),
    assignee_id: Uuid.nullable().optional(),
    framework_ids: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type UpdateCorrespondenceInput = z.infer<typeof UpdateCorrespondenceSchema>

export const ListCorrespondenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  type: z.string().optional(),
  status: Status.optional(),
  /** Direction: `inbound` (received) | `outbound` (sent/draft). */
  direction: z.enum(['inbound', 'outbound']).optional(),
  has_attachments: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  thread_id: z.string().optional(),
  assignee_id: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListCorrespondenceQuery = z.infer<typeof ListCorrespondenceQuerySchema>

// ---------- attachments -----------------------------------------------------

export const RegisterCorrespondenceAttachmentSchema = z
  .object({
    name: z.string().min(1).max(500),
    storage_path: z.string().min(1).max(2_000),
    type: z.string().max(120).optional(),
    size: z.number().int().min(0).optional(),
  })
  .strict()
export type RegisterCorrespondenceAttachmentInput = z.infer<
  typeof RegisterCorrespondenceAttachmentSchema
>

// ---------- correspondence_types lookup -------------------------------------

export const CreateCorrespondenceTypeSchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateCorrespondenceTypeInput = z.infer<typeof CreateCorrespondenceTypeSchema>

export const UpdateCorrespondenceTypeSchema = CreateCorrespondenceTypeSchema.partial()
export type UpdateCorrespondenceTypeInput = z.infer<typeof UpdateCorrespondenceTypeSchema>
