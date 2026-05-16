// POST /api/observations/[observationId]/comments — add a comment (writes to
// observation_updates AND the observation_timeline).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateObservationCommentSchema } from '@/lib/api/schemas/observations'
import {
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPDATE_COLUMNS =
  'id, observation_id, author_id, text, is_edited, edited_at, created_at'

type Params = { params: Promise<{ observationId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:comment')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, CreateObservationCommentSchema)

    const { data, error } = await supabase
      .from('observation_updates')
      .insert({
        observation_id: observationId,
        author_id: user.id,
        text: input.text,
      })
      .select(UPDATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.comment.create',
        entity_type: 'observation_update',
        entity_id: created.id,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.added',
        description: input.text.slice(0, 280),
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: created.id,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
