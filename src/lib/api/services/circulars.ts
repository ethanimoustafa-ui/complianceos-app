// Circulars service helpers: column lists + reference generator + existence
// guard + phase-advance helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'
import { computeCircularProgress } from '../../progress-formula'

// Wave-19 / Q3 — `is_overdue` is a real bool column on `circulars` (migration
// 055), populated by a BEFORE INSERT/UPDATE trigger on (`due_date`, `status`)
// + a daily pg_cron resync. Predicate: `due_date < current_date AND status !=
// 'completed'`. Cheap O(1) read for the Overdue StatCard.
export const CIRCULAR_LIST_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, cap_deadline, cap_response_deadline, remediation_deadline, description, pdf_url, reference_url, is_overdue, framework_ids, created_at, updated_at'

export const CIRCULAR_DETAIL_COLUMNS =
  'id, reference, authority, title, priority, status, applicability, departments, business_owner_department, business_owner_department_id, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, cap_deadline, cap_response_deadline, remediation_deadline, description, pdf_url, reference_url, is_overdue, framework_ids, created_at, updated_at'

// W17-1 / PR-5: every child column-list includes `updated_at` so the detail
// GET nest carries the per-row optimistic-lock token down to the client.
export const IMPLEMENTATION_COLUMNS =
  'id, circular_id, article_number, title, description, risk_level, responsible_department, compliance_status, assigned_to, notes, sort_order, updated_at'

export const WORKFLOW_STEP_COLUMNS =
  'id, circular_id, phase, label, label_ar, status, date, user_name, notes, action_label, action_label_ar, requires_notes, action_type, sort_order, deadline, assigned_to, updated_at'

// Wave-19.1 / Q8 — dual-store columns (`text_en` + `text_ar`). The legacy
// `title` / `title_ar` columns were dropped by migration 056.
export const TIMELINE_COLUMNS =
  'id, circular_id, text_en, text_ar, date, user_name, status'

// GAP-1 / GAP-21: CAP / remediation / pdf attachment columns. All three tables
// share an identical shape; `circularAttachmentTable` maps the request `kind`
// to the table name.
export const CIRCULAR_ATTACHMENT_COLUMNS =
  'id, circular_id, name, storage_path, type, size, uploaded_at, uploaded_by, updated_at'

export function circularAttachmentTable(kind: 'cap' | 'remediation' | 'pdf'): string {
  if (kind === 'cap') return 'circular_cap_attachments'
  if (kind === 'pdf') return 'circular_pdf_attachments'
  return 'circular_remediation_attachments'
}

// Wave-19.4 / Item-3 — dual-store `text_en` + `text_ar` (migration 057).
// `changes` (single-language `{k,p}` JSON) was retired; the structured
// per-field diff (`field_changes` jsonb) is unchanged.
export const CIRCULAR_VERSION_COLUMNS =
  'id, circular_id, version, date, author, text_en, text_ar, field_changes, approved'

/** GAP-19: append a `circular_versions` history row when fields changed. */
export async function insertCircularVersion(
  supabase: SupabaseClient,
  circularId: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges: ArticleFieldChange[],
): Promise<void> {
  try {
    const { data: latest, error: maxError } = await supabase
      .from('circular_versions')
      .select('version')
      .eq('circular_id', circularId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number }>()
    if (maxError) throw maxError
    const version = (latest?.version ?? 0) + 1
    const { error } = await supabase.from('circular_versions').insert({
      circular_id: circularId,
      version,
      date: new Date().toISOString().slice(0, 10),
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      // `field_changes` is NOT NULL — always provide an array.
      field_changes: fieldChanges,
      approved: true,
    })
    if (error) throw error
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] circular version insert failed', {
      error,
      circularId,
      text_en: body.text_en,
    })
  }
}

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

/**
 * Wave-19.1 / Q8 — dual-store timeline writer. `body` carries the fully
 * rendered English + Arabic strings (see `renderBilingual`); the reader picks
 * the column matching the current locale.
 */
export async function insertCircularTimeline(
  supabase: SupabaseClient,
  circularId: string,
  body: { text_en: string; text_ar: string },
  userName: string,
  status: string = 'completed',
): Promise<void> {
  const { error } = await supabase
    .from('circular_timeline')
    .insert({
      circular_id: circularId,
      text_en: body.text_en,
      text_ar: body.text_ar,
      user_name: userName,
      status,
    })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] timeline insert failed', {
      error,
      circularId,
      text_en: body.text_en,
    })
  }
}

/** GAP-13: a single structured field-level diff entry for `field_changes`. */
export interface ArticleFieldChange {
  field: string
  from: string
  to: string
}

