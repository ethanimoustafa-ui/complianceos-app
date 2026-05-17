// Audits service-layer helpers.
//
// Place reusable multi-step queries here. Route Handlers do the orchestration
// (auth, validation, audit-logging, cache invalidation) but call into these
// helpers for any non-trivial DB work.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------

/**
 * Columns returned on the audit list endpoint. Expanded to cover everything
 * the audit-card and /reports listing renders without a follow-up detail
 * fetch: description preview, due_date, status, framework_ids, type,
 * category, priority, progress, assignee_id. Detail-only data (team,
 * comments, documents, counts, review_schedule, frequency) lives on the
 * detail endpoint.
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
 * As of migration 042 audits are hard-deleted, so we no longer filter on
 * `deleted_at IS NULL` — a missing row really is missing.
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
    // audit_tasks still has a deleted_at column (no migration to hard-delete
    // those yet) — keep filtering tombstones out of the count.
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

  // Observations have no direct FK to audits in current schema (linked via
  // letter_observations / observation_team). Counted as 0 until that
  // relationship is added — Stage B can extend.
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
 * Ensure the audit exists before mutating it. Returns the row's id so callers
 * can use it in log writes. As of migration 042 audits are hard-deleted.
 */
export async function assertAuditExists(
  supabase: SupabaseClient,
  auditId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('audits')
    .select('id')
    .eq('id', auditId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Audit ${auditId} not found`)
  return data.id
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
