// POST /api/letters/[letterId]/mark-response-received — sent → response-received.
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
      .select('id, status')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Letter ${letterId} not found`)
    if (current.status === 'response-received') {
      return ok({ id: letterId, status: 'response-received' })
    }
    if (current.status !== 'sent' && current.status !== 'overdue') {
      throw Conflict(`Cannot mark response received in status ${current.status}`)
    }

    const { data, error } = await supabase
      .from('letters')
      .update({
        status: 'response-received',
        response_received_date: new Date().toISOString(),
      })
      .eq('id', letterId)
      .select(LETTER_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.response_received',
        entity_type: 'letter',
        entity_id: letterId,
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterResponseReceived',
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
