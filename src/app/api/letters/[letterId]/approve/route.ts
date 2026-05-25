// POST /api/letters/[letterId]/approve
//   body: { comment?: string }
//
// W25.1-RESIDUAL-3 — admin-level direct-approve endpoint.
//
// Background: the multi-step approve-step / reject-step endpoints (W21) handle
// the role-chained approval flow (Compliance Officer → Department Head → CEO).
// That flow requires `letter_approval_steps` rows to exist. When no rows are
// configured, or when the Admin wants to bypass the chain (confirmed: Admin may
// self-approve), neither endpoint works — `/approve-step` requires at least one
// step row, and there is no single-shot transition endpoint.
//
// This endpoint fills that gap: it transitions pending-approval → approved
// without touching the step table. It is the mirror of the policy
// `approve-step` pattern but without the chain logic.
//
// Auth: requirePerm('edit') — same permission as approve-step (BACKEND-API-MAP §3.3).
// RBAC: no "approver !== creator" guard. Admin can self-approve (Hani confirmed).
//
// W17.2 atomic conditional UPDATE: UPDATE ... WHERE status='pending-approval'.
// W19.5 P6 dual-store timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { z } from 'zod'
import {
  LETTER_LIST_COLUMNS,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ApproveLetterSchema = z
  .object({
    comment: z.string().max(2_000).optional(),
  })
  .strict()

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase, user, profile } = await requirePerm('edit')
    const body = await parseJson(req, ApproveLetterSchema)

    // W17.2 atomic conditional UPDATE: include status guard so a concurrent
    // second approve returns 0 rows (→ 409 conflict_state) instead of 200.
    const { data, error, count } = await supabase
      .from('letters')
      .update({ status: 'approved' })
      .eq('id', letterId)
      .eq('status', 'pending-approval')
      .is('deleted_at', null)
      .select(LETTER_LIST_COLUMNS)
      .maybeSingle()

    if (error) throw error

    // If the UPDATE matched 0 rows, the letter either doesn't exist or is not
    // in pending-approval status. Distinguish the two cases.
    if (!data) {
      // Read the current status to surface the right error.
      const { data: current } = await supabase
        .from('letters')
        .select('id, status')
        .eq('id', letterId)
        .is('deleted_at', null)
        .maybeSingle<{ id: string; status: string }>()

      if (!current) throw NotFound(`Letter ${letterId} not found`)
      // Letter exists but status != 'pending-approval' → 409.
      throw Conflict(`Cannot approve letter in status '${current.status}'`)
    }

    void count // silence unused warning

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.approved',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { comment: body.comment ?? null },
        supabase,
      }),
      // W19.5 P6 — dual-store timeline entry.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterApprovedBy',
        { name: actor },
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
