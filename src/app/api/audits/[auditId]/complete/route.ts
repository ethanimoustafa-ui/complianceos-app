// POST /api/audits/[auditId]/complete — transition status → completed.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { AUDIT_LIST_COLUMNS } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')

    const { data: current, error: readErr } = await supabase
      .from('audits')
      .select('id, status')
      .eq('id', auditId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Audit ${auditId} not found`)
    if (current.status === 'completed') return ok({ id: auditId, status: 'completed' })
    if (current.status === 'pending') {
      throw Conflict('Cannot complete an audit that has not been started')
    }

    const { data, error } = await supabase
      .from('audits')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditId)
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.complete',
        entity_type: 'audit',
        entity_id: auditId,
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'completed',
        description: 'Audit completed',
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
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
