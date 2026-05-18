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
import { notifyPolicyStepAssignee } from '@/lib/api/services/notifications'

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

    // Optionally bump the targeted step, promote the next pending step to
    // 'current' (mirrors circular workflow advance), and notify its assignee.
    let promotedStep:
      | {
          id: string
          step: string
          note: string | null
          assigned_to: string | null
        }
      | null = null
    if (input.step_id) {
      const { data: completedStep, error: stepErr } = await supabase
        .from('policy_workflow_steps')
        .update({ status: 'completed', user_name: actor, note: input.note ?? null })
        .eq('id', input.step_id)
        .eq('policy_id', policyId)
        .select('id, sort_order')
        .single<{ id: string; sort_order: number }>()
      if (stepErr) throw stepErr

      // Promote the next pending step by sort_order to 'current'.
      const { data: nextRows, error: nextErr } = await supabase
        .from('policy_workflow_steps')
        .select('id, step, note, sort_order')
        .eq('policy_id', policyId)
        .eq('status', 'pending')
        .gt('sort_order', completedStep?.sort_order ?? 0)
        .order('sort_order', { ascending: true })
        .limit(1)
      if (nextErr) throw nextErr
      const next = (nextRows ?? [])[0] as
        | { id: string; step: string; note: string | null; assigned_to?: string | null }
        | undefined
      if (next) {
        const { error: promoteErr } = await supabase
          .from('policy_workflow_steps')
          .update({ status: 'current' })
          .eq('id', next.id)
        if (promoteErr) throw promoteErr
        promotedStep = {
          id: next.id,
          step: next.step,
          note: next.note ?? null,
          assigned_to: next.assigned_to ?? null,
        }
      }
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

    if (promotedStep) {
      const policyHeader = data as { id: string; ref_code: string | null; name: string }
      await notifyPolicyStepAssignee(supabase, {
        policy: {
          id: policyHeader.id,
          ref_code: policyHeader.ref_code ?? null,
          name: policyHeader.name,
        },
        step: {
          id: promotedStep.id,
          label: promotedStep.step,
          note: promotedStep.note,
          assigned_to: promotedStep.assigned_to,
        },
        actor: { id: user.id, name: actor },
      })
    }

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
