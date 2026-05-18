// /api/observations/[observationId]/remediation/[planId] — PATCH (review).
//
// Approves or rejects a remediation plan. Sets `status` from the boolean
// `approved` flag, stamps `reviewed_at`, `reviewed_by`, and optional notes.
// Emits an observation_timeline entry so the activity feed reflects the
// decision.
//
// NOTE: `remediation_plans.reviewed_by` is a uuid FK to `profiles(id)`, so we
// store the reviewer's `user.id`. The reviewer's name is preserved on the
// timeline + audit log for human-readable display.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ReviewRemediationPlanSchema } from '@/lib/api/schemas/observations'
import {
  REMEDIATION_PLAN_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; planId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, planId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, ReviewRemediationPlanSchema)

    const update: Record<string, unknown> = {
      status: input.approved ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }
    if (input.notes !== undefined) update.review_notes = input.notes

    const { data, error } = await supabase
      .from('remediation_plans')
      .update(update)
      .eq('id', planId)
      .eq('observation_id', observationId)
      .select(REMEDIATION_PLAN_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Remediation plan ${planId} not found`)

    const reviewerName = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: reviewerName,
        action: input.approved
          ? 'observation.remediation.approve'
          : 'observation.remediation.reject',
        entity_type: 'remediation_plan',
        entity_id: planId,
        metadata: {
          observation_id: observationId,
          approved: input.approved,
          notes: input.notes ?? null,
        },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: input.approved
          ? 'remediation.approved'
          : 'remediation.rejected',
        description: input.approved
          ? `Remediation plan approved by ${reviewerName}`
          : `Remediation plan rejected by ${reviewerName}`,
        user_id: user.id,
        user_name: reviewerName,
        target_id: planId,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
