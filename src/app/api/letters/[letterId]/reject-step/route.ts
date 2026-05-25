// POST /api/letters/[letterId]/reject-step
//   body: { step_index: 1|2|3, reason: string }
// Rejects the current step → letter status `draft` (author revises + re-submits).
//
// Wave-21: assertUuid + dual-store timeline write.

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
  assertLetterExists,
  getApprovalSteps,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    const { supabase, user, profile } = await requirePerm('edit')
    const letterId = await assertLetterExists(supabase, letterIdParam)
    const body = await parseJson(req, RejectStepSchema)

    const { data: letter, error: lErr } = await supabase
      .from('letters')
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
      .from('letter_approval_steps')
      .update({ status: 'rejected', rejected_at: now, notes: body.reason })
      .eq('letter_id', letterId)
      .eq('step', body.step_index)
    if (updErr) throw updErr

    // Reset earlier approved steps to pending so the chain restarts cleanly.
    const { error: resetErr } = await supabase
      .from('letter_approval_steps')
      .update({ status: 'pending', approved_at: null, rejected_at: null, notes: null })
      .eq('letter_id', letterId)
      .lt('step', body.step_index)
    if (resetErr) throw resetErr

    const { data, error } = await supabase
      .from('letters')
      .update({ status: 'draft' })
      .eq('id', letterId)
      .select(LETTER_LIST_COLUMNS)
      .single()
    if (error) throw error

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.approval_step_committed',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { step: body.step_index, decision: 'rejected', reason: body.reason },
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write with step + reason interpolation.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterStepRejected',
        { step: String(body.step_index), reason: body.reason },
        actor,
        'rejected',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
