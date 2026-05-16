// Notifications service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const NOTIFICATION_COLUMNS =
  'id, user_id, title, message, type, source_type, route, entity_id, dedupe_key, read, created_at'

export async function assertNotificationOwner(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id')
    .eq('id', notificationId)
    .maybeSingle<{ id: string; user_id: string }>()
  if (error) throw error
  if (!data || data.user_id !== userId)
    throw NotFound(`Notification ${notificationId} not found`)
}
