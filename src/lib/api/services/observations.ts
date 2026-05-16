// Observations service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------

export const OBSERVATION_LIST_COLUMNS =
  'id, reference, title, sub_title, source, severity, status, due_date, department, leader_id, creator_id, progress, framework_ids, created_at, updated_at'

export const OBSERVATION_DETAIL_COLUMNS =
  'id, reference, title, sub_title, description, source, severity, status, due_date, remediation_submission_due, department, leader_id, creator_id, progress, framework_ids, created_at, updated_at'

export const OBSERVATION_CHECKLIST_COLUMNS =
  'id, observation_id, text, completed, sort_order'

export const OBSERVATION_DOCUMENT_COLUMNS =
  'id, observation_id, name, type, storage_path, uploaded_at, uploaded_by'

export const OBSERVATION_TIMELINE_COLUMNS =
  'id, observation_id, date, description, description_ar, action_type, user_id, user_name, target_id, metadata'

export const REMEDIATION_PLAN_COLUMNS =
  'id, observation_id, title, description, due_date, status, submitted_at, submitted_by, reviewed_at, reviewed_by, review_notes, created_at'

// --- assertions --------------------------------------------------------------

export async function assertObservationExists(
  supabase: SupabaseClient,
  observationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('observations')
    .select('id')
    .eq('id', observationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Observation ${observationId} not found`)
  return data.id
}

// --- composite detail --------------------------------------------------------

export interface ObservationDetail {
  id: string
  reference: string
  title: string
  sub_title: string | null
  description: string
  source: string
  severity: string
  status: string
  due_date: string
  remediation_submission_due: string | null
  department: string | null
  leader_id: string | null
  creator_id: string | null
  progress: number
  framework_ids: string[]
  created_at: string
  updated_at: string
  assignees: Array<{ id: string; user_id: string | null; name: string; role: string | null }>
  checklist: Array<{ id: string; text: string; completed: boolean; sort_order: number }>
  documents: Array<{
    id: string
    name: string
    type: string
    storage_path: string
    uploaded_at: string
    uploaded_by: string | null
  }>
  remediation_plans: unknown[]
  closure_request: unknown
  closure_review: unknown
}

export async function getObservationDetail(
  supabase: SupabaseClient,
  observationId: string,
): Promise<ObservationDetail> {
  const { data: obs, error } = await supabase
    .from('observations')
    .select(OBSERVATION_DETAIL_COLUMNS)
    .eq('id', observationId)
    .is('deleted_at', null)
    .maybeSingle<Omit<ObservationDetail, 'assignees' | 'checklist' | 'documents' | 'remediation_plans' | 'closure_request' | 'closure_review'>>()
  if (error) throw error
  if (!obs) throw NotFound(`Observation ${observationId} not found`)

  const [assignees, checklist, documents, plans, closureReq, closureRev] = await Promise.all([
    supabase
      .from('observation_assignees')
      .select('id, user_id, name, role')
      .eq('observation_id', observationId),
    supabase
      .from('observation_checklist')
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .eq('observation_id', observationId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('observation_documents')
      .select(OBSERVATION_DOCUMENT_COLUMNS)
      .eq('observation_id', observationId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('remediation_plans')
      .select(REMEDIATION_PLAN_COLUMNS)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false }),
    supabase
      .from('closure_requests')
      .select('observation_id, requested_at, requested_by, notes')
      .eq('observation_id', observationId)
      .maybeSingle(),
    supabase
      .from('closure_reviews')
      .select('observation_id, reviewed_at, reviewed_by, approved, notes')
      .eq('observation_id', observationId)
      .maybeSingle(),
  ])

  return {
    ...obs,
    assignees: (assignees.data as ObservationDetail['assignees']) ?? [],
    checklist: (checklist.data as ObservationDetail['checklist']) ?? [],
    documents: (documents.data as ObservationDetail['documents']) ?? [],
    remediation_plans: plans.data ?? [],
    closure_request: closureReq.data ?? null,
    closure_review: closureRev.data ?? null,
  }
}

// --- timeline helper ---------------------------------------------------------

export async function writeObservationTimeline(opts: {
  supabase: SupabaseClient
  observation_id: string
  description: string
  description_ar?: string
  action_type?: string
  user_id?: string
  user_name?: string
  target_id?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const { error } = await opts.supabase.from('observation_timeline').insert({
      observation_id: opts.observation_id,
      description: opts.description,
      description_ar: opts.description_ar ?? null,
      action_type: opts.action_type ?? null,
      user_id: opts.user_id ?? null,
      user_name: opts.user_name ?? null,
      target_id: opts.target_id ?? null,
      metadata: opts.metadata ?? {},
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/observations] timeline insert failed', error)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/observations] writeObservationTimeline threw', e)
  }
}
