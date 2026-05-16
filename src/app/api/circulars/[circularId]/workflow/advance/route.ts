// POST /api/circulars/[circularId]/workflow/advance
//   body: { notes?, next_phase? }
//
// Advances the current phase: marks the current `circular_workflow_steps` row
// with phase === current as 'completed' (stamping date + user_name + notes),
// and the next phase (current+1, or `next_phase` if provided) as 'current'.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AdvancePhaseSchema } from '@/lib/api/schemas/circulars'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const body = await parseJson(req, AdvancePhaseSchema)

    const { data: steps, error: stErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (stErr) throw stErr
    if (!steps || steps.length === 0) throw Conflict('No workflow steps configured')

    const current = (steps as { phase: number; status: string; id: string }[]).find(
      (s) => s.status === 'current',
    )
    if (!current) throw Conflict('No active workflow step')

    const nextPhase = body.next_phase ?? current.phase + 1

    const today = new Date().toISOString().slice(0, 10)
    const actor = profile.name ?? profile.email ?? user.id

    // Mark current step completed
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

    // Promote next phase step to current (if exists)
    const nextStep = (steps as { phase: number; status: string; id: string }[]).find(
      (s) => s.phase === nextPhase && s.status === 'pending',
    )
    if (nextStep) {
      const { error: nErr } = await supabase
        .from('circular_workflow_steps')
        .update({ status: 'current' })
        .eq('id', nextStep.id)
      if (nErr) throw nErr
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow.advance',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { from_phase: current.phase, to_phase: nextPhase, notes: body.notes },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Phase advanced: ${current.phase} → ${nextPhase}`,
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok({ id: circularId, from_phase: current.phase, to_phase: nextPhase })
  } catch (e) {
    return handle(e)
  }
}
