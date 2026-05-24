// SAMA letters service helpers.
//
// Wave-21 — full pattern-stack applied:
//   - `insertLetterTimeline` now writes dual-store text_en + text_ar via
//     `renderBilingual` (P6 fix). Callers pass an i18n key + params.
//   - `insertLetterVersion` — new, mirrors `insertObservationVersion`.
//   - `LETTER_FIELD_LABEL_KEYS` — i18n key map for per-field diff labels.
//   - Reference-number generation, approval-step state machine, and
//     placeholder rendering are unchanged.

import type { SupabaseClient } from '@supabase/supabase-js'
import { Conflict, NotFound } from '../errors'
import { renderBilingual } from '@/lib/i18n/server'

// ---------- shared select columns -------------------------------------------

export const LETTER_LIST_COLUMNS =
  'id, reference, authority, type, sub_category, sama_department, subject, status, priority, created_by, assigned_to, sent_date, response_deadline, response_received_date, framework_ids, created_at, updated_at'

export const LETTER_DETAIL_COLUMNS =
  'id, reference, authority, type, sub_category, sama_department, subject, subject_ar, body, body_ar, status, priority, created_by, assigned_to, sent_date, response_deadline, response_received_date, recipient_name, recipient_org, recipient_city, recipient_name_ar, recipient_org_ar, recipient_city_ar, signer_name, signer_title, signer_name_ar, signer_title_ar, signature_image_url, framework_ids, placeholder_defs, placeholder_values, created_at, updated_at'

export const LETTER_TEMPLATE_COLUMNS =
  'id, name, type, icon, color, description, status, default_subject_en, default_subject_ar, default_body_en, default_body_ar, default_signer_name, default_signer_title, default_signer_name_ar, default_signer_title_ar, default_signature_image_url, default_sama_department, default_recipient_name, default_recipient_org, default_recipient_city, default_recipient_name_ar, default_recipient_org_ar, default_recipient_city_ar, placeholder_defs, usage_count, created_at, updated_at'

// ---------- type → reference prefix + response window -----------------------

/**
 * Reference-number prefixes per letter type. Server is the sole producer of
 * letter references — generation happens via `nextLetterReference()` below.
 */
export const REFERENCE_PREFIX_BY_TYPE: Record<string, string> = {
  'non-objection': 'NOB',
  'inquiry': 'INQ',
  'submission': 'SUB',
  'notification': 'NOT',
}

/**
 * Response-deadline window in days per letter type. Applied on `submit` (and
 * `send`) to compute `response_deadline` from `now()`.
 */
export const RESPONSE_DAYS_BY_TYPE: Record<string, number> = {
  'non-objection': 30,
  'inquiry': 21,
  'submission': 45,
  'notification': 10,
}

export function referencePrefix(type: string): string {
  const mapped = REFERENCE_PREFIX_BY_TYPE[type]
  if (mapped) return mapped
  const head = type.toUpperCase().slice(0, 3)
  return head || 'LTR'
}

export function computeResponseDeadline(type: string, from: Date = new Date()): string {
  const days = RESPONSE_DAYS_BY_TYPE[type] ?? 30
  const d = new Date(from.getTime() + days * 24 * 3600 * 1000)
  return d.toISOString()
}

// ---------- existence guard --------------------------------------------------

