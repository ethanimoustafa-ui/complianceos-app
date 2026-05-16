// POST /api/letters/[letterId]/send — approved → sent. Stamps `sent_date`
// and (re)computes `response_deadline` from now.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
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
    const { supabase, user, profile } = await requirePerm('edit')

    const { data: current, error: readErr } = await supabase
      .from('sama_letters')
      .select('id, status, type')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string; type: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Letter ${letterId} not found`)
    if (current.status === 'sent') return ok({ id: letterId, status: 'sent' })
    if (current.status !== 'approved') {
      throw Conflict(`Cannot send in status ${current.status}`)
    }

    const now = new Date()
    const { data, error } = await supabase
      .from('sama_letters')
      .update({
        status: 'sent',
        sent_date: now.toISOString(),
        response_deadline: computeResponseDeadline(current.type, now),
      })
      .eq('id', letterId)
      .select(LETTER_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'sama_letter.send',
        entity_type: 'sama_letter',
        entity_id: letterId,
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'Letter sent',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.samaLetters(), cacheTags.samaLetters(letterId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
