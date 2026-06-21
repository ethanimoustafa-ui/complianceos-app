// POST /api/letters/[letterId]/send — approved → sent. Stamps `sent_date`
// and (re)computes `response_deadline` from now.
//
// Wave-21: assertUuid + dual-store timeline write.

import type { NextRequest } from 'next/server'
import { canDriveWorkflow, requireUser } from '@/lib/api/auth'
import { Conflict, Forbidden, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  LETTER_LIST_COLUMNS,
  assertLetterExists,
  computeResponseDeadline,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    // Ownership model (Area B): drop the generic 'edit' gate (officers hold it)
    // in favour of requireUser() + canDriveWorkflow against the letter's creator.
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    const letterId = await assertLetterExists(supabase, letterIdParam)

    const { data: current, error: readErr } = await supabase
      .from('letters')
      .select('id, status, type, authority, created_by')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string; type: string; authority: string; created_by: string | null }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Letter ${letterId} not found`)
    // RBAC (ownership model): sending requires the global 'workflow:advance'
    // grant (managers/admins by role; officers via the Access Matrix) OR being
    // the letter's CREATOR (created_by). The generic 'edit' no longer grants it.
    // Mirrors the policy/circular/audit workflow routes + `canDriveLetter`.
    if (!canDriveWorkflow(ctx, current.created_by)) {
      throw Forbidden('Missing permission: workflow:advance (or letter ownership)')
    }
    if (current.status === 'sent') return ok({ id: letterId, status: 'sent' })
    if (current.status !== 'approved') {
      throw Conflict(`Cannot send in status ${current.status}`)
    }

    const now = new Date()
    const { data, error } = await supabase
      .from('letters')
      .update({
        status: 'sent',
        sent_date: now.toISOString(),
        response_deadline: computeResponseDeadline(current.type, now),
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
        action: 'letter.send',
        entity_type: 'letter',
        entity_id: letterId,
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write with authority interpolation.
      // L1: guard against null authority (shouldn't happen but prevents 500).
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterSentToAuthority',
        { authority: (current.authority ?? 'AUTHORITY').toUpperCase() },
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
