// POST /api/policies/[policyId]/workflow/set-phase-deadline
//
// Sets a deadline on a single workflow step. Writes a
// `phase_deadline_set`/`phase_deadline_changed` activity log entry.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { SetPhaseDeadlineSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_WORKFLOW_STEP_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    // W26-C: accepts UUID or ref_code → canonical UUID.
    const policyId = await assertPolicyExists(supabase, policyIdParam)
    const input = await parseJson(req, SetPhaseDeadlineSchema)

    // Read previous deadline so we can label set vs changed.
    const { data: prev, error: readErr } = await supabase
      .from('policy_workflow_steps')
      .select('id, date')
      .eq('id', input.step_id)
      .eq('policy_id', policyId)
      .maybeSingle<{ id: string; date: string | null }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Workflow step ${input.step_id} not found`)

    const { data, error } = await supabase
      .from('policy_workflow_steps')
      .update({ date: input.deadline })
      .eq('id', input.step_id)
      .eq('policy_id', policyId)
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    const wasSet = prev.date != null
    const activityType = wasSet ? 'phase_deadline_changed' : 'phase_deadline_set'

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: `policy.${activityType}`,
        entity_type: 'policy_workflow_step',
        entity_id: input.step_id,
        metadata: {
          policy_id: policyId,
          previous: prev.date,
          new: input.deadline,
        },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: policyId,
        type: activityType,
        text_en: wasSet
          ? `Phase deadline changed to ${input.deadline ?? 'none'}`
          : `Phase deadline set to ${input.deadline ?? 'none'}`,
        text_ar: wasSet
          ? `تم تغيير الموعد النهائي للمرحلة إلى ${input.deadline ?? 'لا شيء'}`
          : `تم تعيين الموعد النهائي للمرحلة إلى ${input.deadline ?? 'لا شيء'}`,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
