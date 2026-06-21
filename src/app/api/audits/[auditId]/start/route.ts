// POST /api/audits/[auditId]/start — transition status pending → in_progress.
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
      .select('id, status, title, assignee_id')
      .eq('id', auditId)
      .maybeSingle<{ id: string; status: string; title: string; assignee_id: string | null }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Audit ${auditId} not found`)
    // RBAC (ownership model): starting an audit requires the global
    // 'workflow:advance' grant (managers/admins by role; officers via the Access
    // Matrix) OR being the audit's ASSIGNEE (owner). The generic 'audit:edit'
    // (general editing) no longer grants it. Mirrors the policy/circular routes.
    if (!ctx.permissions.includes('workflow:advance') && current.assignee_id !== user.id) {
      throw Forbidden('Missing permission: workflow:advance (or audit ownership)')
    }
    if (current.status === 'in_progress') return ok({ id: auditId, status: 'in_progress' })
    if (current.status !== 'pending' && current.status !== 'overdue') {
      throw Conflict(`Cannot start audit in status ${current.status}`)
    }

    const { data, error } = await supabase
      .from('audits')
      .update({ status: 'in_progress' })
      .eq('id', auditId)
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    const actorName = profile.name ?? profile.email ?? user.id

    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.start',
        entity_type: 'audit',
        entity_id: auditId,
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'started',
        i18nKey: 'auditDetail.activityStatusChanged',
        params: { from: current.status, to: 'in_progress' },
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
