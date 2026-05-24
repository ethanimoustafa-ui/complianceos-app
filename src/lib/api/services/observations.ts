// Wave-20 — Observations service-layer helpers, hardened to the Rules + Policy
// patterns (PORTING-TEMPLATE §2: column lists include `updated_at` +
// `is_overdue`, server recompute, dual-store activity writer).

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'
import { renderBilingual } from '@/lib/i18n/server'

// --- selection lists ---------------------------------------------------------
// PORTING-TEMPLATE §2.12: every column-list (parent + children) carries
// `updated_at` so the detail GET nest ships the per-row optimistic-lock token.
// Wave-20 / Q3: observations.is_overdue is a real bool column populated by a
// BEFORE INSERT/UPDATE trigger + a daily pg_cron resync.

export const OBSERVATION_LIST_COLUMNS =
  'id, reference, title, sub_title, description, source, severity, status, due_date, remediation_submission_due, department, leader_id, creator_id, progress, framework_ids, is_overdue, created_at, updated_at'

export const OBSERVATION_DETAIL_COLUMNS = OBSERVATION_LIST_COLUMNS

export const OBSERVATION_CHECKLIST_COLUMNS =
  'id, observation_id, text, completed, sort_order, updated_at'

export const OBSERVATION_DOCUMENT_COLUMNS =
  'id, observation_id, name, type, storage_path, uploaded_at, uploaded_by, updated_at'

// Wave-20 migration 059 — dual-store text_en + text_ar; `description` /
// `description_ar` columns retired.
export const OBSERVATION_TIMELINE_COLUMNS =
  'id, observation_id, date, text_en, text_ar, action_type, user_id, user_name, target_id, metadata'

export const REMEDIATION_PLAN_COLUMNS =
  'id, observation_id, title, description, due_date, status, submitted_at, submitted_by, reviewed_at, reviewed_by, review_notes, created_at'

// `observation_updates` is the storage table for comments.
export const OBSERVATION_UPDATE_COLUMNS =
  'id, observation_id, author_id, text, is_edited, edited_at, created_at, updated_at'

export const OBSERVATION_ASSIGNEE_COLUMNS =
  'id, observation_id, user_id, name, role, updated_at'

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
  is_overdue: boolean
  created_at: string
  updated_at: string
  assignees: Array<{ id: string; user_id: string | null; name: string; role: string | null; updated_at: string }>
  checklist: Array<{ id: string; text: string; completed: boolean; sort_order: number; updated_at: string }>
  documents: Array<{
    id: string
    name: string
    type: string
    storage_path: string
    uploaded_at: string
    uploaded_by: string | null
    updated_at: string
  }>
  updates: Array<{
    id: string
    observation_id: string
    author_id: string
    text: string
    is_edited: boolean
    edited_at: string | null
    created_at: string
    updated_at: string
  }>
  remediation_plans: unknown[]
  closure_request: unknown
  closure_review: unknown
}

const PAGE = 10

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
    .maybeSingle<Omit<ObservationDetail, 'assignees' | 'checklist' | 'documents' | 'updates' | 'remediation_plans' | 'closure_request' | 'closure_review'>>()
  if (error) throw error
  if (!obs) throw NotFound(`Observation ${observationIdOrReference} not found`)
  const observationId = obs.id

  const [assignees, checklist, documents, updates, plans, closureReq, closureRev] = await Promise.all([
    supabase
      .from('observation_assignees')
      .select(OBSERVATION_ASSIGNEE_COLUMNS)
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
      .select(OBSERVATION_UPDATE_COLUMNS)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: true })
      .range(0, PAGE),
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

// --- dual-store timeline writer ---------------------------------------------
//
// Wave-20 / PORTING-TEMPLATE §2.11 — both languages persisted at write time
// via `renderBilingual`. The reader picks the column matching the current
// locale. Mirrors `writePolicyActivity` and the Rules `insertCircularTimeline`.

