// Zod schemas for the notifications resource family.

import { z } from 'zod'

const Uuid = z.string().uuid()
const NotifType = z.enum(['info', 'warning', 'success', 'error'])

export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  read: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
})
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>

export const CreateNotificationSchema = z.object({
  user_id: Uuid,
  title: z.string().min(1).max(300),
  message: z.string().min(1).max(2000),
  type: NotifType.default('info'),
  source_type: z.string().max(100).optional(),
  route: z.string().max(500).optional(),
  entity_id: Uuid.optional(),
  dedupe_key: z.string().max(200).optional(),
})
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>
