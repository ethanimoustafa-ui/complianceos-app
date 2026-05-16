// Tamper-proof audit-log writer.
//
// Every mutation route MUST call `writeAudit({...})` once on success. The
// `audit_logs` table is append-only at the DB role level (see migration 012).
//
// Fire-and-forget: this never throws into the request handler. If the insert
// fails we log and continue — the user request still succeeded. Audit gaps
// will surface in monitoring rather than crashing the request path.
//
// If `SUPABASE_SERVICE_ROLE_KEY` is set we use the service-role client (so the
// write doesn't depend on the user's RLS posture). Otherwise we fall back to
// the per-request user client (RLS allows authenticated INSERT into audit_logs).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient, hasServiceRole } from './admin'

export interface AuditEvent {
  /** Acting user. If omitted we attempt to derive from the supplied supabase client. */
  actor_id?: string
  /** Display name for the actor. Falls back to actor_id when omitted. */
  actor_name?: string
  /** Canonical action key — `'audit.create'`, `'audit.task.update'`, etc. */
  action: string
  /** Snake_case entity type — `'audit'`, `'audit_task'`, `'audit_template'`. */
  entity_type: string
  /** Primary key of the affected row, if any. */
  entity_id?: string
  /** Optional extra fields — diffed values, IP, request-id, etc. */
  metadata?: Record<string, unknown>
  /** Optional i18n key for the audit-log UI. */
  details_key?: string
  /** Optional i18n params for `details_key`. */
  details_params?: Record<string, unknown>
  /** Optional status. Defaults to `'completed'`. */
  status?: 'completed' | 'pending' | 'info' | 'failed'
  /** Optional pre-resolved supabase client (used as fallback when no service role). */
  supabase?: SupabaseClient
}

/**
 * Insert a row into `audit_logs`. Never throws.
 */
export async function writeAudit(event: AuditEvent): Promise<void> {
  try {
    const client = await pickClient(event.supabase)
    if (!client) return

    let actorId = event.actor_id
    let actorName = event.actor_name
    if (!actorId && event.supabase) {
      const { data } = await event.supabase.auth.getUser()
      if (data.user) {
        actorId = data.user.id
        actorName ??= data.user.email ?? actorId
      }
    }
    actorName ??= actorId ?? 'system'

    const row = {
      user_id: actorId ?? null,
      user_name: actorName,
      action: event.action,
      details_key: event.details_key ?? null,
      details_params: event.details_params ?? {},
      status: event.status ?? 'completed',
      target_type: event.entity_type,
      target_id: event.entity_id ?? null,
      metadata: event.metadata ?? {},
    }

    const { error } = await client.from('audit_logs').insert(row)
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/audit] failed to insert audit_logs row', { error, action: event.action })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/audit] writeAudit threw — swallowed', e)
  }
}

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

/**
 * Insert a row into the per-audit `audit_activity_logs` timeline. Same
 * fire-and-forget semantics as `writeAudit`.
 */
export async function writeAuditActivity(opts: {
  audit_id: string
  action: string
  description?: string
  user_id?: string
  user_name?: string
  metadata?: Record<string, unknown>
  supabase?: SupabaseClient
}): Promise<void> {
  try {
    const client = await pickClient(opts.supabase)
    if (!client) return
    const { error } = await client.from('audit_activity_logs').insert({
      audit_id: opts.audit_id,
      action: opts.action,
      description: opts.description ?? null,
      user_id: opts.user_id ?? null,
      user_name: opts.user_name ?? null,
      metadata: opts.metadata ?? {},
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/audit] audit_activity_logs insert failed', { error })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/audit] writeAuditActivity threw — swallowed', e)
  }
}
