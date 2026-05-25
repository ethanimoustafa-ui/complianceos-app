// Correspondence service helpers: shared column lists + reference generator +
// existence guard.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const CORRESPONDENCE_LIST_COLUMNS =
  'id, reference, subject, from_party, to_parties, date, type, status, thread_id, archived, assignee_id, assignee:profiles!correspondence_assignee_id_fkey(name), framework_ids, created_at, updated_at'

export const CORRESPONDENCE_DETAIL_COLUMNS =
  'id, reference, subject, from_party, to_parties, date, type, status, body, thread_id, archived, assignee_id, assignee:profiles!correspondence_assignee_id_fkey(name), framework_ids, created_at, updated_at'

export const CORRESPONDENCE_ATTACHMENT_COLUMNS =
  'id, correspondence_id, name, storage_path, type, size, uploaded_at, uploaded_by'

/**
 * Reference format: `COR-NNNNN` (zero-padded sequential). Same race-mitigation
 * approach as letters: read max, increment. Caller retries on unique violation.
 */
export async function nextCorrespondenceReference(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('correspondence')
    .select('reference')
    .ilike('reference', 'COR-%')
    .order('reference', { ascending: false })
    .limit(1)
    .maybeSingle<{ reference: string }>()
  if (error) throw error
  let next = 1
  if (data?.reference) {
    const tail = data.reference.slice('COR-'.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n >= 1) next = n + 1
  }
  return `COR-${String(next).padStart(5, '0')}`
}

export async function assertCorrespondenceExists(
  supabase: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('correspondence')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Correspondence ${id} not found`)
  return data.id
}
