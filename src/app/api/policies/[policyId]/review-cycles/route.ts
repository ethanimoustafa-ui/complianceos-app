// /api/policies/[policyId]/review-cycles — list + add a review cycle.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyReviewCycleSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_REVIEW_CYCLE_COLUMNS,
  assertPolicyExists,
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_review_cycles')
      .select(POLICY_REVIEW_CYCLE_COLUMNS)
      .eq('policy_id', uuid)
      .order('initiated_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, CreatePolicyReviewCycleSchema)

    const { data, error } = await supabase
      .from('policy_review_cycles')
      .insert({
        policy_id: uuid,
        label: input.label,
        initiated_at: input.initiated_at ?? new Date().toISOString(),
      })
      .select(POLICY_REVIEW_CYCLE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.review_cycle.create',
        entity_type: 'policy_review_cycle',
        entity_id: created.id,
        metadata: { policy_id: uuid, label: input.label },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'review_initiated',
        text_en: `Review cycle "${input.label}" initiated`,
        text_ar: `تم بدء دورة المراجعة "${input.label}"`,
        user_name: actor,
      }),
      recomputePolicyStatus(supabase, uuid),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
