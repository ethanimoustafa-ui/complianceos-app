// POST /api/letters/[letterId]/reject
//   body: { comment: string } — rejection comment is required.
//
// W25.1-RESIDUAL-3 — admin-level direct-reject endpoint (companion to /approve).
//
// Transitions pending-approval → rejected (terminal state). Returns the
// letter to the author for revision.
//
// Auth: requirePerm('edit') — same permission as approve-step.
// W17.2 atomic conditional UPDATE with status guard.
// W19.5 P6 dual-store timeline.

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

const RejectLetterSchema = z
  .object({
    comment: z.string().min(1).max(2_000),
  })
  .strict()

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    const { supabase, user, profile } = await requirePerm('edit')
    const letterId = await assertLetterExists(supabase, letterIdParam)
    const body = await parseJson(req, RejectLetterSchema)

    // W17.2 atomic conditional UPDATE: status guard prevents double-rejection.
    const { data, error } = await supabase
      .from('letters')
      .update({ status: 'rejected' })
      .eq('id', letterId)
      .eq('status', 'pending-approval')
      .is('deleted_at', null)
      .select(LETTER_LIST_COLUMNS)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const { data: current } = await supabase
        .from('letters')
        .select('id, status')
        .eq('id', letterId)
        .is('deleted_at', null)
        .maybeSingle<{ id: string; status: string }>()

      if (!current) throw NotFound(`Letter ${letterId} not found`)
      throw Conflict(`Cannot reject letter in status '${current.status}'`)
    }

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.rejected',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { comment: body.comment },
        supabase,
      }),
      // W19.5 P6 — dual-store timeline entry.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterRejectedBy',
        { name: actor, comment: body.comment },
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
