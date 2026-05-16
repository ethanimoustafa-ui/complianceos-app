// Advisory service helpers: column lists + reference generator + existence
// guard.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const ADVISORY_LIST_COLUMNS =
  'id, ref, subject, business_unit, status, priority, requested_by, requested_date, assigned_to, created_at, updated_at'

export const ADVISORY_DETAIL_COLUMNS =
  'id, ref, subject, description, business_unit, status, priority, requested_by, requested_date, assigned_to, created_at, updated_at'

/**
 * Reference format: `ADV-NNNN` (zero-padded sequential, year-agnostic per
 * stores doc).
 */
export async function nextAdvisoryReference(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('advisory_requests')
    .select('ref')
    .ilike('ref', 'ADV-%')
    .order('ref', { ascending: false })
    .limit(1)
    .maybeSingle<{ ref: string }>()
  if (error) throw error
  let next = 1
  if (data?.ref) {
    const tail = data.ref.slice('ADV-'.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n >= 1) next = n + 1
  }
  return `ADV-${String(next).padStart(4, '0')}`
}

export async function assertAdvisoryExists(
  supabase: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('advisory_requests')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Advisory request ${id} not found`)
  return data.id
}
