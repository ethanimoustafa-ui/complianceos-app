// POST /api/policies/[policyId]/workflow/advance
//
// Body: { action: 'submit-for-review' | 'approve' | 'undo' | 'initiate-review',
//         step_id?, note?, user_name? }
//
// Mutates `policy_workflow_steps.status` and `policies.status` according to the
// action, writes a `policy_activity_log` entry, and revalidates cache.
// Permission gating uses `settings:edit` per `Approve Policy Reviews`.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AdvancePolicyWorkflowSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_LIST_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, AdvancePolicyWorkflowSchema)

    const actor = input.user_name ?? profile.name ?? profile.email ?? user.id
    let nextStatus: string | null = null
    let activityType = ''
    let textEn = ''
    let textAr = ''

    switch (input.action) {
      case 'submit-for-review':
        nextStatus = 'under-review'
        activityType = 'submitted_for_review'
        textEn = 'Policy submitted for review'
        textAr = 'تم تقديم السياسة للمراجعة'
        break
      case 'approve':
        nextStatus = 'approved'
        activityType = 'approval_step_committed'
        textEn = 'Policy approved'
        textAr = 'تمت الموافقة على السياسة'
        break
      case 'undo':
        nextStatus = 'draft'
        activityType = 'workflow_undone'
        textEn = 'Policy workflow undone'
        textAr = 'تم التراجع عن سير العمل'
        break
      case 'initiate-review':
        nextStatus = 'requires-review'
        activityType = 'review_initiated'
        textEn = 'Policy review initiated'
        textAr = 'تم بدء مراجعة السياسة'
        break
      default:
        throw Conflict(`Unknown workflow action: ${input.action}`)
    }

    // Optionally bump the targeted step.
    if (input.step_id) {
      const stepRes = await supabase
        .from('policy_workflow_steps')
        .update({ status: 'completed', user_name: actor, note: input.note ?? null })
        .eq('id', input.step_id)
        .eq('policy_id', policyId)
      if (stepRes.error) throw stepRes.error
    }

    const { data, error } = await supabase
      .from('policies')
      .update({ status: nextStatus })
      .eq('id', policyId)
      .is('deleted_at', null)
      .select(POLICY_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: `policy.${input.action.replace(/-/g, '_')}`,
        entity_type: 'policy',
        entity_id: policyId,
        metadata: { step_id: input.step_id, note: input.note },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: policyId,
        type: activityType,
        text_en: textEn,
        text_ar: textAr,
        user_name: actor,
        note: input.note,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
