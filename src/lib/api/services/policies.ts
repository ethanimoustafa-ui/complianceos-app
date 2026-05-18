// Policies service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------

export const POLICY_LIST_COLUMNS =
  'id, ref_code, name, status, category, version, approval_tier, owner_id, owner_name, owner_department, business_owner_department_id, last_review_date, next_review_date, overdue_count, framework_ids, affected_departments, created_at, updated_at'

export const POLICY_DETAIL_COLUMNS =
  'id, ref_code, name, description, status, category, version, approval_tier, owner_id, owner_name, owner_department, business_owner_department_id, last_review_date, next_review_date, review_cycle_days, approved_date, overdue_count, last_overdue_date, current_review_cycle_id, current_review_cycle_label, current_review_cycle_date, review_schedule, framework_ids, affected_departments, created_at, updated_at'

export const POLICY_VERSION_COLUMNS = 'id, policy_id, version, date, author, changes'
export const POLICY_WORKFLOW_STEP_COLUMNS =
  'id, policy_id, step, date, user_name, status, description, action_type, note, step_state, sort_order'
export const POLICY_ACTIVITY_COLUMNS =
  'id, policy_id, timestamp, date, type, text_en, text_ar, user_name, note'
export const POLICY_REVIEW_CYCLE_COLUMNS = 'id, policy_id, label, initiated_at'
export const POLICY_ATTACHMENT_COLUMNS =
  'id, policy_id, name, storage_path, size, uploaded_at, uploaded_by'

// --- assertions --------------------------------------------------------------

export async function assertPolicyExists(
  supabase: SupabaseClient,
  policyId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('policies')
    .select('id')
    .eq('id', policyId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Policy ${policyId} not found`)
  return data.id
}

// --- composite detail --------------------------------------------------------

export interface PolicyDetail {
  id: string
  ref_code: string
  name: string
  description: string
  status: string
  category: string
  version: string
  approval_tier: string
  owner_id: string | null
  owner_name: string | null
  owner_department: string | null
  business_owner_department_id: string | null
  last_review_date: string | null
  next_review_date: string | null
  review_cycle_days: number
  approved_date: string | null
  overdue_count: number
  last_overdue_date: string | null
  current_review_cycle_id: string | null
  current_review_cycle_label: string | null
  current_review_cycle_date: string | null
  review_schedule: unknown
  framework_ids: string[]
  affected_departments: string[]
  created_at: string
  updated_at: string
  current_version: unknown
  versions: unknown[]
  workflow_steps: unknown[]
  review_cycles: unknown[]
}

export async function getPolicyDetail(
  supabase: SupabaseClient,
  policyId: string,
): Promise<PolicyDetail> {
  const { data: policy, error } = await supabase
    .from('policies')
    .select(POLICY_DETAIL_COLUMNS)
    .eq('id', policyId)
    .is('deleted_at', null)
    .maybeSingle<Omit<PolicyDetail, 'current_version' | 'versions' | 'workflow_steps' | 'review_cycles'>>()
  if (error) throw error
  if (!policy) throw NotFound(`Policy ${policyId} not found`)

  const [versions, steps, cycles] = await Promise.all([
    supabase
      .from('policy_versions')
      .select(POLICY_VERSION_COLUMNS)
      .eq('policy_id', policyId)
      .order('date', { ascending: false }),
    supabase
      .from('policy_workflow_steps')
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .eq('policy_id', policyId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('policy_review_cycles')
      .select(POLICY_REVIEW_CYCLE_COLUMNS)
      .eq('policy_id', policyId)
      .order('initiated_at', { ascending: false }),
  ])

  const versionList = (versions.data as unknown[]) ?? []

  return {
    ...policy,
    current_version: versionList[0] ?? null,
    versions: versionList,
    workflow_steps: (steps.data as unknown[]) ?? [],
    review_cycles: (cycles.data as unknown[]) ?? [],
  }
}

// --- activity-log writer ----------------------------------------------------

export async function writePolicyActivity(opts: {
  supabase: SupabaseClient
  policy_id: string
  type: string
  text_en: string
  text_ar: string
  user_name?: string
  note?: string
  date?: string
}): Promise<void> {
  try {
    const today = opts.date ?? new Date().toISOString().slice(0, 10)
    const { error } = await opts.supabase.from('policy_activity_log').insert({
      policy_id: opts.policy_id,
      date: today,
      type: opts.type,
      text_en: opts.text_en,
      text_ar: opts.text_ar,
      user_name: opts.user_name ?? null,
      note: opts.note ?? null,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/policies] activity insert failed', error)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/policies] writePolicyActivity threw', e)
  }
}