/**
 * GAP-11: append an `article_versions` history row. Fire-and-forget — a
 * failure here is logged but never breaks the caller's PATCH response, in the
 * same spirit as `insertCircularTimeline`. `version_no` is computed as
 * (max existing for the article) + 1, starting at 1 when none exist.
 *
 * GAP-13: `fieldChanges` (optional) is persisted into the `field_changes`
 * jsonb column so the Version History tab can render a Field / From / To
 * diff table. Pass `null`/`undefined` to leave the column NULL.
 */
export async function insertArticleVersion(
  supabase: SupabaseClient,
  articleId: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges?: ArticleFieldChange[] | null,
): Promise<void> {
  try {
    const { data: latest, error: maxError } = await supabase
      .from('article_versions')
      .select('version_no')
      .eq('article_id', articleId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle<{ version_no: number }>()
    if (maxError) throw maxError
    const versionNo = (latest?.version_no ?? 0) + 1
    const { error } = await supabase.from('article_versions').insert({
      article_id: articleId,
      version_no: versionNo,
      date: new Date().toISOString().slice(0, 10),
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      field_changes: fieldChanges && fieldChanges.length > 0 ? fieldChanges : null,
    })
    if (error) throw error
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] article version insert failed', {
      error,
      articleId,
      text_en: body.text_en,
    })
  }
}

// --- article checklist + timeline -----------------------------------------

export const ARTICLE_CHECKLIST_COLUMNS = 'id, article_id, text, completed, sort_order, deadline, updated_at'
// Wave-19.4 / Item-3 — dual-store columns (migration 057).
export const ARTICLE_VERSION_COLUMNS =
  'id, article_id, version_no, date, author, text_en, text_ar, field_changes'
// Wave-19.1 / Q8 — dual-store columns (`text_en` + `text_ar`).
export const ARTICLE_TIMELINE_COLUMNS =
  'id, article_id, text_en, text_ar, date, user_name, status'

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

/**
 * HANI-4: build a human-readable article label for timeline rows, e.g.
 * `Article 3 — Artweart`. Falls back gracefully when either piece is missing
 * so we never log a raw UUID. `article_number` may already contain the word
 * "Article" (free-text field) — we don't double-prefix in that case.
 */
export function articleDisplayName(
  articleNumber?: string | null,
  title?: string | null,
): string {
  const num = (articleNumber ?? '').trim()
  const ttl = (title ?? '').trim()
  let head = ''
  if (num) {
    head = /^article\b/i.test(num) ? num : `Article ${num}`
  } else {
    head = 'Article'
  }
  return ttl ? `${head} — ${ttl}` : head
}

/**
 * Wave-19.1 / Q8 — dual-store article timeline writer. `body` carries the
 * pre-rendered English + Arabic strings.
 */
