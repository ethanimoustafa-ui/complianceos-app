// POST /api/letters/[letterId]/mark-response-received — sent → response-received.
//
// Wave-21: assertUuid + dual-store timeline write.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { z } from 'zod'
import {
  LETTER_LIST_COLUMNS,
  assertLetterExists,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// W29-L2: optional note body — note is null/omitted when user skips the field.
const MarkResponseSchema = z
  .object({
    response_note: z.string().max(5_000).nullable().optional(),
  })
  .strict()

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    const { supabase, user, profile } = await requirePerm('edit')
    const letterId = await assertLetterExists(supabase, letterIdParam)
    // Body is optional — accept empty body gracefully.
    let responseNote: string | null = null
    try {
      const body = await parseJson(req, MarkResponseSchema)
      responseNote = body.response_note ?? null
    } catch {
      // empty body or non-JSON → treat as no note
    }

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
        response_note: responseNote,
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
