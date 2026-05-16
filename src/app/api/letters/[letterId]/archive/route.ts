// POST /api/letters/[letterId]/archive
//
// NOTE: the current `letters` schema has no `archived` column (unlike
// `correspondence` which does). Until a column is added, archive is recorded
// as a timeline + audit-log event only. The route is exposed for API parity
// with the frontend; consumers should not assume listing filters by archive.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertLetterExists, insertLetterTimeline } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'letter.archive',
        entity_type: 'letter',
        entity_id: letterId,
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'Letter archived',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok({ id: letterId, archived: true })
  } catch (e) {
    return handle(e)
  }
}
