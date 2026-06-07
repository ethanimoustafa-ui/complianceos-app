// POST /api/policies/[policyId]/workflow/advance
//
// Body: { action: 'submit-for-review' | 'approve' | 'undo' | 'initiate-review',
//         step_id?, note?, user_name? }
//
// Mutates `policy_workflow_steps` (status + step_state) and `policies.status`
// according to the action, writes a `policy_activity_log` entry, and
// revalidates cache. Permission gating uses `settings:edit`.
//
// W31 (P6) — each action now has DISTINCT step semantics. The previous version
// ran a single "complete step_id + promote next" block for every action, which
// (a) made `undo` advance the workflow FORWARD (P6.1 crash), (b) made the
// "request review" submit advance past the awaiting-approval state (P6.2), and
// never wrote `step_state` so the awaiting state was wiped on refetch.
// `initiate-review` now resets to the first existing step instead of relying on
// the client appending a phantom "Review Initiated" row (P6.3).

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
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'
import { notifyPolicyStepAssignee } from '@/lib/api/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

type StepRow = {
  id: string
  step: string
  note: string | null
  action_type: string | null
  sort_order: number
}

// When a step becomes 'current', its step_state is derived from its action_type
// so the correct action affordance renders (mirrors the client autoState logic
// in PolicyDetailsContent.handleConfirmAction). null → plain "move to next".
function deriveStepState(actionType: string | null): string | null {
  switch (actionType) {
    case 'request-approval':
    case 'send-for-review':
      return 'pending-approval'
    // P2 (W34): a send-email step must start with NO step_state so the "Send
    // Email" action renders. Auto-setting 'awaiting-response' here (and on the
    // client) skipped the send and jumped straight to "Received Response",
    // auto-completing the mail step. handleSendEmail sets 'awaiting-response'
    // only after the user actually sends.
    case 'send-email':
      return null
    case 'notify-manager':
      return 'awaiting-manager'
    default:
      return null
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    // W26-C param parity: assertPolicyExists accepts UUID or ref_code.
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const policyId = await assertPolicyExists(supabase, policyIdParam)
    const input = await parseJson(req, AdvancePolicyWorkflowSchema)

    const actor = input.user_name ?? profile.name ?? profile.email ?? user.id
    const today = new Date().toISOString().split('T')[0]

    let nextStatus: string | null = null
    let activityType = ''
    let textEn = ''
    let textAr = ''
    let runRecompute = false
    // Step promoted to 'current' this request — its assignee gets notified.
    let promotedStep: StepRow | null = null

    switch (input.action) {
      // ── Request review: the CURRENT step enters the awaiting-approval state.
      //    No completion, no promotion — just persist the waiting state so it
      //    survives the post-action refetch (P6.2).
      case 'submit-for-review': {
        if (input.step_id) {
          const { error } = await supabase
            .from('policy_workflow_steps')
            .update({ step_state: 'pending-approval' })
            .eq('id', input.step_id)
            .eq('policy_id', policyId)
          if (error) throw error
        }
        nextStatus = 'under-review'
        activityType = 'submitted_for_review'
        textEn = 'Policy submitted for review'
        textAr = 'تم تقديم السياسة للمراجعة'
        break
      }

      // ── Approve the current step and advance to exactly the next pending step
      //    (P6.2: one Approve = one cursor move). Persists user_name + date so
      //    the "Approved by … · date" caption survives reload (P5).
      case 'approve': {
        let completedSort = 0
        let hasNext = false
        if (input.step_id) {
          const { data: completedStep, error: stepErr } = await supabase
            .from('policy_workflow_steps')
            .update({
              status: 'completed',
              user_name: actor,
              date: today,
              note: input.note ?? null,
              step_state: null,
            })
            .eq('id', input.step_id)
            .eq('policy_id', policyId)
            .select('id, sort_order')
            .single<{ id: string; sort_order: number }>()
          if (stepErr) throw stepErr
          completedSort = completedStep?.sort_order ?? 0

          const { data: nextRows, error: nextErr } = await supabase
            .from('policy_workflow_steps')
            .select('id, step, note, action_type, sort_order')
            .eq('policy_id', policyId)
            .eq('status', 'pending')
            .gt('sort_order', completedSort)
            .order('sort_order', { ascending: true })
            .limit(1)
          if (nextErr) throw nextErr
          const next = (nextRows ?? [])[0] as StepRow | undefined
          if (next) {
            hasNext = true
            const { error: promoteErr } = await supabase
              .from('policy_workflow_steps')
              .update({ status: 'current', step_state: deriveStepState(next.action_type) })
              .eq('id', next.id)
            if (promoteErr) throw promoteErr
            promotedStep = next
          }
        }
        nextStatus = hasNext ? 'under-review' : 'approved'
        activityType = hasNext ? 'approval_step_committed' : 'workflow_approved'
        textEn = hasNext ? 'Workflow step approved' : 'Policy approved — all steps completed'
        textAr = hasNext
          ? 'تمت الموافقة على خطوة سير العمل'
          : 'تمت الموافقة على السياسة — اكتملت جميع الخطوات'
        runRecompute = true
        break
      }

      // ── Undo the last approval: demote the current step back to pending and
      //    revert the targeted (last-completed) step back to current. Must NOT
      //    complete anything — the old shared block did, which advanced the
      //    workflow forward and corrupted state (P6.1).
      case 'undo': {
        // Demote whatever is currently 'current' → 'pending'.
        const { error: demoteErr } = await supabase
          .from('policy_workflow_steps')
          .update({ status: 'pending', step_state: null })
          .eq('policy_id', policyId)
          .eq('status', 'current')
        if (demoteErr) throw demoteErr

        // Revert the targeted completed step → current. If no step_id supplied,
        // pick the highest-sort completed step.
        let revertId = input.step_id ?? null
        if (!revertId) {
          const { data: lastDone, error: lastErr } = await supabase
            .from('policy_workflow_steps')
            .select('id')
            .eq('policy_id', policyId)
            .eq('status', 'completed')
            .order('sort_order', { ascending: false })
            .limit(1)
          if (lastErr) throw lastErr
          revertId = (lastDone ?? [])[0]?.id ?? null
        }
        if (revertId) {
          const { error: revertErr } = await supabase
            .from('policy_workflow_steps')
            .update({
              status: 'current',
              step_state: null,
              date: null,
              user_name: null,
              note: null,
            })
            .eq('id', revertId)
            .eq('policy_id', policyId)
          if (revertErr) throw revertErr
        }

        // Undo always leaves an active 'current' step → the policy is back in
        // review. (Going to 'draft' would strand users without the approve
        // capability on the disabled "Submit for Review" action.)
        nextStatus = 'under-review'
        activityType = 'workflow_undone'
        textEn = 'Workflow step reverted'
        textAr = 'تم التراجع عن خطوة سير العمل'
        break
      }

      // ── Initiate a fresh review cycle: reset every step to pending and put the
      //    FIRST step (lowest sort_order) into 'current'. Never inserts a row —
      //    the client used to append a transient "Review Initiated" step that
      //    vanished on refetch (P6.3).
      case 'initiate-review': {
        const { error: resetErr } = await supabase
          .from('policy_workflow_steps')
          .update({ status: 'pending', step_state: null, date: null, user_name: null, note: null })
          .eq('policy_id', policyId)
        if (resetErr) throw resetErr

        const { data: firstRows, error: firstErr } = await supabase
          .from('policy_workflow_steps')
          .select('id, step, note, action_type, sort_order')
          .eq('policy_id', policyId)
          .order('sort_order', { ascending: true })
          .limit(1)
        if (firstErr) throw firstErr
        const first = (firstRows ?? [])[0] as StepRow | undefined
        if (first) {
          const { error: startErr } = await supabase
            .from('policy_workflow_steps')
            .update({ status: 'current', step_state: deriveStepState(first.action_type) })
            .eq('id', first.id)
          if (startErr) throw startErr
          promotedStep = first
        }
        nextStatus = 'under-review'
        activityType = 'review_initiated'
        textEn = 'Policy review initiated'
        textAr = 'تم بدء مراجعة السياسة'
        break
      }

      default:
        throw Conflict(`Unknown workflow action: ${input.action}`)
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
          assigned_to: null,
        },
        actor: { id: user.id, name: actor },
      })
    }

    // §2-7: server-authoritative recompute after status-affecting mutation.
    // Only for `approve` — recompute flips overdue policies to 'expired', which
    // would immediately revert an `initiate-review`/`undo` on a past-due policy.
    if (runRecompute) {
      await recomputePolicyStatus(supabase, policyId)
    }

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
