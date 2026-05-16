// POST /api/circulars/[circularId]/workflow/set-phase-deadline
//   body: { phase: 0|1|2, deadline: 'YYYY-MM-DD' }
//
// The circulars schema stores phase-specific deadlines on the `circulars` row
// (cap_due_date / cap_deadline / cap_response_deadline / remediation_deadline)
// rather than on `circular_workflow_steps`. We map the phase index to the
// canonical column:
//   phase 0 (review)            → cap_due_date
//   phase 1 (impact-assessment) → cap_deadline
//   phase 2 (implementation)    → remediation_deadline

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { SetPhaseDeadlineSchema } from '@/lib/api/schemas/circulars'
import {
  CIRCULAR_LIST_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHASE_TO_COLUMN: Record<number, string> = {
  0: 'cap_due_date',
  1: 'cap_deadline',
  2: 'remediation_deadline',
}

type Params = { params: Promise<{ circularId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const body = await parseJson(req, SetPhaseDeadlineSchema)
    const column = PHASE_TO_COLUMN[body.phase]
    if (!column) throw Conflict(`Unknown phase ${body.phase}`)

    const { data, error } = await supabase
      .from('circulars')
      .update({ [column]: body.deadline })
      .eq('id', circularId)
      .is('deleted_at', null)
      .select(CIRCULAR_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.workflow.set_deadline',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { phase: body.phase, column, deadline: body.deadline },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Phase ${body.phase} deadline set to ${body.deadline}`,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
