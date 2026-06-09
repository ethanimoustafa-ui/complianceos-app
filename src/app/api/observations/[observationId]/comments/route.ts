// Wave-20 — POST /api/observations/[observationId]/comments
// Comments persist into `observation_updates` AND a dual-store timeline row.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateObservationCommentSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_UPDATE_COLUMNS,
  assertObservationExists,
  assertObservationMembership,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:comment')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    // W39: only people added to the observation can act on it (org_admin oversees).
    await assertObservationMembership(supabase, observationId, user.id, profile.role)
    const input = await parseJson(req, CreateObservationCommentSchema)

    const { data, error } = await supabase
      .from('observation_updates')
      .insert({
        observation_id: observationId,
        author_id: user.id,
        text: input.text,
      })
      .select(OBSERVATION_UPDATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.comment.create',
        entity_type: 'observation_update',
        entity_id: created.id,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.added',
        user_id: user.id,
        user_name: actor,
        target_id: created.id,
        ...renderBilingual('observations.detail.timeline.commentAdded', { name: actor }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
