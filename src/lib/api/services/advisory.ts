// Advisory service helpers: column lists + reference generator + existence guard
// + dual-store timeline writer + version writer.
//
// W23 PORTING-TEMPLATE §2 countermeasures applied:
//   - `insertAdvisoryTimeline` — dual-store text_en + text_ar via renderBilingual (§2.11 / P6).
//   - `insertAdvisoryVersion` — dual-store version-history (§2.11 / Wave-19.4 Item-3).
//   - `ADVISORY_FIELD_LABEL_KEYS` — i18n key map for per-field diff labels (§3 gotcha).
//   - Best-effort guards on both writers so the PATCH route works even before
//     migration 066 is applied (same pattern as observation_versions / letter_versions).

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'
import { renderBilingual } from '@/lib/i18n/server'
import { getAdminClient, hasServiceRole } from '../admin'

// ---------- shared select columns -------------------------------------------

// F1 fix: include description (for inline preview) and advisory_notes count
// (for the notes badge in list rows). PostgREST returns the count embed as
// advisory_notes:[{count:N}] — mapRow coerces this to a length-N notes array
// stub so advisory.notes.length works on the list without a full detail fetch.
export const ADVISORY_LIST_COLUMNS =
  'id, ref, subject, description, business_unit, status, priority, requested_by, requested_date, assigned_to, created_at, updated_at, advisory_notes(count)'

export const ADVISORY_DETAIL_COLUMNS =
  'id, ref, subject, description, business_unit, status, priority, requested_by, requested_date, assigned_to, created_at, updated_at'

// ---------- field-label i18n key map ----------------------------------------

/**
 * Maps DB column names to their `advisory.*` i18n key for the per-field diff
 * display in version history. The key is stored in
 * `advisory_versions.field_changes[].field` and rendered via
 * `renderFieldLabel(key, t)` on the client.
 *
 * W23 PORTING-TEMPLATE §3 — field labels are i18n keys, NOT stored English strings.
 */
export const ADVISORY_FIELD_LABEL_KEYS: Record<string, string> = {
  subject:        'advisory.subject',
  description:    'advisory.description',
  status:         'advisory.status',
  priority:       'advisory.priority',
  business_unit:  'advisory.businessUnit',
  requested_by:   'advisory.requestedBy',
  requested_date: 'advisory.requestDate',
  assigned_to:    'advisory.assignedTo',
}

// ---------- reference-number generator --------------------------------------

/**
 * Reference format: `ADV-NNNN` (zero-padded sequential, year-agnostic).
 *
 * SEC-11: server-authoritative — client-supplied values are never trusted.
 * Race-condition mitigation: caller retries up to 3× on unique violation (23505).
 *
 * RLS note: We use the service-role client (when available) so that soft-deleted
 * rows (deleted_at IS NOT NULL) are visible. The advisory_requests SELECT policy
 * filters `deleted_at IS NULL`, meaning the user client would miss deleted rows
 * and generate a ref that collides with an existing (deleted) row → 23505.
 * Bypassing RLS here is safe — we only SELECT the `ref` column to compute the
 * next sequential value; no data is returned to callers.
 */
export async function nextAdvisoryReference(_supabase: SupabaseClient): Promise<string> {
  // Use admin client to bypass RLS so deleted rows are included in the max-ref
  // scan. Falls back to the user client when the service role key is absent.
  const client = hasServiceRole() ? getAdminClient() : _supabase
  const { data, error } = await client
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

// ---------- existence guard -------------------------------------------------

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

// ---------- dual-store timeline insert --------------------------------------

/**
 * W23 P6 fix — dual-store timeline insert.
 *
 * Callers pass a `renderBilingual`-style i18n key + params; both languages
 * are resolved at write time via `renderBilingual` from `src/lib/i18n/server`.
 *
 * Best-effort: silently no-ops when `advisory_timeline` is absent (42P01) so
 * other routes continue working even before migration 066 runs (mirrors the
 * observation_timeline / letter_timeline pattern from Wave-20/21).
 */
export async function insertAdvisoryTimeline(
  supabase: SupabaseClient,
  advisoryId: string,
  i18nKey: string,
  params: Record<string, string | { en: string; ar: string }>,
  userName: string,
  status: string = 'completed',
): Promise<void> {
  const { text_en, text_ar } = renderBilingual(i18nKey, params)
  const { error } = await supabase
    .from('advisory_timeline')
    .insert({
      advisory_id: advisoryId,
      text_en,
      text_ar,
      user_name: userName,
      status,
    })
  if (error) {
    // 42P01 = undefined_table: migration 066 not yet applied — ignore.
    if ((error as { code?: string }).code === '42P01') return
    // eslint-disable-next-line no-console
    console.error('[api/services/advisory] timeline insert failed', { error, advisoryId, i18nKey })
  }
}

// ---------- version insert --------------------------------------------------

export interface AdvisoryFieldChange {
  field: string // i18n key from ADVISORY_FIELD_LABEL_KEYS
  from: string
  to: string
}

/**
 * W23 — persist a version-history row.
 *
 * Dual-store: `text_en` + `text_ar` are fully-rendered summary strings
 * (from `renderBilingual`). `field_changes` carries the structured per-field
 * diff. The table is append-only; no PATCH/DELETE route.
 *
 * Best-effort: silently no-ops when `advisory_versions` is absent (42P01).
 */
export async function insertAdvisoryVersion(
  supabase: SupabaseClient,
  advisoryId: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges: AdvisoryFieldChange[],
): Promise<void> {
  const { error } = await supabase
    .from('advisory_versions')
    .insert({
      advisory_id: advisoryId,
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      field_changes: fieldChanges.length > 0 ? fieldChanges : null,
    })
  if (error) {
    if ((error as { code?: string }).code === '42P01') return
    // eslint-disable-next-line no-console
    console.error('[api/services/advisory] version insert failed', { error, advisoryId })
  }
}

/**
 * Compose the dual-store body for a "fields updated" event.
 * Returns null when `changedKeys` is empty (no-op patch).
 */
export function advisoryFieldsUpdatedBody(
  changedKeys: string[],
): { text_en: string; text_ar: string } | null {
  if (changedKeys.length === 0) return null
  const { text_en, text_ar } = renderBilingual('advisory.fieldsUpdated', {
    fields: {
      en: changedKeys.map((k) => ADVISORY_FIELD_LABEL_KEYS[k] ?? k).join(', '),
      ar: changedKeys.map((k) => ADVISORY_FIELD_LABEL_KEYS[k] ?? k).join('، '),
    },
  })
  return { text_en, text_ar }
}
