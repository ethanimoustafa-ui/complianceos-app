// POST /api/letters/[letterId]/submit-for-approval —
//   draft → pending-approval. Computes response_deadline by type.
//
// Wave-21: assertUuid + dual-store timeline write.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  LETTER_LIST_COLUMNS,
  computeResponseDeadline,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase, user, profile } = await requirePerm('edit')

    const { data: current, error: readErr } = await supabase
      .from('letters')
      .select('id, status, type, response_deadline')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string; type: string; response_deadline: string | null }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Letter ${letterId} not found`)
    if (current.status === 'pending-approval') {
      return ok({ id: letterId, status: 'pending-approval' })
    }
    if (current.status !== 'draft') {
      throw Conflict(`Cannot submit letter in status ${current.status}`)
    }

    const response_deadline = current.response_deadline ?? computeResponseDeadline(current.type)

    const { data, error } = await supabase
      .from('letters')
      .update({ status: 'pending-approval', response_deadline })
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
        metadata: { response_deadline },
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterSubmittedApproval',
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
