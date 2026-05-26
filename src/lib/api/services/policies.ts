// Wave-18 — Policies service-layer helpers, hardened to the Rules-page
// patterns (PORTING-TEMPLATE §2: column lists include `updated_at`, server
// recompute, version writer with structured `field_changes`).

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------
// W17-1 / PR-5: every column-list (parent + children) includes `updated_at`
// so the detail GET nest carries the per-row optimistic-lock token down to
// the client.

// Wave-19 / Q3 — `is_expired` is a real bool column on `policies` (migration
// 055), populated by a BEFORE INSERT/UPDATE trigger + a daily pg_cron resync.
// Both column lists below include it so the StatCard / list-card surfaces can
// read the persisted flag (O(1)) instead of recomputing it from
// `next_review_date` per render.
export const POLICY_LIST_COLUMNS =
  'id, ref_code, name, status, category, version, approval_tier, owner_id, owner_name, owner_department, business_owner_department_id, last_review_date, next_review_date, overdue_count, is_expired, framework_ids, affected_departments, created_at, updated_at'

export const POLICY_DETAIL_COLUMNS =
  'id, ref_code, name, description, status, category, version, approval_tier, owner_id, owner_name, owner_department, business_owner_department_id, last_review_date, next_review_date, review_cycle_days, approved_date, overdue_count, last_overdue_date, current_review_cycle_id, current_review_cycle_label, current_review_cycle_date, review_schedule, is_expired, framework_ids, affected_departments, created_at, updated_at'

// GAP-19 / W18: structured per-field diff jsonb on policy_versions (migration
// 054). `field_changes` column added by 054 — older rows are NULL.
// Wave-19.4 / Item-3: dual-store `text_en` + `text_ar` (migration 057); the
// single-language `changes` column was retired.
export const POLICY_VERSION_COLUMNS =
  'id, policy_id, version, date, author, text_en, text_ar, field_changes'

export const POLICY_WORKFLOW_STEP_COLUMNS =
  'id, policy_id, step, date, user_name, status, description, action_type, note, step_state, sort_order, deadline, updated_at'

export const POLICY_ACTIVITY_COLUMNS =
  'id, policy_id, timestamp, date, type, text_en, text_ar, user_name, note'

export const POLICY_REVIEW_CYCLE_COLUMNS =
  'id, policy_id, label, initiated_at, updated_at'

export const POLICY_ATTACHMENT_COLUMNS =
  'id, policy_id, name, storage_path, size, uploaded_at, uploaded_by, updated_at'

export const POLICY_EVIDENCE_COLUMNS =
  'id, policy_id, name, storage_path, uploaded_at, uploaded_by, review_cycle_id, review_cycle_label, notes, updated_at'

// --- assertions --------------------------------------------------------------

