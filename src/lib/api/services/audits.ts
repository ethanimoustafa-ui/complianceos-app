// Audits service-layer helpers.
// W26-A: extended with dual-store timeline writer + version writer
// (PORTING-TEMPLATE §2.11 / Wave-19.1/19.4 patterns).
//
// Place reusable multi-step queries here. Route Handlers do the orchestration
// (auth, validation, audit-logging, cache invalidation) but call into these
// helpers for any non-trivial DB work.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'
import { renderBilingual } from '@/lib/i18n/server'
import { getAdminClient, hasServiceRole } from '../admin'

// --- selection lists ---------------------------------------------------------

/**
 * Columns returned on the audit list endpoint. `updated_at` is included so
 * the store can thread `If-Match` / ETag for optimistic locking (PORTING §2.12).
 */
export const AUDIT_LIST_COLUMNS =
  'id, title, description, type, status, priority, due_date, completed_at, closed_overdue, assignee_id, progress, category, framework_ids, created_at, updated_at'

/** Detail columns include everything except soft-delete bookkeeping. */
export const AUDIT_DETAIL_COLUMNS =
  'id, title, description, type, status, due_date, assignee_id, progress, category, frequency, priority, closed_overdue, completed_at, review_schedule, framework_ids, created_at, updated_at'

/** Columns returned by `audit_team_members` endpoints. */
export const AUDIT_TEAM_MEMBER_COLUMNS =
  'id, audit_id, user_id, role, is_owner, added_at'

/** Columns returned by `audit_comments` endpoints. */
export const AUDIT_COMMENT_COLUMNS =
  'id, audit_id, content, author_id, is_edited, created_at, updated_at'

/** Columns returned by `audit_documents` endpoints. */
export const AUDIT_DOCUMENT_COLUMNS =
  'id, audit_id, name, type, storage_path, uploaded_at, uploaded_by'

/** Columns returned by `audit_activity_logs` endpoints (dual-store). */
export const AUDIT_ACTIVITY_COLUMNS =
  'id, audit_id, action, description, text_en, text_ar, user_id, user_name, metadata, created_at'

/** Columns returned by `audit_versions`. */
export const AUDIT_VERSION_COLUMNS =
  'id, audit_id, changed_by, changed_by_name, field_changes, text_en, text_ar, created_at'

// --- field-label i18n key map ------------------------------------------------

/**
 * Maps DB column names to their `audits.field.*` i18n key for the per-field
 * diff display in version history. The key is stored in
 * `audit_versions.field_changes[].field` and rendered via `renderFieldLabel`.
 */
export const AUDIT_FIELD_LABEL_KEYS: Record<string, string> = {
  title:          'audits.field.title',
  description:    'audits.field.description',
  status:         'audits.field.status',
  priority:       'audits.field.priority',
  type:           'audits.field.type',
  category:       'audits.field.category',
  frequency:      'audits.field.frequency',
  due_date:       'audits.field.dueDate',
  assignee_id:    'audits.field.assignee',
  framework_ids:  'audits.field.frameworks',
  progress:       'audits.field.progress',
}

// --- audit detail w/ counts ---------------------------------------------------

export interface AuditDetail {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  due_date: string
  assignee_id: string | null
  progress: number
  category: string | null
  frequency: string | null
  priority: string
  closed_overdue: boolean
  completed_at: string | null
  review_schedule: unknown
  framework_ids: string[]
  created_at: string
  updated_at: string
  counts: { observations: number; tasks: number; documents: number; team_members: number }
}

/**
 * Fetch an audit by id together with the counts the detail page needs. Throws
 * `ApiError('not_found', 404)` if the audit is missing.
 *
 * cache: 'no-store' is enforced at the route level (W26-A: PORTING §2.2).
 */
export async function getAuditDetail(
  supabase: SupabaseClient,
  auditId: string,
): Promise<AuditDetail> {
  const { data: audit, error } = await supabase
    .from('audits')
    .select(AUDIT_DETAIL_COLUMNS)
    .eq('id', auditId)
    .maybeSingle<Omit<AuditDetail, 'counts'>>()
  if (error) throw error
  if (!audit) throw NotFound(`Audit ${auditId} not found`)

  const [tasks, documents, teamMembers] = await Promise.all([
    supabase
      .from('audit_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', auditId)
      .is('deleted_at', null),
    supabase
      .from('audit_documents')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', auditId),
    supabase
      .from('audit_team_members')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', auditId),
  ])

  return {
    ...audit,
    counts: {
      observations: 0,
      tasks: tasks.count ?? 0,
      documents: documents.count ?? 0,
      team_members: teamMembers.count ?? 0,
    },
  }
}

