// POST /api/policies/[policyId]/workflow/advance
//
// Body: { action, step_id?, note?, user_name? } where action is one of (see
//   AdvancePolicyWorkflowSchema): 'submit-for-review' | 'approve' | 'reject' |
//   'acknowledge' | 'undo' | 'initiate-review' | 'notify-manager' | 'send-email' |
//   'request-approval'. Every action writes a policy_activity_log row, and the
//   step "start" actions (notify-manager/send-email/request-approval) also move
//   a draft policy to under-review. Each action that targets a step refuses
//   (409) when no target/current step can be resolved, so the audit trail never
//   records a transition that didn't actually happen.
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
import { requireUser, hasEditOrOwnership } from '@/lib/api/auth'
import { handle, NotFound, Conflict, Forbidden } from '@/lib/api/errors'
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
function deriveStepState(_actionType: string | null): string | null {
  // ISSUE-5/6/7 (W34.2): steps no longer auto-enter an awaiting/pending state when
  // promoted to current. Each step shows its ACTION button first (submit-for-review
  // / send-email / notify-manager); the awaiting/pending state is set + persisted
  // only when the user clicks that action (PATCH the step's step_state).
  return null
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    // W26-C param parity: assertPolicyExists accepts UUID or ref_code.
    // W38: was requirePerm('settings:edit') — an org_admin-only key that locked
    // compliance officers out of submit/approve/initiate-review. 'edit' matches
    // every other policy mutation route (PATCH, steps, reseed).
    // RBAC (ownership): the policy OWNER may drive their own workflow even
    // without the global 'edit' permission; everyone else needs 'edit'
    // (managers/admins hold it via their role). Mirrors the policies_update /
    // policy_workflow_steps RLS predicates (migration 114).
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    const policyId = await assertPolicyExists(supabase, policyIdParam)
    let ownerId: string | null = null
    if (!ctx.permissions.includes('edit')) {
      const { data: ownerRow } = await supabase
        .from('policies')
        .select('owner_id')
        .eq('id', policyId)
        .maybeSingle<{ owner_id: string | null }>()
      ownerId = ownerRow?.owner_id ?? null
    }
    if (!hasEditOrOwnership(ctx, ownerId)) {
      throw Forbidden('Missing permission: edit (or policy ownership)')
    }
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
        // Resolve the step to complete (explicit, else current). This is a
        // COMPLETION op — it must have a real target. Without one, approve would
        // otherwise fall through and silently mark the policy 'approved' with no
        // step actually completed, so refuse it.
        let approveId = input.step_id ?? null
        if (!approveId) {
          const { data: cur, error: curErr } = await supabase
            .from('policy_workflow_steps')
            .select('id')
            .eq('policy_id', policyId)
            .eq('status', 'current')
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle<{ id: string }>()
          if (curErr) throw curErr
          approveId = cur?.id ?? null
        }
        if (!approveId) throw Conflict('No current step to approve')

        let hasNext = false
        const { data: completedStep, error: stepErr } = await supabase
          .from('policy_workflow_steps')
          .update({
            status: 'completed',
            user_name: actor,
            date: today,
            note: input.note ?? null,
            step_state: null,
          })
          .eq('id', approveId)
          .eq('policy_id', policyId)
          .select('id, sort_order')
          .single<{ id: string; sort_order: number }>()
        if (stepErr) throw stepErr
        const completedSort = completedStep?.sort_order ?? 0

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
        nextStatus = hasNext ? 'under-review' : 'approved'
        activityType = hasNext ? 'approval_step_committed' : 'workflow_approved'
        textEn = hasNext ? 'Workflow step approved' : 'Policy approved — all steps completed'
        textAr = hasNext
          ? 'تمت الموافقة على خطوة سير العمل'
          : 'تمت الموافقة على السياسة — اكتملت جميع الخطوات'
        runRecompute = true
        break
      }

      // ── Reject / deny the CURRENT step: clear its step_state back to null so
      //    the step's action button (Submit for Approval / Notify Manager / …)
      //    renders again, and log the denial. The step is NOT completed and the
      //    cursor does NOT move — the user re-runs the action. Persisting this
      //    here is the fix for the prior "deny resets / stays stale" bug: the
      //    client used to only call the policy PATCH (which drops nested
      //    workflowTimeline edits), so the DB kept step_state='pending-approval'
      //    /'awaiting-manager' and the stale state snapped back on the next fetch.
      case 'reject': {
        // Resolve the target step. The client normally passes step_id, but fall
        // back to the policy's 'current' step (mirrors the undo case) so the
        // denial is ALWAYS persisted — if step_id were missing we'd otherwise
        // skip the DB write and the stale step_state would snap back on the next
        // fetch, reproducing the original "reject resets / breaks" bug.
        let rejectId = input.step_id ?? null
        if (!rejectId) {
          const { data: cur, error: curErr } = await supabase
            .from('policy_workflow_steps')
            .select('id')
            .eq('policy_id', policyId)
            .eq('status', 'current')
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle<{ id: string }>()
          if (curErr) throw curErr
          rejectId = cur?.id ?? null
        }
        // No target step → refuse rather than write a false "rejected" audit row.
        if (!rejectId) throw Conflict('No step to reject')
        // Derive the flavour (manager-reject vs plain deny) from the step's
        // CURRENT step_state BEFORE we null it, so the activity copy is accurate.
        const { data: stepRow, error: readErr } = await supabase
          .from('policy_workflow_steps')
          .select('step_state')
          .eq('id', rejectId)
          .eq('policy_id', policyId)
          .maybeSingle<{ step_state: string | null }>()
        if (readErr) throw readErr
        const isManagerReject = stepRow?.step_state === 'awaiting-manager'

        const { error: clearErr } = await supabase
          .from('policy_workflow_steps')
          .update({ step_state: null })
          .eq('id', rejectId)
          .eq('policy_id', policyId)
        if (clearErr) throw clearErr
        nextStatus = 'under-review'
        activityType = isManagerReject ? 'manager_rejected' : 'step_denied'
        textEn = isManagerReject ? 'Manager rejected the step' : 'Step denied'
        textAr = isManagerReject ? 'رفض المدير الخطوة' : 'تم رفض الخطوة'
        break
      }

      // ── Step "start" actions (notify-manager / send-email / request-approval):
      //    set the CURRENT step's awaiting/pending state, move the policy to
      //    under-review (so a DRAFT policy's first action both starts the review
      //    and performs the step — the one-click model), and LOG it. Replaces the
      //    old client-only setStepState, which wrote NO activity row.
      case 'notify-manager':
      case 'send-email':
      case 'request-approval': {
        const stateByAction: Record<string, string> = {
          'notify-manager': 'awaiting-manager',
          'send-email': 'awaiting-response',
          'request-approval': 'pending-approval',
        }
        // Resolve the target step (explicit step_id, else the current step).
        let stepId = input.step_id ?? null
        if (!stepId) {
          const { data: cur, error: curErr } = await supabase
            .from('policy_workflow_steps')
            .select('id')
            .eq('policy_id', policyId)
            .eq('status', 'current')
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle<{ id: string }>()
          if (curErr) throw curErr
          stepId = cur?.id ?? null
        }
        // No target step → refuse, so we never transition+log without actually
        // setting the step's awaiting/pending state.
        if (!stepId) throw Conflict('No current step to act on')
        const { error } = await supabase
          .from('policy_workflow_steps')
          .update({ step_state: stateByAction[input.action] })
          .eq('id', stepId)
          .eq('policy_id', policyId)
        if (error) throw error
        nextStatus = 'under-review'
        activityType =
          input.action === 'notify-manager' ? 'manager_notified'
          : input.action === 'send-email' ? 'email_sent'
          : 'submitted_for_review'
        textEn =
          input.action === 'notify-manager' ? 'Manager notified for review'
          : input.action === 'send-email' ? 'Email notification sent'
          : 'Submitted for approval'
        textAr =
          input.action === 'notify-manager' ? 'تم إخطار المدير للمراجعة'
          : input.action === 'send-email' ? 'تم إرسال إشعار بريدي'
          : 'تم الإرسال للموافقة'
        break
      }

      // ── Acknowledge: the manager confirms they saw the notification. Pure
      //    audit entry — no step/policy state change (the step stays in its
      //    awaiting-manager state). Persisted here because the client used to
      //    only write a local activity entry via update(), which the policy
      //    PATCH dropped — so the acknowledgement never stuck and rolled back.
      case 'acknowledge': {
        nextStatus = 'under-review'
        activityType = 'manager_acknowledged'
        textEn = 'Manager acknowledged the notification'
        textAr = 'أقرّ المدير باستلام الإشعار'
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
        // BUG-R4-03 Fix 2: helper to derive cycle days from a named review schedule
        // when review_cycle_days is 0 or null on the policy row.
        function cadenceToDays(schedule: string | null | undefined): number {
          if (!schedule) return 365
          const s = schedule.toLowerCase()
          if (s.includes('month')) return 30
          if (s.includes('quarter')) return 90
          if (s.includes('semi') || s.includes('bi-annual') || s.includes('biannual')) return 182
          if (s.includes('year') || s.includes('annual')) return 365
          return 365
        }

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
        // BUG-P-R2-06: stamp last_review_date = today when a review is initiated
        // so the "Last Review" field in the detail panel shows the current date.
        // BUG-P-R3-07: also advance next_review_date by review_cycle_days so the
        // "Next Review" field updates after each review cycle is initiated.
        // BUG-R4-03 Fix 2: also fetch review_schedule for cadence fallback.
        const { data: policyRow } = await supabase
          .from('policies')
          .select('review_cycle_days, review_schedule, current_review_cycle_id, current_review_cycle_label, current_review_cycle_date')
          .eq('id', policyId)
          .is('deleted_at', null)
          .maybeSingle<{
            review_cycle_days: number | null
            review_schedule: string | null
            current_review_cycle_id: string | null
            current_review_cycle_label: string | null
            current_review_cycle_date: string | null
          }>()

        // BUG-R4-02 Gap A: archive the old review cycle into policy_review_cycles
        // before rotating to a new one, so it remains accessible in the evidence dropdown.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (policyRow?.current_review_cycle_id && UUID_RE.test(policyRow.current_review_cycle_id)) {
          await supabase.from('policy_review_cycles').upsert({
            id: policyRow.current_review_cycle_id,
            policy_id: policyId,
            label: policyRow.current_review_cycle_label ?? 'Review',
            initiated_at: policyRow.current_review_cycle_date ?? today,
          }, { onConflict: 'id', ignoreDuplicates: true })
        }

        // BUG-R4-03 Fix 2: use cadence fallback when review_cycle_days is 0/null.
        const cycleDays = (policyRow?.review_cycle_days && policyRow.review_cycle_days > 0)
          ? policyRow.review_cycle_days
          : cadenceToDays(policyRow?.review_schedule)
        const nextReviewDate = new Date()
        nextReviewDate.setDate(nextReviewDate.getDate() + cycleDays)
        const nextReviewDateStr = nextReviewDate.toISOString().split('T')[0]
        const newCycleId = crypto.randomUUID()
        const newCycleLabel = `Review ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        const { error: lrErr } = await supabase
          .from('policies')
          .update({
            last_review_date: today,
            next_review_date: nextReviewDateStr,
            current_review_cycle_id: newCycleId,
            current_review_cycle_label: newCycleLabel,
            current_review_cycle_date: new Date().toISOString(),
          })
          .eq('id', policyId)
          .is('deleted_at', null)
        // BUG-R4-03 Fix 1: make this stamp fatal — if the date can't be updated,
        // the review initiation should not silently succeed with a stale date.
        if (lrErr) throw lrErr
        nextStatus = 'under-review'
        activityType = 'review_initiated'
        textEn = 'Policy review initiated'
        textAr = 'تم بدء مراجعة السياسة'
        break
      }

      default:
        throw Conflict(`Unknown workflow action: ${input.action}`)
    }

    // W38 (story 6): stamp approved_date when the LAST step completes —
    // `update({ status })` alone left it null forever. Symmetrically, an undo
    // that takes the policy back out of 'approved' rescinds the stamp.
    const policyUpdate: Record<string, unknown> = { status: nextStatus }
    if (input.action === 'approve' && nextStatus === 'approved') {
      policyUpdate.approved_date = today
    } else if (input.action === 'undo' && nextStatus !== 'approved') {
      policyUpdate.approved_date = null
    }

    const { data, error } = await supabase
      .from('policies')
      .update(policyUpdate)
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
