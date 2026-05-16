// /api/risks/[riskId] — item GET/PATCH/DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateRiskSchema } from '@/lib/api/schemas/risks'
import {
  RISK_LIST_COLUMNS,
  assertRiskExists,
  getRiskDetail,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase } = await requireUser()
    const detail = await getRiskDetail(supabase, riskId)
    return ok(detail, {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.risks(riskId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)
    const patch = await parseJson(req, UpdateRiskSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const detail = await getRiskDetail(supabase, riskId)
      return ok(detail)
    }

    const { data, error } = await supabase
      .from('risks')
      .update(update)
      .eq('id', riskId)
      .is('deleted_at', null)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.update',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'updated',
        user_id: user.id,
        notes: `Updated fields: ${Object.keys(update).join(', ')}`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    if (update.status !== undefined || update.likelihood !== undefined || update.impact !== undefined) {
      revalidate(cacheTags.compliance())
    }
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:delete')
    await assertRiskExists(supabase, riskId)

    const { error } = await supabase
      .from('risks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', riskId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'risk.delete',
      entity_type: 'risk',
      entity_id: riskId,
      supabase,
    })

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    revalidate(cacheTags.compliance())
    return ok({ id: riskId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
