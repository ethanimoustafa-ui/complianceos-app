// Zod schemas for the global audit-log reader.
//
// Read-only endpoint. There is no Create/Update/Delete here — app-side writes
// flow through `writeAudit()` from `lib/api/audit.ts`, and the underlying
// `audit_logs` table is append-only at the DB role level (migration 012).

import { z } from 'zod'

const Uuid = z.string().uuid()
const Status = z.enum(['completed', 'pending', 'info', 'failed'])

export const ListAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  actor_id: Uuid.optional(),
  action: z.string().max(200).optional(),
  entity_type: z.string().max(100).optional(),
  entity_id: z.string().max(200).optional(),
  status: Status.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  q: z.string().max(200).optional(),
})
export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>
