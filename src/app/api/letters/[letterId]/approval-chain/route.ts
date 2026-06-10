// POST /api/letters/[letterId]/approval-chain — W41: replace THIS letter's
// approval chain with the supplied steps (the "apply to this letter only"
// scope of the Configure modal). Allowed while the letter is still in the
// approval lifecycle (draft / rejected / pending-approval); every step lands
// as 'pending', so an in-flight review restarts from step 1.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ApplyLetterChainSchema } from '@/lib/api/schemas/letters'
import { assertLetterExists, insertLetterTimeline } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    const letterId = await assertLetterExists(supabase, letterIdParam)
    const input = await parseJson(req, ApplyLetterChainSchema)

    const { data: letter, error: readErr } = await supabase
      .from('letters')
      .select('id, status')
      .eq('id', letterId)
      .maybeSingle<{ id: string; status: string }>()
    if (readErr) throw readErr
    if (!letter) throw NotFound(`Letter ${letterId} not found`)
    if (!['draft', 'rejected', 'pending-approval'].includes(letter.status)) {
      throw Conflict(`Cannot reconfigure the approval chain in status '${letter.status}'.`)
    }

    const steps = input.steps
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((s, i) => ({ step: i + 1, role: s.role }))

    const { error: delErr } = await supabase
      .from('letter_approval_steps')
      .delete()
      .eq('letter_id', letterId)
    if (delErr) throw delErr

    const { error: insErr } = await supabase.from('letter_approval_steps').insert(
      steps.map((s) => ({
        letter_id: letterId,
        step: s.step,
        role: s.role,
        status: 'pending',
      })),
    )
    if (insErr) throw insErr

    const actor = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.approval_chain.replace',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { steps },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.chainConfigured',
        { count: String(steps.length) },
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok({ id: letterId, steps })
  } catch (e) {
    return handle(e)
  }
}
