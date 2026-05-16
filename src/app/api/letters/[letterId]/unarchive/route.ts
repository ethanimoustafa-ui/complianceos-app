// POST /api/letters/[letterId]/unarchive — see ./archive/route.ts note.

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
        action: 'sama_letter.unarchive',
        entity_type: 'sama_letter',
        entity_id: letterId,
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'Letter unarchived',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.samaLetters(), cacheTags.samaLetters(letterId)])
    return ok({ id: letterId, archived: false })
  } catch (e) {
    return handle(e)
  }
}
