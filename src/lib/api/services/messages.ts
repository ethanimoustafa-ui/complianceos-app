// Messages service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { Forbidden, NotFound } from '../errors'

export const THREAD_LIST_COLUMNS =
  'id, subject, is_group, avatar_url, created_by, last_message, last_message_at, created_at, updated_at'

export const MESSAGE_COLUMNS = 'id, thread_id, sender_id, content, read, created_at'

export const PARTICIPANT_COLUMNS = 'thread_id, user_id, is_admin, unread_count'

/** Returns the participant row for `userId` in `threadId`, or throws 403. */
export async function assertParticipant(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
): Promise<{ is_admin: boolean }> {
  const { data, error } = await supabase
    .from('message_thread_participants')
    .select('is_admin')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle<{ is_admin: boolean }>()
  if (error) throw error
  if (!data) throw Forbidden('You are not a participant of this thread')
  return data
}

export async function assertThreadAdmin(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
): Promise<void> {
  const p = await assertParticipant(supabase, threadId, userId)
  if (!p.is_admin) throw Forbidden('Thread admin required')
}

export async function assertThreadExists(
  supabase: SupabaseClient,
  threadId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('message_threads')
    .select('id')
    .eq('id', threadId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Thread ${threadId} not found`)
}