// UUID v4-ish detector. The store maps policy.id to `ref_code || id` on
// some paths, so this helper accepts either a real UUID or a human reference
// like `POL-2026-0001`. We probe the right column accordingly and always
// return the canonical UUID — mirrors assertObservationExists in
// services/observations.ts (W26-C param-parity audit).
const POLICY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function assertPolicyExists(
  supabase: SupabaseClient,
  policyId: string,
): Promise<string> {
  const column = POLICY_UUID_RE.test(policyId) ? 'id' : 'ref_code'
  const { data, error } = await supabase
    .from('policies')
    .select('id')
    .eq(column, policyId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Policy ${policyId} not found`)
  return data.id
}

export interface PolicyWorkflowStepRow {
  id: string
  policy_id: string
  step: string
  date: string | null
  user_name: string | null
  status: string
  description: string | null
  action_type: string | null
  note: string | null
  step_state: string | null
  sort_order: number
  updated_at: string
}

export async function assertPolicyWorkflowStepExists(
  supabase: SupabaseClient,
  policyId: string,
  stepId: string,
): Promise<PolicyWorkflowStepRow> {
  const { data, error } = await supabase
    .from('policy_workflow_steps')
    .select(POLICY_WORKFLOW_STEP_COLUMNS)
    .eq('id', stepId)
    .eq('policy_id', policyId)
    .maybeSingle<PolicyWorkflowStepRow>()
  if (error) throw error
  if (!data) throw NotFound(`Workflow step ${stepId} not found`)
  return data
}

export async function maxPolicyWorkflowStepSortOrder(
  supabase: SupabaseClient,
  policyId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('policy_workflow_steps')
    .select('sort_order')
    .eq('policy_id', policyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()
  if (error) throw error
  return data?.sort_order ?? 0
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
  versions_has_more: boolean
  workflow_steps: unknown[]
  review_cycles: unknown[]
  attachments: unknown[]
  evidence: unknown[]
  activity_log: unknown[]
  activity_log_has_more: boolean
  // GAP-18 / W18: read-time derived expiry — true when next_review_date is in
  // the past and the policy isn't already approved-current. Cheap (1 cmp).
  is_expired: boolean
}

const PAGE = 10

/**
 * Pure helper: true when the policy is past `next_review_date`.
 *
 * Wave-19.1 / Q2 — this used to additionally exempt `status='approved'`
 * (and was applied as an OVERRIDE on the GET response, masking the
 * persisted `is_expired` column). That contradicted Hani's spec: only
 * `archived` and `renewed` are exclusions. An `approved` policy past its
 * review date SHOULD show `is_expired:true` — that's the case the Expired
 * StatCard surfaces. The override has been removed from the GET routes;
 * this helper is kept as a fallback for non-DB-trigger code paths (none
 * remain in production wiring) and so the persisted column is the single
 * source of truth.
 */
export function isPolicyExpired(row: {
  next_review_date?: string | null
  status?: string | null
}): boolean {
  if (!row.next_review_date) return false
  const today = new Date().toISOString().slice(0, 10)
  return row.next_review_date < today
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
    .maybeSingle<Omit<PolicyDetail,
      'current_version' | 'versions' | 'versions_has_more' | 'workflow_steps' |
      'review_cycles' | 'attachments' | 'evidence' | 'activity_log' |
      'activity_log_has_more'
    >>()
  if (error) throw error
  if (!policy) throw NotFound(`Policy ${policyId} not found`)

  // W15-5 / W18: fetch first-PAGE+1 of paginated tabs so the per-page tabs
  // get a first page + a `*_has_more` flag in one round-trip.
  const [versions, steps, cycles, attachments, evidence, activity] = await Promise.all([
    supabase
      .from('policy_versions')
      .select(POLICY_VERSION_COLUMNS)
      .eq('policy_id', policyId)
      .order('date', { ascending: false })
      .range(0, PAGE),
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
    supabase
      .from('policy_attachments')
      .select(POLICY_ATTACHMENT_COLUMNS)
      .eq('policy_id', policyId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('policy_evidence')
      .select(POLICY_EVIDENCE_COLUMNS)
      .eq('policy_id', policyId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('policy_activity_log')
      .select(POLICY_ACTIVITY_COLUMNS)
      .eq('policy_id', policyId)
      .order('timestamp', { ascending: false })
      .range(0, PAGE),
  ])

  const versionRows = (versions.data as unknown[]) ?? []
  const versionsHasMore = versionRows.length > PAGE
  const versionsFirstPage = versionsHasMore
    ? versionRows.slice(0, PAGE)
    : versionRows

  const activityRows = (activity.data as unknown[]) ?? []
  const activityHasMore = activityRows.length > PAGE
  const activityFirstPage = activityHasMore
    ? activityRows.slice(0, PAGE)
    : activityRows

  // Wave-19.1 / Q2 — ship the persisted `is_expired` column verbatim
  // (column lives on `policies`, kept current by the BEFORE INSERT/UPDATE
  // trigger from migration 055 + a daily pg_cron resync). The previous
  // overlay called `isPolicyExpired(policy)` which carved out `approved`
  // policies, contradicting Hani's Q2 spec — see helper docs.
  return {
    ...policy,
    current_version: versionsFirstPage[0] ?? null,
    versions: versionsFirstPage,
    versions_has_more: versionsHasMore,
    workflow_steps: (steps.data as unknown[]) ?? [],
    review_cycles: (cycles.data as unknown[]) ?? [],
    attachments: (attachments.data as unknown[]) ?? [],
    evidence: (evidence.data as unknown[]) ?? [],
    activity_log: activityFirstPage,
    activity_log_has_more: activityHasMore,
  }
}

// --- activity-log writer ----------------------------------------------------
// Pre-authorized: keep the existing `text_en` / `text_ar` dual-store on
// policy_activity_log (works for i18n; migration to {k,p} JSON deferred).

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

// --- version history --------------------------------------------------------
/** GAP-13 / W18 — a structured field-level diff entry. */
export interface PolicyFieldChange {
  field: string
  from: string
  to: string
}

/**
 * GAP-11 / GAP-19 — append a `policy_versions` history row when fields
 * changed. Fire-and-forget: a failure is logged but never breaks the caller's
 * PATCH response, same spirit as `writePolicyActivity`. `version` is a free-
 * text column on policy_versions (not a sequence), so we mirror the running
 * policy.version unless the caller passes an override.
 */
export async function insertPolicyVersion(
  supabase: SupabaseClient,
  policyId: string,
  versionLabel: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges?: PolicyFieldChange[] | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('policy_versions').insert({
      policy_id: policyId,
      version: versionLabel,
      date: new Date().toISOString().slice(0, 10),
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      // 054: `field_changes` is jsonb, nullable — pass null when nothing changed.
      field_changes: fieldChanges && fieldChanges.length > 0 ? fieldChanges : null,
    })
    if (error) throw error
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/policies] policy version insert failed', {
      error,
      policyId,
      text_en: body.text_en,
    })
  }
}

// --- status recompute -------------------------------------------------------

/**
 * Recompute and persist a policy's `status` from current state.
 *
 * Lifecycle (mutation-triggered — read-time `is_expired` covers the idle
 * gap, see `isPolicyExpired`):
 *   - `expired`     — past next_review_date and not currently approved
 *   - `requires-review` — within 90 days of next_review_date and approved
 *   - otherwise — leave as-is (workflow advance sets draft / under-review /
 *                 approved explicitly).
 *
 * Wrapped end-to-end in try/catch so callers can fire-and-forget.
 */
export async function recomputePolicyStatus(
  supabase: SupabaseClient,
  policyId: string,
): Promise<string | null> {
  try {
    const { data: row, error } = await supabase
      .from('policies')
      .select('status, next_review_date, last_overdue_date, overdue_count')
      .eq('id', policyId)
      .is('deleted_at', null)
      .maybeSingle<{
        status: string | null
        next_review_date: string | null
        last_overdue_date: string | null
        overdue_count: number | null
      }>()
    if (error) throw error
    if (!row) return null

    if (!row.next_review_date) return row.status

    const today = new Date().toISOString().slice(0, 10)
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 86_400_000)
      .toISOString()
      .slice(0, 10)

    let nextStatus = row.status
    const update: Record<string, unknown> = {}

    if (row.next_review_date < today) {
      // Past due — flip to expired unless already approved within cycle (we
      // intentionally don't auto-flip 'approved' here; user must initiate-review).
      if (row.status !== 'approved' && row.status !== 'expired') {
        nextStatus = 'expired'
        update.status = 'expired'
        // Bump overdue tracking when the trigger fires on a fresh due-date.
        if (row.last_overdue_date !== row.next_review_date) {
          update.overdue_count = (row.overdue_count ?? 0) + 1
          update.last_overdue_date = row.next_review_date
        }
      }
    } else if (
      row.next_review_date <= ninetyDaysFromNow &&
      row.status === 'approved'
    ) {
      nextStatus = 'requires-review'
      update.status = 'requires-review'
    }

    if (Object.keys(update).length > 0) {
      const { error: upErr } = await supabase
        .from('policies')
        .update(update)
        .eq('id', policyId)
        .is('deleted_at', null)
      if (upErr) throw upErr
    }
    return nextStatus
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/services/policies] recomputePolicyStatus failed', {
      error: e,
      policyId,
    })
    return null
  }
}
