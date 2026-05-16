// POST /api/letters/[letterId]/approve-step
//   body: { step_index: 1|2|3, notes?: string }
// Advances the 3-step approval chain. On final step → status `approved`.
// Permission: `edit` (matches BACKEND-API-MAP §3.3 "Approve SAMA Letters").

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ApproveStepSchema } from '@/lib/api/schemas/letters'
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
    const body = await parseJson(req, ApproveStepSchema)

    const { data: letter, error: lErr } = await supabase
      .from('sama_letters')
      .select('id, status')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string }>()
    if (lErr) throw lErr
    if (!letter) throw NotFound(`Letter ${letterId} not found`)
    if (letter.status !== 'pending-approval') {
      throw Conflict(`Cannot approve in status ${letter.status}`)
    }

    const steps = await getApprovalSteps(supabase, letterId)
    if (steps.length === 0) throw Conflict('No approval steps configured')
    assertIsCurrentStep(steps, body.step_index)

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('sama_letter_approval_steps')
      .update({ status: 'approved', approved_at: now, notes: body.notes ?? null })
      .eq('letter_id', letterId)
      .eq('step', body.step_index)
    if (updErr) throw updErr

    // If this was the last step → set letter status to 'approved'.
    const remainingPending = steps.filter(
      (s) => s.step !== body.step_index && s.status === 'pending',
    )
    let letterAfter: Record<string, unknown> | null = null
    if (remainingPending.length === 0) {
      const { data, error } = await supabase
        .from('sama_letters')
        .update({ status: 'approved' })
        .eq('id', letterId)
        .select(LETTER_LIST_COLUMNS)
        .single()
      if (error) throw error
      letterAfter = data as Record<string, unknown>
    } else {
      const { data } = await supabase
        .from('sama_letters')
        .select(LETTER_LIST_COLUMNS)
        .eq('id', letterId)
        .maybeSingle()
      letterAfter = data as Record<string, unknown>
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'sama_letter.approval_step_committed',
        entity_type: 'sama_letter',
        entity_id: letterId,
        metadata: { step: body.step_index, decision: 'approved' },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        remainingPending.length === 0
          ? `Step ${body.step_index} approved — letter fully approved`
          : `Step ${body.step_index} approved`,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.samaLetters(), cacheTags.samaLetters(letterId)])
    return ok(letterAfter)
  } catch (e) {
    return handle(e)
  }
}
