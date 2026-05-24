// Zod schemas for the generic `enum_value_definitions` table (Wave-19.7).
//
// First consumer: `domain='policy.approval_tier'` — additional domains
// (priority, severity, step_state, …) follow the same shape.

import { z } from 'zod'

// Domain is a dotted namespace string. Open enum (extensible) but bounded.
const Domain = z.string().min(1).max(100).regex(/^[a-z0-9._-]+$/i, {
  message: 'Domain must contain only alphanumerics, dot, dash, or underscore',
})

// Key is the stored value (e.g. 'tier_1') — case-sensitive identifier.
// Must NOT contain whitespace — it lands directly in `policies.approval_tier`.
const Key = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, {
    message: 'Key must contain only alphanumerics, dot, dash, or underscore',
  })

const Name = z.string().min(1).max(200)
const SortOrder = z.number().int().min(0).max(10_000)

export const CreateEnumValueSchema = z
  .object({
    domain: Domain,
    key: Key,
    name_en: Name,
    name_ar: Name,
    sort_order: SortOrder.optional(),
  })
  .strict()
export type CreateEnumValueInput = z.infer<typeof CreateEnumValueSchema>

// PATCH is default-free + omits `domain`/`key` (immutable — would corrupt
// rows that reference them). Per spec: `is_default=true` rows can only have
// `sort_order` edited (the route enforces this; the schema is permissive so
// the error message can be specific).
export const UpdateEnumValueSchema = z
  .object({
    name_en: Name.optional(),
    name_ar: Name.optional(),
    sort_order: SortOrder.optional(),
  })
  .strict()
export type UpdateEnumValueInput = z.infer<typeof UpdateEnumValueSchema>

export const ListEnumValuesQuerySchema = z.object({
  domain: Domain,
})
export type ListEnumValuesQuery = z.infer<typeof ListEnumValuesQuerySchema>
