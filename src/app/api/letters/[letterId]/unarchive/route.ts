// POST /api/letters/[letterId]/unarchive — see ./archive/route.ts note.
//
// Wave-21: assertUuid + dual-store timeline write.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertLetterExists, insertLetterTimeline } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.unarchive',
        entity_type: 'letter',
        entity_id: letterId,
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write.
      insertLetterTimeline(
        supabase,
        letterId,
        'letters.letterUnarchived',
        {},
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok({ id: letterId, archived: false })
  } catch (e) {
    return handle(e)
  }
}
