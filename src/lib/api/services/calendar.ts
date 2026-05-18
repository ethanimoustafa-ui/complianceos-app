// Calendar service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// List columns surface everything the agenda / list / detail views need:
// title, type, date (sortable), start_time, end_time, attendees (text[]
// — UI derives `attendees_count` from `.length`), related_entity_{id,type}
// (for source chips), reminders (jsonb), description, location, completed
// + completed_at (status), agency, severity (priority surrogate),
// framework_ids. There is no `priority` or `status` column on
// calendar_events — `completed`/`completed_at` IS the status and
// `severity` is the priority surrogate.
export const CALENDAR_EVENT_LIST_COLUMNS =
  'id, title, type, date, start_time, end_time, attendees, related_entity_id, related_entity_type, reminders, description, location, completed, completed_at, agency, severity, framework_ids, created_at, updated_at'

export const CALENDAR_EVENT_DETAIL_COLUMNS = CALENDAR_EVENT_LIST_COLUMNS

export const CALENDAR_EVENT_TYPE_COLUMNS =
  'id, key, name_en, name_ar, is_default, created_at, updated_at'

export async function assertCalendarEventExists(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Calendar event ${eventId} not found`)
}
