// Circulars service helpers: column lists + reference generator + existence
// guard + phase-advance helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const CIRCULAR_LIST_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, framework_ids, created_at, updated_at'

export const CIRCULAR_DETAIL_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, cap_deadline, cap_response_deadline, remediation_deadline, description, pdf_url, reference_url, framework_ids, created_at, updated_at'

export const IMPLEMENTATION_COLUMNS =
  'id, circular_id, article_number, title, description, risk_level, responsible_department, compliance_status, assigned_to, notes, sort_order'

export const WORKFLOW_STEP_COLUMNS =
  'id, circular_id, phase, label, label_ar, status, date, user_name, notes, action_label, action_label_ar, requires_notes, action_type, sort_order'

export const TIMELINE_COLUMNS =
  'id, circular_id, title, title_ar, date, user_name, status'

/**
 * Reference format: `<AUTHORITY>-CIR-<YYYY>-<NNNN>` (e.g. `SAMA-CIR-2026-0001`).
 */
export async function nextCircularReference(
  supabase: SupabaseClient,
  authority: string,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear()
  const prefix = `${authority.toUpperCase()}-CIR-${year}-`
  const { data, error } = await supabase
    .from('circulars')
    .select('reference')
    .ilike('reference', `${prefix}%`)
    .order('reference', { ascending: false })
    .limit(1)
    .maybeSingle<{ reference: string }>()
  if (error) throw error
  let next = 1
  if (data?.reference) {
    const tail = data.reference.slice(prefix.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n >= 1) next = n + 1
  }
  return `${prefix}${String(next).padStart(4, '0')}`
}

export async function assertCircularExists(
  supabase: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('circulars')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Circular ${id} not found`)
  return data.id
}

export async function insertCircularTimeline(
  supabase: SupabaseClient,
  circularId: string,
  title: string,
  userName: string,
  status: string = 'completed',
  title_ar: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('circular_timeline')
    .insert({
      circular_id: circularId,
      title,
      title_ar,
      user_name: userName,
      status,
    })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] timeline insert failed', { error, circularId, title })
  }
}
