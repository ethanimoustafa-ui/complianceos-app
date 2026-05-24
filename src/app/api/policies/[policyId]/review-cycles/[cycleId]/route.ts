// /api/policies/[policyId]/review-cycles/[cycleId] — GET / PATCH / DELETE
// with ETag + If-Match (W17.2 atomic pattern).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyReviewCycleSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_REVIEW_CYCLE_COLUMNS,
  assertPolicyExists,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; cycleId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId, cycleId } = await params
    assertUuid(policyId, cycleId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_review_cycles')
      .select(POLICY_REVIEW_CYCLE_COLUMNS)
      .eq('id', cycleId)
      .eq('policy_id', uuid)
      .maybeSingle<Record<string, unknown>>()
    if (error) throw error
    if (!data) throw NotFound(`Review cycle ${cycleId} not found`)
    const updatedAt = data.updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined
    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId, cycleId } = await params
    assertUuid(policyId, cycleId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const ifMatch = readIfMatch(req)
    const input = await parseJson(req, UpdatePolicyReviewCycleSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const { data: cur, error: curErr } = await supabase
        .from('policy_review_cycles')
        .select(POLICY_REVIEW_CYCLE_COLUMNS)
        .eq('id', cycleId)
        .eq('policy_id', uuid)
        .single()
      if (curErr) throw curErr
      return ok(cur)
    }

    let query = supabase
      .from('policy_review_cycles')
      .update(update)
      .eq('id', cycleId)
      .eq('policy_id', uuid)
    if (ifMatch != null) query = query.eq('updated_at', ifMatch)
    const { data, error } = await query.select(POLICY_REVIEW_CYCLE_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    const actor = profile.name ?? profile.email ?? user.id
    await writeAudit({
      actor_id: user.id,
      actor_name: actor,
      action: 'policy.review_cycle.update',
      entity_type: 'policy_review_cycle',
      entity_id: cycleId,
      metadata: { policy_id: uuid, fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { policyId, cycleId } = await params
    assertUuid(policyId, cycleId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const ifMatch = readIfMatch(req)

    const { data: prev, error: readErr } = await supabase
      .from('policy_review_cycles')
      .select('id, label')
      .eq('id', cycleId)
      .eq('policy_id', uuid)
      .maybeSingle<{ id: string; label: string }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Review cycle ${cycleId} not found`)

    let delQuery = supabase
      .from('policy_review_cycles')
      .delete()
      .eq('id', cycleId)
      .eq('policy_id', uuid)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { data: deleted, error } = await delQuery.select('id')
    if (error) throw error
    if (ifMatch != null && (!deleted || deleted.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const actor = profile.name ?? profile.email ?? user.id
    await writeAudit({
      actor_id: user.id,
      actor_name: actor,
      action: 'policy.review_cycle.delete',
      entity_type: 'policy_review_cycle',
      entity_id: cycleId,
      metadata: { policy_id: uuid, label: prev.label },
      supabase,
    })

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok({ id: cycleId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
