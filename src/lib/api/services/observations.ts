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

// UUID v4-ish detector. The store maps `observation.id` to `reference || id`,
// so this helper may receive either a real `uuid` or a human reference like
// `OBS-2026-0001`. We probe the right column accordingly, and always return
// the canonical UUID so callers can use it as the `observation_id` FK target
// in child-table inserts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function assertObservationExists(
  supabase: SupabaseClient,
  observationIdOrReference: string,
): Promise<string> {
  const column = UUID_RE.test(observationIdOrReference) ? 'id' : 'reference'
  const { data, error } = await supabase
    .from('observations')
    .select('id')
    .eq(column, observationIdOrReference)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Observation ${observationIdOrReference} not found`)
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
  updates: Array<{
    id: string
    observation_id: string
    author_id: string
    text: string
    is_edited: boolean
    edited_at: string | null
    created_at: string
  }>
  remediation_plans: unknown[]
  closure_request: unknown
  closure_review: unknown
}

export async function getObservationDetail(
  supabase: SupabaseClient,
  observationIdOrReference: string,
): Promise<ObservationDetail> {
  const column = UUID_RE.test(observationIdOrReference) ? 'id' : 'reference'
  const { data: obs, error } = await supabase
    .from('observations')
    .select(OBSERVATION_DETAIL_COLUMNS)
    .eq(column, observationIdOrReference)
    .is('deleted_at', null)
    .maybeSingle<Omit<ObservationDetail, 'assignees' | 'checklist' | 'documents' | 'remediation_plans' | 'closure_request' | 'closure_review'>>()
  if (error) throw error
  if (!obs) throw NotFound(`Observation ${observationIdOrReference} not found`)
  const observationId = obs.id

  const [assignees, checklist, documents, updates, plans, closureReq, closureRev] = await Promise.all([
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
      .from('observation_updates')
      .select('id, observation_id, author_id, text, is_edited, edited_at, created_at')
      .eq('observation_id', observationId)
      .order('created_at', { ascending: true }),
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
    updates: (updates.data as ObservationDetail['updates']) ?? [],
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
