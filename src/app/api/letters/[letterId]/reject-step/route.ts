// POST /api/letters/[letterId]/reject-step
//   body: { step_index: 1|2|3, reason: string }
// Rejects the current step → letter status `rejected` (modelled as `draft`
// per current enum which lacks an explicit `rejected` state; rejection rolls
// the letter back to draft so the author can revise).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RejectStepSchema } from '@/lib/api/schemas/letters'
import {
  LETTER_LIST_COLUMNS,
  assertIsCurrentStep,
  getApprovalSteps,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    const body = await parseJson(req, RejectStepSchema)

    const { data: letter, error: lErr } = await supabase
      .from('sama_letters')
      .select('id, status')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string }>()
    if (lErr) throw lErr
    if (!letter) throw NotFound(`Letter ${letterId} not found`)
    if (letter.status !== 'pending-approval') {
      throw Conflict(`Cannot reject in status ${letter.status}`)
    }

    const steps = await getApprovalSteps(supabase, letterId)
    assertIsCurrentStep(steps, body.step_index)

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('sama_letter_approval_steps')
      .update({ status: 'rejected', rejected_at: now, notes: body.reason })
      .eq('letter_id', letterId)
      .eq('step', body.step_index)
    if (updErr) throw updErr

    // Reset to draft so the author can revise + re-submit. Also reset any
    // subsequent pending steps remain pending (their `approved_at`/`rejected_at`
    // is untouched). The earlier-approved steps are reset to pending so the
    // chain restarts cleanly.
    const { error: resetErr } = await supabase
      .from('sama_letter_approval_steps')
      .update({ status: 'pending', approved_at: null, rejected_at: null, notes: null })
      .eq('letter_id', letterId)
      .lt('step', body.step_index)
    if (resetErr) throw resetErr

    const { data, error } = await supabase
      .from('sama_letters')
      .update({ status: 'draft' })
      .eq('id', letterId)
      .select(LETTER_LIST_COLUMNS)
      .single()
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'sama_letter.approval_step_committed',
        entity_type: 'sama_letter',
        entity_id: letterId,
        metadata: { step: body.step_index, decision: 'rejected', reason: body.reason },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        `Step ${body.step_index} rejected: ${body.reason}`,
        profile.name ?? profile.email ?? user.id,
        'rejected',
      ),
    ])

    revalidateAll([cacheTags.samaLetters(), cacheTags.samaLetters(letterId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
