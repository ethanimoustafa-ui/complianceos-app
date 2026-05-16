// Zod schemas for the messages resource family.

import { z } from 'zod'

const Uuid = z.string().uuid()

// ---------- threads -----------------------------------------------------------

export const CreateMessageThreadSchema = z
  .object({
    participant_ids: z.array(Uuid).min(1),
    name: z.string().max(200).optional(),
    is_group: z.boolean().default(false),
    avatar_url: z.string().max(2000).optional(),
    initial_message: z.string().min(1).max(10_000).optional(),
  })
  .refine((v) => v.is_group || v.participant_ids.length === 1, {
    message: '1:1 thread requires exactly one other participant',
    path: ['participant_ids'],
  })
export type CreateMessageThreadInput = z.infer<typeof CreateMessageThreadSchema>

export const UpdateMessageThreadSchema = z.object({
  name: z.string().max(200).optional(),
  avatar_url: z.string().max(2000).optional(),
})
export type UpdateMessageThreadInput = z.infer<typeof UpdateMessageThreadSchema>

export const ListMessageThreadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type ListMessageThreadsQuery = z.infer<typeof ListMessageThreadsQuerySchema>

// ---------- messages ----------------------------------------------------------

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(10_000),
})
export type SendMessageInput = z.infer<typeof SendMessageSchema>

export const ListMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(), // ISO timestamp — fetch older than this
})
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>

// ---------- participants ------------------------------------------------------

export const AddParticipantsSchema = z.object({
  user_ids: z.array(Uuid).min(1),
})
export type AddParticipantsInput = z.infer<typeof AddParticipantsSchema>
