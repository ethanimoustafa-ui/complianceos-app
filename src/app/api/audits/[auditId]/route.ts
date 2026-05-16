// /api/audits/[auditId] — item endpoint.
//
//   GET    — detail (includes nested counts)
//   PATCH  — partial update         (requires `audit:edit`)
//   DELETE — soft-delete             (requires `audit:delete`)

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { UpdateAuditSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_LIST_COLUMNS,
  assertAuditExists,
  getAuditDetail,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase } = await requireUser()
    const detail = await getAuditDetail(supabase, auditId)
    return ok(detail, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.audits(auditId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const patch = await parseJson(req, UpdateAuditSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      // Nothing to update; just return the current row.
      const detail = await getAuditDetail(supabase, auditId)
      return ok(detail)
    }

    const { data, error } = await supabase
      .from('audits')
      .update(update)
      .eq('id', auditId)
      .is('deleted_at', null)
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.update',
        entity_type: 'audit',
        entity_id: auditId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'updated',
        description: `Updated fields: ${Object.keys(update).join(', ')}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase, user, profile } = await requirePerm('audit:delete')
    await assertAuditExists(supabase, auditId)

    const { error } = await supabase
      .from('audits')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', auditId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.delete',
      entity_type: 'audit',
      entity_id: auditId,
      supabase,
    })

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    revalidate(cacheTags.compliance())
    return ok({ id: auditId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
