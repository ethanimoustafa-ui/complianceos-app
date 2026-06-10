// POST /api/letters/[letterId]/submit-for-approval —
//   draft|rejected → pending-approval. Computes response_deadline by type.
//
// Wave-21: assertUuid + dual-store timeline write.
// W40 (product rule): a REJECTED letter is revisable and resubmittable — this
// route accepts it, clears rejection_reason, and resets the approval chain so
// the review starts fresh. It also seeds the default 3-step chain when none
// exists (previously NOTHING ever seeded letter_approval_steps, so new letters
// had no per-step approval at all), and enforces subject+body server-side.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  LETTER_LIST_COLUMNS,
  assertLetterExists,
  computeResponseDeadline,
  getApprovalSteps,
  insertLetterTimeline,
  resolveApprovalChain,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    const { supabase, user, profile } = await requirePerm('edit')
    const letterId = await assertLetterExists(supabase, letterIdParam)

    const { data: current, error: readErr } = await supabase
      .from('letters')
      .select('id, status, type, authority, subject, body, response_deadline')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{
        id: string
        status: string
        type: string
        authority: string | null
        subject: string | null
        body: string | null
        response_deadline: string | null
      }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Letter ${letterId} not found`)
    if (current.status === 'pending-approval') {
      return ok({ id: letterId, status: 'pending-approval' })
    }
    if (current.status !== 'draft' && current.status !== 'rejected') {
      throw Conflict(`Cannot submit letter in status ${current.status}`)
    }
    // W40: defense-in-depth — the create schema allows an empty shell draft,
    // so the content gate lives here at the transition.
    if (!current.subject?.trim() || !current.body?.trim()) {
      throw Conflict('Subject and body are required before submitting for approval.')
    }

    const isResubmission = current.status === 'rejected'

    // W40: fresh approval chain on every submission — seed from the authority's
    // configured chain (W41: letter_approval_chains, falling back to the
    // default 3-step chain) when none exists; otherwise reset every step to
    // pending so a resubmitted letter is reviewed from step 1.
    const steps = await getApprovalSteps(supabase, letterId)
    if (steps.length === 0) {
      const chain = await resolveApprovalChain(supabase, current.authority)
      const { error: seedErr } = await supabase.from('letter_approval_steps').insert(
        chain.map((s) => ({
          letter_id: letterId,
          step: s.step,
          role: s.role,
          status: 'pending',
        })),
      )
      if (seedErr) throw seedErr
    } else {
      const { error: resetErr } = await supabase
        .from('letter_approval_steps')
        .update({ status: 'pending', approved_at: null, rejected_at: null, notes: null })
        .eq('letter_id', letterId)
      if (resetErr) throw resetErr
    }

    const response_deadline = current.response_deadline ?? computeResponseDeadline(current.type)

    const { data, error } = await supabase
      .from('letters')
      .update({ status: 'pending-approval', response_deadline, rejection_reason: null })
      .eq('id', letterId)
      .select(LETTER_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.submit_for_approval',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { response_deadline, resubmission: isResubmission },
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write.
      insertLetterTimeline(
        supabase,
        letterId,
        isResubmission ? 'letters.letterResubmittedApproval' : 'letters.letterSubmittedApproval',
        {},
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
