// POST /api/policies/[policyId]/workflow/reseed
//
// W37 — replace a policy's workflow steps with the steps for a given approval
// tier. Used when the user changes a policy's approval tier on an existing
// policy and opts in to "also reset the workflow steps to match the new tier".
// Deletes all current steps, seeds fresh from the tier (first → current, rest →
// pending), resets the policy to 'draft' (a fresh, un-started workflow), and
// logs it. Discards any in-progress workflow state by design — the client warns
// the user before calling this.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ReseedPolicyWorkflowSchema } from '@/lib/api/schemas/policies'
import {
  assertPolicyExists,
  resolveTierSeedSteps,
  tierSeedStepRows,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    assertUuid(policyIdParam)
    const { supabase, user, profile } = await requirePerm('edit')
    const policyId = await assertPolicyExists(supabase, policyIdParam)
    const input = await parseJson(req, ReseedPolicyWorkflowSchema)
    const actor = profile.name ?? profile.email ?? user.id

    // Wipe the existing steps, then seed fresh from the target tier.
    const { error: delErr } = await supabase
      .from('policy_workflow_steps')
      .delete()
      .eq('policy_id', policyId)
    if (delErr) throw delErr

    const seed = await resolveTierSeedSteps(supabase, input.tier)
    if (seed.length > 0) {
      const { error: insErr } = await supabase
        .from('policy_workflow_steps')
        .insert(tierSeedStepRows(policyId, seed))
      if (insErr) throw insErr
    }

    // Fresh workflow → back to 'draft' (the first step is 'current'; the user
    // starts the new flow from the beginning).
    const { error: statusErr } = await supabase
      .from('policies')
      .update({ status: 'draft' })
      .eq('id', policyId)
      .is('deleted_at', null)
    if (statusErr) throw statusErr

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.workflow.reseed',
        entity_type: 'policy',
        entity_id: policyId,
        metadata: { tier: input.tier, step_count: seed.length },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: policyId,
        type: 'workflow_reseeded',
        text_en: `Workflow steps reset to match the "${input.tier}" approval tier`,
        text_ar: `تمت إعادة ضبط خطوات سير العمل لتطابق مستوى الموافقة "${input.tier}"`,
        user_name: actor,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    return ok({ id: policyId, reseeded: true, step_count: seed.length })
  } catch (e) {
    return handle(e)
  }
}
