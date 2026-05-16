// Zod schemas for the calendar resource family.

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })
const TimeString = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'Invalid time (HH:mm[:ss])' })

const EventType = z.enum(['deadline', 'meeting', 'submission', 'review'])

// ---------- calendar_events ---------------------------------------------------

export const CreateCalendarEventSchema = z.object({
  title: z.string().min(1).max(500),
  type: EventType,
  date: DateString,
  start_time: TimeString.optional(),
  end_time: TimeString.optional(),
  attendees: z.array(z.string()).default([]),
  related_entity_id: Uuid.optional(),
  related_entity_type: z.string().max(100).optional(),
  reminders: z.array(z.record(z.string(), z.unknown())).default([]),
  description: z.string().max(10_000).optional(),
  location: z.string().max(500).optional(),
  agency: z.string().max(200).optional(),
  severity: z.string().max(50).optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventSchema>

export const UpdateCalendarEventSchema = CreateCalendarEventSchema.partial().extend({
  completed: z.boolean().optional(),
})
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventSchema>

export const ListCalendarEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  start_date: DateString.optional(),
  end_date: DateString.optional(),
  source_type: z.string().optional(),
  framework_id: z.string().optional(),
  department_id: Uuid.optional(),
  show_completed: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
})
export type ListCalendarEventsQuery = z.infer<typeof ListCalendarEventsQuerySchema>

// ---------- calendar_event_types ----------------------------------------------

export const CreateCalendarEventTypeSchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateCalendarEventTypeInput = z.infer<typeof CreateCalendarEventTypeSchema>

export const UpdateCalendarEventTypeSchema = CreateCalendarEventTypeSchema.partial()
export type UpdateCalendarEventTypeInput = z.infer<typeof UpdateCalendarEventTypeSchema>