export async function insertArticleTimeline(
  supabase: SupabaseClient,
  articleId: string,
  body: { text_en: string; text_ar: string },
  userName: string,
  status: string = 'completed',
): Promise<void> {
  const { error } = await supabase.from('article_timeline').insert({
    article_id: articleId,
    text_en: body.text_en,
    text_ar: body.text_ar,
    user_name: userName,
    status,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/circulars] article timeline insert failed', {
      error,
      articleId,
      text_en: body.text_en,
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
  // W17-1 / PR-5: optimistic-lock token for child PATCH/DELETE routes.
  updated_at: string
}

export async function assertCircularWorkflowStepExists(
  supabase: SupabaseClient,
  circularId: string,
  stepId: string,
): Promise<CircularWorkflowStepRow> {
  const { data, error } = await supabase
    .from('circular_workflow_steps')
    .select(
      'id, circular_id, phase, label, label_ar, status, date, user_name, notes, action_label, action_label_ar, requires_notes, action_type, sort_order, assigned_to, deadline, updated_at',
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
 * GAP-16 — DYNAMIC 50/50 WEIGHTING. The formula is the shared pure function
 * `computeCircularProgress` in `src/lib/progress-formula.ts`, imported here AND
 * by the client store's `recalcProgress` — the two layers can no longer drift.
 *
 *   totalSteps      = circular's workflow steps
 *   completedSteps  = steps with status 'completed'
 *   totalItems      = checklist items across ALL the circular's articles
 *   completedItems  = completed checklist items
 *
 *   - both halves have units : stepWeight = 50/totalSteps, itemWeight = 50/totalItems
 *   - only workflow has units: stepWeight = 100/totalSteps, itemWeight = 0
 *   - only checklist has units: itemWeight = 100/totalItems, stepWeight = 0
 *   - neither                : progress = 0
 *   progress = round(completedSteps*stepWeight + completedItems*itemWeight), clamped 0..100
 *
 * This REPLACES the old sticky-monotonic `max(storedProgress, blend)` clamp.
 * Progress is now the freshly-computed value and MAY shrink when empty units
 * (a new article / checklist item) are added — the user explicitly wants the
 * bar to "adjust naturally and dynamically".
 *
 * GAP-18 — applicability auto-update. Once a circular's current workflow phase
 * is past Phase 0 (corrective action), it is by definition applicable, so a
 * 'pending' applicability is flipped to 'applicable'. An explicit
 * 'not-applicable' set by a user is never overridden.
 *
 * Wrapped end-to-end in try/catch so callers can fire-and-forget without a
 * mutation failure breaking the parent request.
 */
export async function recomputeCircularProgress(
  supabase: SupabaseClient,
  circularId: string,
): Promise<number> {
  try {
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

    // Count checklist items across ALL articles of this circular. Join via
    // `circular_articles.circular_id` using the embedded inner-join filter so
    // a single round-trip returns only this circular's checklist rows.
    const chkTotalQ = await supabase
      .from('article_checklist_items')
      .select('id, circular_articles!inner(circular_id)', { count: 'exact', head: true })
      .eq('circular_articles.circular_id', circularId)
    if (chkTotalQ.error) throw chkTotalQ.error
    const chkTotal = chkTotalQ.count ?? 0

    const chkDoneQ = await supabase
      .from('article_checklist_items')
      .select('id, circular_articles!inner(circular_id)', { count: 'exact', head: true })
      .eq('circular_articles.circular_id', circularId)
      .eq('completed', true)
    if (chkDoneQ.error) throw chkDoneQ.error
    const chkDone = chkDoneQ.count ?? 0

    // GAP-16: dynamic 50/50 weighting — fresh value, no sticky clamp.
    // FORENSIC §5 / Task-B: the formula lives in ONE shared module
    // (`src/lib/progress-formula.ts`) imported by both this server service and
    // the client store's `recalcProgress` — it can no longer drift.
    const progress = computeCircularProgress({
      stepsTotal,
      stepsDone,
      checklistTotal: chkTotal,
      checklistDone: chkDone,
    })

    // GAP-6: fetch `due_date` for the lifecycle `status` derivation.
    // GAP-18: also fetch `applicability` so we can auto-flip a 'pending'
    // circular to 'applicable' once it is past Phase 0.
    const { data: storedRow, error: storedErr } = await supabase
      .from('circulars')
      .select('due_date, applicability')
      .eq('id', circularId)
      .maybeSingle<{ due_date: string | null; applicability: string | null }>()
    if (storedErr) throw storedErr

    // GAP-6 — status lifecycle. The StatCards count by the `status` column,
    // but `status` was never transitioned as a circular progressed. Derive it:
    //   completed  — all workflow steps done, or progress >= 100
    //   overdue    — not completed and past due_date
    //   in-progress— some progress made
    //   pending    — nothing started
    const today = new Date().toISOString().slice(0, 10)
    const isCompleted =
      (stepsTotal > 0 && stepsDone === stepsTotal) || progress >= 100
    let status: 'pending' | 'in-progress' | 'completed' | 'overdue'
    if (isCompleted) {
      status = 'completed'
    } else if (storedRow?.due_date && storedRow.due_date < today) {
      status = 'overdue'
    } else if (progress > 0 || stepsDone > 0) {
      status = 'in-progress'
    } else {
      status = 'pending'
    }

    // GAP-18: derive the circular's current workflow phase. A circular is past
    // Phase 0 when its 'current' step is in phase >= 1, OR — if no step is
    // 'current' (all done) — when any phase >= 1 step has been completed. Once
    // past Phase 0 a 'pending' applicability is auto-flipped to 'applicable';
    // an explicit 'not-applicable' set by a user is never overridden.
    const update: Record<string, unknown> = { progress, status }
    if ((storedRow?.applicability ?? 'pending') === 'pending') {
      const { data: phaseRows, error: phaseErr } = await supabase
        .from('circular_workflow_steps')
        .select('phase, status')
        .eq('circular_id', circularId)
      if (phaseErr) throw phaseErr
      const rows = phaseRows ?? []
      const currentStep = rows.find((r) => r.status === 'current')
      const pastPhase0 = currentStep
        ? currentStep.phase >= 1
        : rows.some((r) => r.status === 'completed' && r.phase >= 1)
      if (pastPhase0) update.applicability = 'applicable'
    }

    const { error: upErr } = await supabase
      .from('circulars')
      .update(update)
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
