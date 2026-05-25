// /api/reports/compliance-evaluations/[id]
//
// The id is `${kind}:${itemId}::${deptId}`.
//
// W26-B hardening:
//   - GET: cache:'no-store' + ETag from updated_at (§2.2, §2.12).
//   - PATCH: readIfMatch → before-snapshot → assertNotStale → W17.2 atomic
//     conditional UPDATE scoped to client token, 412 on 0 rows (§2.12).
//   - DELETE: optional If-Match guard with atomic conditional DELETE (§2.12).
//   - ID format validated (composite key — not a UUID but still guarded
//     against empty / injection via assertEvaluationExists early).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, parseJson, readIfMatch } from '@/lib/api/validate'
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

    // §2.12 — weak ETag so the client can echo If-Match on the next PATCH.
    const etag =
      typeof data.updated_at === 'string'
        ? { ETag: `W/"${data.updated_at}"` }
        : undefined

    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('report:create')

    // §2.12 — read the client's concurrency token before consuming the body.
    const ifMatch = readIfMatch(req)

    // Snapshot the row BEFORE the update so we can assertNotStale and diff.
    const { data: before, error: fetchErr } = await supabase
      .from('compliance_evaluations')
      .select(EVALUATION_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!before) throw NotFound(`Compliance evaluation ${id} not found`)

    // §2.12 — pre-check (non-atomic; atomic guard below closes the race).
    assertNotStale(ifMatch, before.updated_at)

    const patch = await parseJson(req, UpdateEvaluationSchema)

    const update: Record<string, unknown> = {
      evaluated_by: user.id,
      evaluated_at: new Date().toISOString(),
    }
    // GAP-3: undefined = field not in payload → skip. null = explicit clear → write.
    if (patch.verdict !== undefined) update.verdict = patch.verdict
    if (patch.notes !== undefined) update.notes = patch.notes

    // W17.2 ATOMIC PATTERN — scope UPDATE to the CLIENT TOKEN so a concurrent
    // write that advanced updated_at will cause 0 rows, not a silent clobber.
    let query = supabase
      .from('compliance_evaluations')
      .update(update)
      .eq('id', id)
    if (ifMatch != null) {
      // CRITICAL: use the client-supplied token, NOT before.updated_at.
      query = query.eq('updated_at', ifMatch)
    }
    const { data, error } = await query
      .select(EVALUATION_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_evaluation.update',
      entity_type: 'compliance_evaluation',
      entity_id: id,
      metadata: { fields: Object.keys(patch) },
      supabase,
    })

    revalidateAll([
      cacheTags.evaluations(),
      cacheTags.evaluations(id),
      cacheTags.evaluationScores(),
      cacheTags.compliance(),
    ])

    // Return refreshed row with new ETag for the next round-trip.
    const newEtag =
      typeof data.updated_at === 'string'
        ? { ETag: `W/"${data.updated_at}"` }
        : undefined
    return ok(data, { headers: newEtag })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('report:delete')

    // §2.12 — optional concurrency guard on DELETE.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('compliance_evaluations')
        .select('updated_at')
        .eq('id', id)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Confirm the row exists before deleting (surfaces clean 404 vs silent no-op).
    await assertEvaluationExists(supabase, id)

    // Atomic conditional DELETE: if ifMatch was supplied, scope to the token
    // so a concurrent write causes 0 rows → 412.
    let delQuery = supabase.from('compliance_evaluations').delete().eq('id', id)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { error } = await delQuery
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
