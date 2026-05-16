// /api/reports/compliance-evaluations/[id]
//
// The id is `${kind}:${itemId}::${deptId}`.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateEvaluationSchema } from '@/lib/api/schemas/reports'
import { EVALUATION_COLUMNS, assertEvaluationExists } from '@/lib/api/services/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('compliance_evaluations')
      .select(EVALUATION_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Compliance evaluation ${id} not found`)
    return ok(data, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.evaluations(id)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('report:create')
    await assertEvaluationExists(supabase, id)
    const patch = await parseJson(req, UpdateEvaluationSchema)

    const update: Record<string, unknown> = { evaluated_by: user.id, evaluated_at: new Date().toISOString() }
    if (patch.verdict !== undefined) update.verdict = patch.verdict
    if (patch.notes !== undefined) update.notes = patch.notes

    const { data, error } = await supabase
      .from('compliance_evaluations')
      .update(update)
      .eq('id', id)
      .select(EVALUATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_evaluation.update',
      entity_type: 'compliance_evaluation',
      entity_id: id,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([
      cacheTags.evaluations(),
      cacheTags.evaluations(id),
      cacheTags.evaluationScores(),
      cacheTags.compliance(),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('report:delete')
    await assertEvaluationExists(supabase, id)

    const { error } = await supabase.from('compliance_evaluations').delete().eq('id', id)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_evaluation.delete',
      entity_type: 'compliance_evaluation',
      entity_id: id,
      supabase,
    })

    revalidateAll([
      cacheTags.evaluations(),
      cacheTags.evaluations(id),
      cacheTags.evaluationScores(),
      cacheTags.compliance(),
    ])
    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
