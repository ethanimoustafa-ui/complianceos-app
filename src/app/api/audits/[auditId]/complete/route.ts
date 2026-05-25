// POST /api/audits/[auditId]/complete — transition status → completed.
// W26-A: assertUuid + dual-store timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
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
    const { supabase, user, profile } = await requirePerm('audit:edit')

    const { data: current, error: readErr } = await supabase
      .from('audits')
      .select('id, status, due_date, title')
      .eq('id', auditId)
      .maybeSingle<{ id: string; status: string; due_date: string; title: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Audit ${auditId} not found`)
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
