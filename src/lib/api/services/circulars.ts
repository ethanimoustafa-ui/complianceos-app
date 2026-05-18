// Circulars service helpers: column lists + reference generator + existence
// guard + phase-advance helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const CIRCULAR_LIST_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, cap_deadline, cap_response_deadline, remediation_deadline, description, pdf_url, reference_url, framework_ids, created_at, updated_at'

export const CIRCULAR_DETAIL_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, cap_deadline, cap_response_deadline, remediation_deadline, description, pdf_url, reference_url, framework_ids, created_at, updated_at'

export const IMPLEMENTATION_COLUMNS =
  'id, circular_id, article_number, title, description, risk_level, responsible_department, compliance_status, assigned_to, notes, sort_order'

export const WORKFLOW_STEP_COLUMNS =
  'id, circular_id, phase, label, label_ar, status, date, user_name, notes, action_label, action_label_ar, requires_notes, action_type, sort_order, deadline, assigned_to'

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

// --- article checklist + timeline -----------------------------------------

export const ARTICLE_CHECKLIST_COLUMNS = 'id, article_id, text, completed, sort_order'
export const ARTICLE_VERSION_COLUMNS = 'id, article_id, version_no, date, author, changes'
export const ARTICLE_TIMELINE_COLUMNS = 'id, article_id, title, date, user_name, status'

/** Throws NotFound if the article doesn't belong to the circular. */
export async function assertArticleExists(
  supabase: SupabaseClient,
  circularId: string,
  articleId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('circular_articles')
    .select('id')
    .eq('id', articleId)
    .eq('circular_id', circularId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Article ${articleId} not found`)
  return data.id
}

export async function insertArticleTimeline(
  supabase: SupabaseClient,
  articleId: string,
  title: string,
  userName: string,
  status: string = 'completed',
): Promise<void> {
  const { error } = await supabase.from('article_timeline').insert({
    article_id: articleId,
    title,
    user_name: userName,
    status,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] article timeline insert failed', {
      error,
      articleId,
      title,
    })
  }
}

// --- circular_workflow_steps helpers --------------------------------------

export interface CircularWorkflowStepRow {
  id: string
  circular_id: string
  phase: number
  label: string
  label_ar: string | null
  status: string
  date: string | null
  user_name: string | null
  notes: string | null
  action_label: string
  action_label_ar: string
  requires_notes: boolean
  action_type: string
  sort_order: number
  assigned_to: string | null
  deadline: string | null
}

export async function assertCircularWorkflowStepExists(
  supabase: SupabaseClient,
  circularId: string,
  stepId: string,
): Promise<CircularWorkflowStepRow> {
  const { data, error } = await supabase
    .from('circular_workflow_steps')
    .select(
      'id, circular_id, phase, label, label_ar, status, date, user_name, notes, action_label, action_label_ar, requires_notes, action_type, sort_order, assigned_to, deadline',
    )
    .eq('id', stepId)
    .eq('circular_id', circularId)
    .maybeSingle<CircularWorkflowStepRow>()
  if (error) throw error
  if (!data) throw NotFound(`Workflow step ${stepId} not found`)
  return data
}

export async function maxCircularWorkflowStepSortOrder(
  supabase: SupabaseClient,
  circularId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('circular_workflow_steps')
    .select('sort_order')
    .eq('circular_id', circularId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()
  if (error) throw error
  return data?.sort_order ?? 0
}

export interface CircularHeader {
  id: string
  reference: string
  title: string
  authority: string
  priority: string
  status: string
}

export async function getCircularHeader(
  supabase: SupabaseClient,
  circularId: string,
): Promise<CircularHeader | null> {
  const { data, error } = await supabase
    .from('circulars')
    .select('id, reference, title, authority, priority, status')
    .eq('id', circularId)
    .maybeSingle<CircularHeader>()
  if (error) throw error
  return data ?? null
}

// --- progress recompute ----------------------------------------------------

/**
 * Recompute and persist a circular's progress percentage.
 *
 * Formula: `round( (checklistPct * 0.6 + phasePct * 0.4) * 100 )`
 *   - checklistPct = completed_checklist_items / total_checklist_items (0 if none)
 *   - phasePct     = completed_workflow_steps  / total_workflow_steps  (0 if none)
 *
 * Wrapped end-to-end in try/catch so callers can fire-and-forget without a
 * mutation failure breaking the parent request.
 */
export async function recomputeCircularProgress(
  supabase: SupabaseClient,
  circularId: string,
): Promise<number> {
  try {
    // Checklist items live one level below the circular (circular_articles →
    // article_checklist_items). Pull the article id list first, then count.
    const { data: articles, error: artErr } = await supabase
      .from('circular_articles')
      .select('id')
      .eq('circular_id', circularId)
    if (artErr) throw artErr

    const articleIds = (articles ?? []).map((a) => (a as { id: string }).id)

    let checklistTotal = 0
    let checklistDone = 0
    if (articleIds.length > 0) {
      const totalQ = await supabase
        .from('article_checklist_items')
        .select('id', { count: 'exact', head: true })
        .in('article_id', articleIds)
      if (totalQ.error) throw totalQ.error
      checklistTotal = totalQ.count ?? 0

      const doneQ = await supabase
        .from('article_checklist_items')
        .select('id', { count: 'exact', head: true })
        .in('article_id', articleIds)
        .eq('completed', true)
      if (doneQ.error) throw doneQ.error
      checklistDone = doneQ.count ?? 0
    }

    const totalStepsQ = await supabase
      .from('circular_workflow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('circular_id', circularId)
    if (totalStepsQ.error) throw totalStepsQ.error
    const stepsTotal = totalStepsQ.count ?? 0

    const doneStepsQ = await supabase
      .from('circular_workflow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('circular_id', circularId)
      .eq('status', 'completed')
    if (doneStepsQ.error) throw doneStepsQ.error
    const stepsDone = doneStepsQ.count ?? 0

    const checklistPct = checklistTotal > 0 ? checklistDone / checklistTotal : 0
    const phasePct = stepsTotal > 0 ? stepsDone / stepsTotal : 0
    const progress = Math.round((checklistPct * 0.6 + phasePct * 0.4) * 100)

    const { error: upErr } = await supabase
      .from('circulars')
      .update({ progress })
      .eq('id', circularId)
    if (upErr) throw upErr

    return progress
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] recomputeCircularProgress failed', {
      error: e,
      circularId,
    })
    return 0
  }
}
