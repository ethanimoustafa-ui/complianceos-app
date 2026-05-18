// PATCH /api/policies/[policyId]/workflow/steps/[stepId]
//
// Updates editable fields on a single policy_workflow_steps row. Currently
// the only consumer is the inline-rename action in the policy detail view,
// but the schema covers description / action_type / step_state / sort_order /
// note / date so future UI can reuse without a new endpoint. Writes a
// `step_renamed` (or generic `workflow_step_updated`) activity log entry and
// audit record.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyWorkflowStepSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_WORKFLOW_STEP_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; stepId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId, stepId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, UpdatePolicyWorkflowStepSchema)

    // Snapshot the row first — we need the previous `step` label so we can
    // describe a rename diff in the activity log.
    const { data: prev, error: readErr } = await supabase
      .from('policy_workflow_steps')
      .select('id, step')
      .eq('id', stepId)
      .eq('policy_id', uuid)
      .maybeSingle<{ id: string; step: string }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Workflow step ${stepId} not found`)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      // Nothing to change — return the current row.
      const { data: current, error: curErr } = await supabase
        .from('policy_workflow_steps')
        .select(POLICY_WORKFLOW_STEP_COLUMNS)
        .eq('id', stepId)
        .single()
      if (curErr) throw curErr
      return ok(current)
    }

    const { data, error } = await supabase
      .from('policy_workflow_steps')
      .update(update)
      .eq('id', stepId)
      .eq('policy_id', uuid)
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    const isRename = input.step !== undefined && input.step !== prev.step
    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: isRename ? 'policy.workflow_step.rename' : 'policy.workflow_step.update',
        entity_type: 'policy_workflow_step',
        entity_id: stepId,
        metadata: {
          policy_id: uuid,
          previous_step: prev.step,
          fields: Object.keys(update),
        },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: isRename ? 'step_renamed' : 'workflow_step_updated',
        text_en: isRename
          ? `Workflow step renamed from "${prev.step}" to "${input.step}"`
          : `Workflow step "${prev.step}" updated`,
        text_ar: isRename
          ? `تمت إعادة تسمية الخطوة من "${prev.step}" إلى "${input.step}"`
          : `تم تحديث الخطوة "${prev.step}"`,
        user_name: actor,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
