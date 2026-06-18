// POST /api/circulars/[circularId]/workflow/advance
//   body: { notes?, next_phase?, step_id? }
//
// Advances workflow. When `step_id` is provided, marks THAT specific step as
// completed (stamping date + user_name + notes) and promotes the next step by
// sort_order ascending to 'current'. When `step_id` is absent, falls back to
// the legacy behavior: completes whichever step has status === 'current' and
// promotes the next phase step.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { Conflict, handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AdvancePhaseSchema } from '@/lib/api/schemas/circulars'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  getCircularHeader,
  insertCircularTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
import { notifyCircularStepAssignee } from '@/lib/api/services/notifications'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

type StepRow = {
  id: string
  phase: number
  status: string
  sort_order: number
  label: string
  label_ar: string | null
  notes: string | null
  assigned_to: string | null
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    // Migration 117: accept the granular 'workflow:advance' key OR the legacy
    // 'edit' key the role tiers still carry. Mirrors circular_workflow_steps RLS.
    const { supabase, user, profile } = await requireAnyPerm(['workflow:advance', 'edit'])
    await assertCircularExists(supabase, circularId)
    const body = await parseJson(req, AdvancePhaseSchema)

    const { data: stepsData, error: stErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS + ', assigned_to')
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (stErr) throw stErr
    const steps = (stepsData ?? []) as unknown as StepRow[]
    if (steps.length === 0) throw Conflict('No workflow steps configured')

    // Resolve which step is being completed.
    let current: StepRow | undefined
    if (body.step_id) {
      current = steps.find((s) => s.id === body.step_id)
      if (!current) throw Conflict('Workflow step not found for circular')
    } else {
      current = steps.find((s) => s.status === 'current')
      if (!current) throw Conflict('No active workflow step')
    }

    const today = new Date().toISOString().slice(0, 10)
    const actor = profile.name ?? profile.email ?? user.id

    // Mark the resolved step completed.
    const { error: cErr } = await supabase
      .from('circular_workflow_steps')
      .update({
        status: 'completed',
        date: today,
        user_name: actor,
        notes: body.notes ?? null,
      })
      .eq('id', current.id)
    if (cErr) throw cErr

    // Resolve next step: when step_id was provided, find the next step by
    // sort_order ascending (status !== 'completed' && id !== current.id).
    // Otherwise, retain legacy phase-based lookup.
    let nextStep: StepRow | undefined
    let nextPhase = current.phase
    if (body.step_id) {
      nextStep = steps
        .filter((s) => s.id !== current!.id && s.status !== 'completed')
        .sort((a, b) => a.sort_order - b.sort_order)[0]
      nextPhase = nextStep?.phase ?? current.phase + 1
    } else {
      nextPhase = body.next_phase ?? current.phase + 1
      nextStep = steps.find((s) => s.phase === nextPhase && s.status === 'pending')
    }

    if (nextStep) {
      const { error: nErr } = await supabase
        .from('circular_workflow_steps')
        .update({ status: 'current' })
        .eq('id', nextStep.id)
      if (nErr) throw nErr
    }

    // Side-bug: a within-phase advance (completing a step but staying on the
    // same phase) used to write a noise event "Phase advanced: 1 → 1". Only
    // log the phase-change timeline row when the phase actually moved.
    const phaseChanged = current.phase !== nextPhase

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow.advance',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: {
          from_phase: current.phase,
          to_phase: nextPhase,
          step_id: current.id,
          notes: body.notes,
        },
        supabase,
      }),
      phaseChanged
        ? insertCircularTimeline(
            supabase,
            circularId,
            renderBilingual('regulatoryUpdates.timeline.phaseAdvanced', {
              from: String(current.phase),
              to: String(nextPhase),
            }),
            actor,
            'completed',
          )
        : Promise.resolve(),
      recomputeCircularProgress(supabase, circularId).catch(() => undefined),
    ])

    if (nextStep) {
      const header = await getCircularHeader(supabase, circularId)
      if (header) {
        await notifyCircularStepAssignee(supabase, {
          circular: header,
          step: {
            id: nextStep.id,
            label: nextStep.label,
            label_ar: nextStep.label_ar,
            notes: nextStep.notes,
            assigned_to: nextStep.assigned_to,
          },
          actor: { id: user.id, name: actor },
        })
      }
    }

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    revalidate(cacheTags.compliance())
    return ok({ id: circularId, from_phase: current.phase, to_phase: nextPhase })
  } catch (e) {
    return handle(e)
  }
}