export async function assertLetterExists(
  supabase: SupabaseClient,
  letterId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('letters')
    .select('id')
    .eq('id', letterId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Letter ${letterId} not found`)
  return data.id
}

// ---------- reference-number generator --------------------------------------

/**
 * Generate the next reference number for a (authority, type, year) bucket.
 *
 * Format: `<AUTHORITY>-<TYPE-PREFIX>-<YYYY>-<NNNN>` (e.g. `SAMA-NOB-2026-0001`).
 *
 * Implemented as: SELECT the current max suffix for this bucket, increment by
 * one. Race-condition mitigation: we retry the INSERT up to 3 times on unique
 * violation of `letters.reference`. The caller (POST /api/letters) is
 * responsible for catching the returned reference and feeding it into the
 * insert. There is no `reference_sequences` table in current schema; if/when
 * one is added a SELECT … FOR UPDATE on a row in that table would be more
 * efficient.
 */
export async function nextLetterReference(
  supabase: SupabaseClient,
  authority: string,
  type: string,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear()
  const prefix = `${authority.toUpperCase()}-${referencePrefix(type)}-${year}-`

  const { data, error } = await supabase
    .from('letters')
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

// ---------- placeholder render (server clone of lib/letter-placeholders.ts) -

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g

interface PlaceholderRefValueSrv {
  kind: string
  id: string
  reference: string
  title: string
}
type PlaceholderValueSrv =
  | { type: 'date'; value: string }
  | { type: 'reference'; value: PlaceholderRefValueSrv }

/** Substitute `{{tokens}}` in `text` using the supplied values map. */
export function renderTemplate(
  text: string,
  values: Record<string, PlaceholderValueSrv | undefined>,
): string {
  return text.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const v = values[key]
    if (!v) return `[${key}]`
    if (v.type === 'reference') return `${v.value.reference} — ${v.value.title}`
    return v.value
  })
}

/**
 * Apply placeholder rendering to a letter's `subject` / `body` / `subject_ar` /
 * `body_ar` based on its current `placeholder_values`. Returns the patched
 * fields only when source text contains tokens; otherwise an empty record.
 *
 * Note: we intentionally do NOT mutate the canonical body — we render a
 * shadow copy on save into `subject_rendered` / `body_rendered` columns if
 * those exist, falling back to no-op when they don't (current schema only
 * stores the template-form body).
 *
 * For now this helper just returns the rendered text so callers can decide
 * whether to persist it. The frontend continues to render live preview using
 * `src/lib/letter-placeholders.ts`.
 */
export function renderLetterFields(
  fields: { subject?: string; subject_ar?: string; body?: string; body_ar?: string },
  values: Record<string, PlaceholderValueSrv | undefined>,
): {
  subject_rendered: string | null
  subject_ar_rendered: string | null
  body_rendered: string | null
  body_ar_rendered: string | null
} {
  return {
    subject_rendered: fields.subject ? renderTemplate(fields.subject, values) : null,
    subject_ar_rendered: fields.subject_ar ? renderTemplate(fields.subject_ar, values) : null,
    body_rendered: fields.body ? renderTemplate(fields.body, values) : null,
    body_ar_rendered: fields.body_ar ? renderTemplate(fields.body_ar, values) : null,
  }
}

// ---------- approval-step state machine ------------------------------------

export interface ApprovalStepRow {
  id: string
  letter_id: string
  step: number
  role: string
  status: 'pending' | 'approved' | 'rejected'
  assigned_to: string | null
  approved_at: string | null
  rejected_at: string | null
  notes: string | null
}

/**
 * Fetch all approval steps for a letter, ordered by step ascending. Throws
 * NotFound if the letter has no approval steps configured.
 */
export async function getApprovalSteps(
  supabase: SupabaseClient,
  letterId: string,
): Promise<ApprovalStepRow[]> {
  const { data, error } = await supabase
    .from('letter_approval_steps')
    .select('id, letter_id, step, role, status, assigned_to, approved_at, rejected_at, notes')
    .eq('letter_id', letterId)
    .order('step', { ascending: true })
  if (error) throw error
  return (data ?? []) as ApprovalStepRow[]
}

/**
 * Guard: ensure that the step the caller wants to approve/reject is the
 * *current* one (first pending step). Throws Conflict otherwise.
 */
export function assertIsCurrentStep(steps: ApprovalStepRow[], stepIndex: number): void {
  const firstPending = steps.find((s) => s.status === 'pending')
  if (!firstPending) throw Conflict('No pending approval step')
  if (firstPending.step !== stepIndex) {
    throw Conflict(`Step ${stepIndex} is not the current step (current=${firstPending.step})`)
  }
}

// ---------- field-label i18n key map ----------------------------------------

/**
 * Maps DB column names to their `letters.*` i18n key for the per-field diff
 * display in version history. The key is stored in `letter_versions.field_changes[].field`
 * and rendered via `renderFieldLabel(key, t)` on the client.
 *
 * Wave-21 PORTING-TEMPLATE §3 — field labels are i18n keys, NOT stored English
 * strings (the one remaining surface where this gotcha applies per the template).
 */
export const LETTER_FIELD_LABEL_KEYS: Record<string, string> = {
  subject:           'letters.subject',
  subject_ar:        'letters.subjectArUpdated',
  body:              'letters.bodyUpdated',
  body_ar:           'letters.bodyArUpdated',
  priority:          'letters.priorityUpdated',
  sama_department:   'letters.departmentUpdated',
  type:              'letters.letterTypeUpdated',
  sub_category:      'letters.subCategoryUpdated',
  signer_name:       'letters.signerNameUpdated',
  signer_title:      'letters.signerTitleUpdated',
  signer_name_ar:    'letters.signerNameUpdated',
  signer_title_ar:   'letters.signerTitleUpdated',
  recipient_name:    'letters.recipientNameUpdated',
  recipient_org:     'letters.recipientOrgUpdated',
  recipient_city:    'letters.recipientNameUpdated',
  recipient_name_ar: 'letters.recipientNameUpdated',
  recipient_org_ar:  'letters.recipientOrgUpdated',
  recipient_city_ar: 'letters.recipientNameUpdated',
  assigned_to:       'letters.metadata',
  status:            'letters.statusResponseReceived',
  authority:         'letters.authorityField',
  framework_ids:     'letters.tableAuthority',
  response_deadline: 'letters.overdueReplies',
}

// ---------- dual-store timeline insert --------------------------------------

/**
 * Wave-21 P6 fix — dual-store timeline insert.
 *
 * Callers pass a `renderBilingual`-style i18n key + params; both languages
 * are resolved at write time via `renderBilingual` from `src/lib/i18n/server`.
 * The legacy `title` column is set to `text_en` for backward-compat with any
 * remaining readers that haven't been migrated to dual-store.
 *
 * REPLACES the old signature `insertLetterTimeline(supabase, letterId, rawTitle, userName, status)`.
 */
export async function insertLetterTimeline(
  supabase: SupabaseClient,
  letterId: string,
  i18nKey: string,
  params: Record<string, string | { en: string; ar: string }>,
  userName: string,
  status: string = 'completed',
): Promise<void> {
  const { text_en, text_ar } = renderBilingual(i18nKey, params)
  const { error } = await supabase
    .from('letter_timeline')
    .insert({
      letter_id: letterId,
      title: text_en, // backward-compat: legacy `title` col keeps the English string
      text_en,
      text_ar,
      user_name: userName,
      status,
    })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[api/services/letters] timeline insert failed', { error, letterId, i18nKey })
  }
}

// ---------- version insert --------------------------------------------------

export interface LetterFieldChange {
  field: string // i18n key from LETTER_FIELD_LABEL_KEYS
  from: string
  to: string
}

/**
 * Wave-21 — persist a version-history row.
 *
 * Dual-store: `text_en` + `text_ar` are the fully-rendered summary strings
 * (from `renderBilingual`). `field_changes` carries the structured per-field
 * diff. The table is append-only; no PATCH/DELETE route.
 *
 * Best-effort: silently no-ops when `letter_versions` is absent (42P01) so
 * PATCH routes continue to work even before migration 065 runs (mirrors the
 * observation_versions guard from Wave-20).
 */
export async function insertLetterVersion(
  supabase: SupabaseClient,
  letterId: string,
  body: { text_en: string; text_ar: string },
  author: string,
  fieldChanges: LetterFieldChange[],
): Promise<void> {
  const { error } = await supabase
    .from('letter_versions')
    .insert({
      letter_id: letterId,
      author,
      text_en: body.text_en,
      text_ar: body.text_ar,
      field_changes: fieldChanges.length > 0 ? fieldChanges : null,
    })
  if (error) {
    // 42P01 = undefined_table: migration 065 not yet applied — ignore.
    if ((error as { code?: string }).code === '42P01') return
    // eslint-disable-next-line no-console
    console.error('[api/services/letters] version insert failed', { error, letterId })
  }
}

/**
 * Compose the dual-store body for a "fields updated" event.
 * Returns null when `changedKeys` is empty (no-op patch).
 */
export function letterFieldsUpdatedBody(
  changedKeys: string[],
): { text_en: string; text_ar: string } | null {
  if (changedKeys.length === 0) return null
  const fieldLabels = changedKeys.map((k) => {
    const labelKey = LETTER_FIELD_LABEL_KEYS[k] ?? k
    return { en: labelKey, ar: labelKey } // renderBilingual resolves these per locale
  })
  // Build a bilingual comma-joined field list that resolves per locale.
  const { text_en, text_ar } = renderBilingual('letters.letterFieldsUpdated', {
    fields: {
      en: fieldLabels.map((l) => l.en).join(', '),
      ar: fieldLabels.map((l) => l.ar).join('، '),
    },
  })
  return { text_en, text_ar }
}