export async function insertObservationTimeline(opts: {
  supabase: SupabaseClient
  observation_id: string
  text_en: string
  text_ar: string
  action_type?: string
  user_id?: string
  user_name?: string
  target_id?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const { error } = await opts.supabase.from('observation_timeline').insert({
      observation_id: opts.observation_id,
      text_en: opts.text_en,
      text_ar: opts.text_ar,
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
    console.error('[api/observations] insertObservationTimeline threw', e)
  }
}

/**
 * Legacy helper kept for backward-compat with existing call sites that pass
 * a single English `description` string. NEW writers should call
 * `insertObservationTimeline` directly with `text_en` + `text_ar` rendered
 * via `renderBilingual`. This wrapper falls back to mirroring the English
 * string into the Arabic column when only one language is supplied.
 */
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
  await insertObservationTimeline({
    supabase: opts.supabase,
    observation_id: opts.observation_id,
    text_en: opts.description,
    text_ar: opts.description_ar ?? opts.description,
    action_type: opts.action_type,
    user_id: opts.user_id,
    user_name: opts.user_name,
    target_id: opts.target_id,
    metadata: opts.metadata,
  })
}

// --- field-label keys for the per-field diff payload ------------------------

export const OBSERVATION_FIELD_LABEL_KEYS: Record<string, string> = {
  title: 'observations.field.title',
  sub_title: 'observations.field.subTitle',
  description: 'observations.field.description',
  source: 'observations.field.source',
  severity: 'observations.field.severity',
  status: 'observations.field.status',
  due_date: 'observations.field.dueDate',
  remediation_submission_due: 'observations.field.remediationSubmissionDue',
  department: 'observations.field.department',
  leader_id: 'observations.field.leader',
  framework_ids: 'observations.field.frameworks',
  progress: 'observations.field.progress',
}

// --- per-field diff support -------------------------------------------------

/** Wave-20 — a structured field-level diff entry (mirror of PolicyFieldChange). */
export interface ObservationFieldChange {
  field: string
  from: string
  to: string
}

/**
 * Append an `observation_versions` history row when fields changed. The
 * underlying table does NOT exist yet (Option B is FLAGGED in the wave doc);
 * this writer is best-effort and silently no-ops on a 42P01 ("relation does
 * not exist") error so the PATCH still succeeds. When the migration lands,
 * the writer activates automatically.
 */
export async function insertObservationVersion(
  supabase: SupabaseClient,
  observationId: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges?: ObservationFieldChange[] | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('observation_versions').insert({
      observation_id: observationId,
      date: new Date().toISOString().slice(0, 10),
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      field_changes: fieldChanges && fieldChanges.length > 0 ? fieldChanges : null,
    })
    if (error) {
      const code = (error as { code?: string }).code
      // 42P01 = undefined_table — silently skip until Option-B migration runs.
      if (code !== '42P01') throw error
    }
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '42P01') return
    // eslint-disable-next-line no-console
    console.error('[api/services/observations] observation version insert failed', { error: e, observationId })
  }
}

// --- recompute (server-authoritative derived state) --------------------------

/**
 * Recompute and persist observation-level derived state. `is_overdue` is
 * maintained at the SQL layer by the migration 060 trigger; this helper
 * remains as a hook for any future client-derived rollups (progress, etc.)
 * that need a single canonical recompute path.
 *
 * Today the implementation is a no-op fast-path — calling it is cheap and the
 * PATCH route invokes it unconditionally so the call-site contract matches
 * Rules + Policy. Wrapped in try/catch so callers can fire-and-forget.
 */
export async function recomputeObservationDerivedState(
  _supabase: SupabaseClient,
  _observationId: string,
): Promise<void> {
  // is_overdue is maintained by the BEFORE INSERT/UPDATE trigger on the
  // observations table (migration 060). No client-side recompute needed.
  return
}

// --- author identity helper -------------------------------------------------

/**
 * Compose a writer's display identity for activity-log / version rows. Mirror
 * of the `articleDisplayName` pattern used in Rules + Policy.
 */
export function observationActorName(profile: {
  name?: string | null
  email?: string | null
}, userId: string): string {
  return profile.name ?? profile.email ?? userId
}

// --- shared body helpers ----------------------------------------------------

/**
 * Compose the "Observation updated — {fields}" body in BOTH languages from a
 * list of changed-field i18n keys. Reused by the activity-log writer AND the
 * (future) `observation_versions` writer so they stay in lockstep — the
 * Wave-19.5 lesson: one render, both surfaces.
 */
export function observationFieldsUpdatedBody(
  changedFieldLabelKeys: string[],
): { text_en: string; text_ar: string } | null {
  if (changedFieldLabelKeys.length === 0) return null
  const fieldsByLocale = {
    en: changedFieldLabelKeys
      .map((k) => OBSERVATION_FIELD_LABEL_KEYS[k] ?? k)
      .join(', '),
    ar: changedFieldLabelKeys
      .map((k) => OBSERVATION_FIELD_LABEL_KEYS[k] ?? k)
      .join(', '),
  }
  // The "fields" param is locale-aware so EN and AR each get their own list,
  // but we currently keep the field-label keys as raw strings. The bilingual
  // resolver still produces both languages by re-rendering against each dict.
  return renderBilingual('regulatoryUpdates.timeline.observationUpdated', {
    fields: fieldsByLocale,
  })
}
