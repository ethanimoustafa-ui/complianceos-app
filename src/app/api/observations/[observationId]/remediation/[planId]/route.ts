// /api/observations/[observationId]/remediation/[planId] — PATCH.
//
// Two mutually-exclusive shapes (discriminated by the presence of `approved`):
//
//   1. REVIEW  { approved, notes? }
//        A leader/manager/admin approves or rejects a *submitted* plan. Sets
//        `status` from the boolean, stamps `reviewed_at`/`reviewed_by`/notes.
//
//   2. EDIT / SUBMIT  { title?, description?, due_date?, status?: 'submitted' }
//        The submitter revises a draft/rejected plan and/or transitions it to
//        'submitted' (sending it for review). Submitting stamps `submitted_at`/
//        `submitted_by` and clears any prior review verdict so a re-submitted
//        plan starts the review cycle clean.
//
// NOTE: `remediation_plans.reviewed_by` / `submitted_by` are uuid FKs to
// `profiles(id)`, so we store the acting `user.id`. The human-readable name is
// preserved on the timeline + audit log.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  ReviewRemediationPlanSchema,
  UpdateRemediationPlanSchema,
} from '@/lib/api/schemas/observations'
import {
  REMEDIATION_PLAN_COLUMNS,
  assertObservationExists,
  assertObservationMembership,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; planId: string }> }

// Union so a single parseJson() call accepts either shape. Review is tried
// first (it carries the required `approved` flag); a body without `approved`
// falls through to the edit/submit schema.
const PatchRemediationSchema = z.union([
  ReviewRemediationPlanSchema,
  UpdateRemediationPlanSchema,
])

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, planId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, PatchRemediationSchema)

    // W39 (product rule): members may edit/submit the plan; the VERDICT
    // (approve / reject) is reserved for the observation LEADER (org_admin
    // oversees) — and the leader may verdict a plan they submitted themselves,
    // superseding the earlier author-block.
    await assertObservationMembership(supabase, observationId, user.id, profile.role, {
      leaderOnly: 'approved' in input,
    })

    // Read the current plan once: its status drives the allowed transitions and
    // its `updated_at` (migration 067) backs the optimistic-concurrency guard.
    const { data: currentPlan } = await supabase
      .from('remediation_plans')
      .select('status, submitted_by, updated_at')
      .eq('id', planId)
      .eq('observation_id', observationId)
      .maybeSingle<{ status: string; submitted_by: string | null; updated_at: string }>()
    if (!currentPlan) throw NotFound(`Remediation plan ${planId} not found`)

    // W24-6a — If-Match 412 if the plan was concurrently updated.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) assertNotStale(ifMatch, currentPlan.updated_at)

    const isReview = 'approved' in input
    const now = new Date().toISOString()

    // W37: enforce the lifecycle state machine. Review (approve/reject) acts only
    // on a SUBMITTED plan; edits/submit act only on a DRAFT or REJECTED plan.
    // This stops a direct API call from force-approving a draft or silently
    // mutating an already-approved plan's content without re-review.
    if (isReview && currentPlan.status !== 'submitted') {
      throw Conflict(`Cannot review a remediation plan in status '${currentPlan.status}'.`)
    }
    if (!isReview && currentPlan.status !== 'draft' && currentPlan.status !== 'rejected') {
      throw Conflict(`Cannot edit a remediation plan in status '${currentPlan.status}'.`)
    }

    let update: Record<string, unknown>
    let action: string
    let actionType: string
    let timeline: { text_en: string; text_ar: string }
    // W37: the parent observation's new status (null = leave unchanged).
    //   approve → 'remediated' (work done, awaiting closure)
    //   reject  → 'in_progress' (back to work)
    //   submit  → 'in_progress' (under review)
    let obsStatus: 'in_progress' | 'remediated' | null = null

    const actor = observationActorName(profile, user.id)

    if (isReview) {
      const { approved, notes } = input as { approved: boolean; notes?: string }
      update = {
        status: approved ? 'approved' : 'rejected',
        reviewed_at: now,
        reviewed_by: user.id,
        // Always set notes (null when none) so the stored verdict note never
        // lingers from a prior, different verdict.
        review_notes: notes ?? null,
      }
      action = approved ? 'observation.remediation.approve' : 'observation.remediation.reject'
      actionType = approved ? 'remediation.approved' : 'remediation.rejected'
      obsStatus = approved ? 'remediated' : 'in_progress'
      timeline = renderBilingual(
        approved
          ? 'regulatoryUpdates.timeline.observationRemediationApproved'
          : 'regulatoryUpdates.timeline.observationRemediationRejected',
      )
    } else {
      const edit = input as {
        title?: string
        description?: string
        due_date?: string
        status?: 'submitted'
      }
      const submitting = edit.status === 'submitted'
      update = {}
      if (edit.title !== undefined) update.title = edit.title
      if (edit.description !== undefined) update.description = edit.description
      if (edit.due_date !== undefined) update.due_date = edit.due_date
      if (submitting) {
        update.status = 'submitted'
        update.submitted_at = now
        update.submitted_by = user.id
        // Clear any prior verdict so a re-submitted (previously rejected) plan
        // re-enters the review cycle cleanly.
        update.reviewed_at = null
        update.reviewed_by = null
        update.review_notes = null
      }
      action = submitting ? 'observation.remediation.submit' : 'observation.remediation.draft'
      actionType = submitting ? 'remediation.submitted' : 'remediation.drafted'
      if (submitting) obsStatus = 'in_progress'
      timeline = renderBilingual(
        submitting
          ? 'regulatoryUpdates.timeline.observationRemediationSubmitted'
          : 'regulatoryUpdates.timeline.observationRemediationDrafted',
        { title: edit.title ?? '' },
      )
    }

    const { data, error } = await supabase
      .from('remediation_plans')
      .update(update)
      .eq('id', planId)
      .eq('observation_id', observationId)
      .select(REMEDIATION_PLAN_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Remediation plan ${planId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action,
        entity_type: 'remediation_plan',
        entity_id: planId,
        metadata: { observation_id: observationId, ...(isReview ? { approved: (input as { approved: boolean }).approved } : { status: (data as { status: string }).status }) },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: actionType,
        user_id: user.id,
        user_name: actor,
        target_id: planId,
        ...timeline,
      }),
    ])

    // W37: persist the observation status transition so the table reflects it
    // after a refresh (approve → 'remediated', reject/submit → 'in_progress').
    // Never override a terminal status (resolved/closed) — those are reached
    // through the closure flow, not here.
    if (obsStatus) {
      await supabase
        .from('observations')
        .update({ status: obsStatus })
        .eq('id', observationId)
        .not('status', 'in', '(resolved,closed)')
    }

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