/**
 * Ensure the audit exists before mutating it. Returns the row's `updated_at`
 * so the caller can thread an ETag (PORTING §2.12 / If-Match guard).
 */
export async function assertAuditExists(
  supabase: SupabaseClient,
  auditId: string,
): Promise<{ id: string; updated_at: string }> {
  const { data, error } = await supabase
    .from('audits')
    .select('id, updated_at')
    .eq('id', auditId)
    .maybeSingle<{ id: string; updated_at: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Audit ${auditId} not found`)
  return data
}

/**
 * Status transition guard. Throws ApiError on invalid transitions.
 */
export function assertTransition(current: string, next: string): void {
  const ALLOWED: Record<string, string[]> = {
    pending: ['in_progress', 'overdue'],
    in_progress: ['completed', 'overdue'],
    overdue: ['in_progress', 'completed'],
    completed: [],
  }
  if (!ALLOWED[current]?.includes(next)) {
    throw new Error(`Invalid status transition ${current} → ${next}`)
  }
}

// ---------- dual-store timeline writer (W19.1 / Q8) --------------------------

/**
 * Insert a row into `audit_activity_logs` with dual-store text_en + text_ar.
 * Callers pass an i18n key + params; both languages are resolved at write time
 * via `renderBilingual` from `src/lib/i18n/server.ts`.
 *
 * Fire-and-forget: errors are logged but never re-thrown so the caller's
 * request succeeds even if the timeline write fails.
 */
export async function insertAuditTimeline(opts: {
  auditId: string
  action: string
  i18nKey: string
  params?: Record<string, string | { en: string; ar: string }>
  userId?: string | null
  userName?: string | null
  metadata?: Record<string, unknown>
  supabase?: SupabaseClient
}): Promise<void> {
  try {
    const client = await pickClient(opts.supabase)
    if (!client) return

    const { text_en, text_ar } = renderBilingual(opts.i18nKey, opts.params ?? {})

    const { error } = await client.from('audit_activity_logs').insert({
      audit_id: opts.auditId,
      action: opts.action,
      description: text_en, // backward-compat: keep description as English fallback
      text_en,
      text_ar,
      user_id: opts.userId ?? null,
      user_name: opts.userName ?? null,
      metadata: opts.metadata ?? {},
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[audits-svc] audit_activity_logs insert failed', { error })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audits-svc] insertAuditTimeline threw — swallowed', e)
  }
}

// ---------- version writer (W19.4 / Item-3) -----------------------------------

export interface AuditFieldChange {
  field: string  // i18n key from AUDIT_FIELD_LABEL_KEYS
  from: string
  to: string
}

/**
 * Insert a row into `audit_versions` with dual-store text_en + text_ar.
 * Only called when at least one field actually changed (per-field diff by
 * the PATCH route — P6 / FORENSIC countermeasure).
 *
 * Best-effort: if the `audit_versions` table doesn't exist yet (pre-migration
 * state) the insert fails silently.
 */
export async function insertAuditVersion(opts: {
  auditId: string
  changedBy?: string | null
  changedByName?: string | null
  fieldChanges: AuditFieldChange[]
  supabase?: SupabaseClient
}): Promise<void> {
  try {
    const client = await pickClient(opts.supabase)
    if (!client) return

    // Build a localized field-label list for the summary string.
    // Each field key is rendered in EN and AR per locale.
    const fieldLabelsEn = opts.fieldChanges.map((c) => c.field).join(', ')
    const fieldLabelsAr = opts.fieldChanges.map((c) => c.field).join('، ')

    const { text_en, text_ar } = renderBilingual('audits.activity.fieldsUpdated', {
      fields: { en: fieldLabelsEn, ar: fieldLabelsAr },
    })

    const { error } = await client.from('audit_versions').insert({
      audit_id: opts.auditId,
      changed_by: opts.changedBy ?? null,
      changed_by_name: opts.changedByName ?? null,
      field_changes: opts.fieldChanges,
      text_en,
      text_ar,
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[audits-svc] audit_versions insert failed', { error })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audits-svc] insertAuditVersion threw — swallowed', e)
  }
}

// ---------- client picker (mirrors advisory.ts pattern) ----------------------

async function pickClient(fallback?: SupabaseClient): Promise<SupabaseClient | null> {
  if (hasServiceRole()) {
    try {
      return getAdminClient()
    } catch {
      // fall through
    }
  }
  return fallback ?? null
}
