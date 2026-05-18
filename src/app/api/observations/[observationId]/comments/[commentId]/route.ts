// /api/observations/[observationId]/comments/[commentId] — PATCH/DELETE.
//
// Backs the legacy editComment / deleteComment store actions. Both endpoints
// emit an observation_timeline entry alongside the audit row so the activity
// feed reflects the edit/delete.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateObservationCommentSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_UPDATE_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; commentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, commentId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, UpdateObservationCommentSchema)

    const { data, error } = await supabase
      .from('observation_updates')
      .update({
        text: input.text,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('observation_id', observationId)
      .select(OBSERVATION_UPDATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Comment ${commentId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.comment.update',
        entity_type: 'observation_update',
        entity_id: commentId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.edited',
        description: input.text.slice(0, 280),
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: commentId,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, commentId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { error } = await supabase
      .from('observation_updates')
      .delete()
      .eq('id', commentId)
      .eq('observation_id', observationId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.comment.delete',
        entity_type: 'observation_update',
        entity_id: commentId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.deleted',
        description: `Comment ${commentId} deleted`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: commentId,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok({ id: commentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
