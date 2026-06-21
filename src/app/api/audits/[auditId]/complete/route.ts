// POST /api/audits/[auditId]/complete — transition status → completed.
// W26-A: assertUuid + dual-store timeline.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound, Conflict, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AUDIT_LIST_COLUMNS, insertAuditTimeline } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    // SEC-5: validate route param before any DB access.
    assertUuid(auditId)
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx

    const { data: current, error: readErr } = await supabase
      .from('audits')
      .select('id, status, due_date, title, assignee_id')
      .eq('id', auditId)
      .maybeSingle<{ id: string; status: string; due_date: string; title: string; assignee_id: string | null }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Audit ${auditId} not found`)
    // RBAC (ownership model): completing an audit requires the global
    // 'workflow:advance' grant (managers/admins by role; officers via the Access
    // Matrix) OR being the audit's ASSIGNEE (owner). The generic 'audit:edit'
    // (general editing) no longer grants it. Mirrors the policy/circular routes.
    if (!ctx.permissions.includes('workflow:advance') && current.assignee_id !== user.id) {
      throw Forbidden('Missing permission: workflow:advance (or audit ownership)')
    }
    if (current.status === 'completed') return ok({ id: auditId, status: 'completed' })
    if (current.status === 'pending') {
      throw Conflict('Cannot complete an audit that has not been started')
    }

    // Detect if closing overdue.
    const isOverdue = current.due_date
      ? new Date(current.due_date) < new Date()
      : false

    const { data, error } = await supabase
      .from('audits')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        closed_overdue: isOverdue,
      })
      .eq('id', auditId)
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    const actorName = profile.name ?? profile.email ?? user.id
    const dueDate = current.due_date
      ? new Date(current.due_date).toLocaleDateString()
      : 'earlier'

    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.complete',
        entity_type: 'audit',
        entity_id: auditId,
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'completed',
        i18nKey: isOverdue
          ? 'auditDetail.activityClosedOverdue'
          : 'auditDetail.activityStatusChanged',
        params: isOverdue
          ? { date: dueDate }
          : { from: current.status, to: 'completed' },
        userId: user.id,
        userName: actorName,
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
