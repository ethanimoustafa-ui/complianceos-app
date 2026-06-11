// Risks service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { Conflict, NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------

// List rows feed the Risk Register cards directly, so we ship the full set of
// fields the card surfaces: title + description preview, scoring trio
// (likelihood / impact / risk_score), workflow + status, owner pointer,
// monitoring cadence, target date (`mitigation_deadline`), and last review
// date. `description` is bounded by the column varchar so this stays cheap.
// Matches the OBSERVATION_LIST_COLUMNS / POLICY_LIST_COLUMNS shape.
export const RISK_LIST_COLUMNS =
  'id, title, description, category, likelihood, impact, risk_score, status, owner_id, mitigation_plan, mitigation_progress, intended_department_id, mitigation_workflow_status, mitigation_deadline, monitoring_frequency, last_review_date, next_review_date, sent_to_department_at, framework_ids, created_at, updated_at'

export const RISK_DETAIL_COLUMNS =
  'id, title, description, category, likelihood, impact, risk_score, status, owner_id, mitigation_plan, mitigation_progress, monitoring_frequency, last_review_date, next_review_date, review_schedule, intended_department_id, mitigation_deadline, mitigation_workflow_status, sent_to_department_at, framework_ids, created_at, updated_at'

export const RISK_CHECKLIST_COLUMNS =
  'id, risk_id, text, completed, sort_order, deadline'

export const RISK_HISTORY_COLUMNS =
  'id, risk_id, user_id, action, previous_value, new_value, notes, created_at'

export const RISK_PLAN_DOCUMENT_COLUMNS =
  'id, risk_id, name, type, storage_path, uploaded_by, uploaded_at'

// --- assertions --------------------------------------------------------------

export async function assertRiskExists(
  supabase: SupabaseClient,
  riskId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('risks')
    .select('id')
    .eq('id', riskId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Risk ${riskId} not found`)
  return data.id
}

// --- composite detail --------------------------------------------------------

export interface RiskDetail {
  id: string
  title: string
  description: string
  category: string
  likelihood: number
  impact: number
  risk_score: number
  status: string
  owner_id: string | null
  mitigation_plan: string | null
  mitigation_progress: number
  monitoring_frequency: string
  last_review_date: string | null
  next_review_date: string | null
  review_schedule: unknown
  intended_department_id: string | null
  mitigation_deadline: string | null
  mitigation_workflow_status: string
  sent_to_department_at: string | null
  framework_ids: string[]
  created_at: string
  updated_at: string
  mitigation_checklist: Array<{ id: string; text: string; completed: boolean; sort_order: number; deadline: string | null }>
  proposed_plan: unknown
  history: unknown[]
  plan_documents: unknown[]
}

export async function getRiskDetail(
  supabase: SupabaseClient,
  riskId: string,
): Promise<RiskDetail> {
  const { data: risk, error } = await supabase
    .from('risks')
    .select(RISK_DETAIL_COLUMNS)
    .eq('id', riskId)
    .maybeSingle<Omit<RiskDetail, 'mitigation_checklist' | 'proposed_plan' | 'history' | 'plan_documents'>>()
  if (error) throw error
  if (!risk) throw NotFound(`Risk ${riskId} not found`)

  const [checklist, plan, history, docs] = await Promise.all([
    supabase
      .from('risk_mitigation_checklist')
      .select(RISK_CHECKLIST_COLUMNS)
      .eq('risk_id', riskId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('risk_department_proposed_plan')
      .select('risk_id, plan, submitted_by, submitted_at')
      .eq('risk_id', riskId)
      .maybeSingle(),
    supabase
      .from('risk_history')
      .select(RISK_HISTORY_COLUMNS)
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('risk_plan_documents')
      .select(RISK_PLAN_DOCUMENT_COLUMNS)
      .eq('risk_id', riskId)
      .order('uploaded_at', { ascending: false }),
  ])

  return {
    ...risk,
    mitigation_checklist: (checklist.data as RiskDetail['mitigation_checklist']) ?? [],
    proposed_plan: plan.data ?? null,
    history: history.data ?? [],
    plan_documents: docs.data ?? [],
  }
}

// --- workflow transition assertions -----------------------------------------

const ALLOWED_WORKFLOW: Record<string, string[]> = {
  'not-started': ['sent-to-department'],
  'sent-to-department': ['plan-proposed'],
  'plan-proposed': ['in-progress', 'sent-to-department'],
  'in-progress': ['resolved'],
  resolved: [],
}

export function assertWorkflowTransition(current: string, next: string): void {
  if (!ALLOWED_WORKFLOW[current]?.includes(next)) {
    throw Conflict(`Invalid risk workflow transition ${current} → ${next}`)
  }
}

// --- history writer ---------------------------------------------------------

export async function writeRiskHistory(opts: {
  supabase: SupabaseClient
  risk_id: string
  action: string
  user_id?: string
  previous_value?: string | null
  new_value?: string | null
  notes?: string
}): Promise<void> {
  try {
    const { error } = await opts.supabase.from('risk_history').insert({
      risk_id: opts.risk_id,
      action: opts.action,
      user_id: opts.user_id ?? null,
      previous_value: opts.previous_value ?? null,
      new_value: opts.new_value ?? null,
      notes: opts.notes ?? null,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/risks] history insert failed', error)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/risks] writeRiskHistory threw', e)
  }
}
