// Wave-20 — /api/observations/[observationId]/comments/[commentId]
// PATCH/DELETE with the W17.2 atomic-If-Match pattern.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, Forbidden, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateObservationCommentSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_UPDATE_COLUMNS,
  assertObservationExists,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; commentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, commentId } = await params
    assertUuid(commentId)
    // W38: comment mutation needs the comment capability, not observation:edit
    // (an assignee who can comment must be able to fix their own typo). The
    // author check below is the real gate.
    const { supabase, user, profile, permissions } = await requirePerm('observation:comment')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const ifMatch = readIfMatch(req)
    const input = await parseJson(req, UpdateObservationCommentSchema)

    const { data: current } = await supabase
      .from('observation_updates')
      .select('author_id, updated_at')
      .eq('id', commentId)
      .eq('observation_id', observationId)
      .maybeSingle<{ author_id: string | null; updated_at: string }>()
    if (!current) throw NotFound(`Comment ${commentId} not found`)
    // W38: only the author (or an admin holding observation:delete) may edit —
    // mirrors the client-side `canEditComment` gate at the trust boundary.
    if (current.author_id !== user.id && !permissions.includes('observation:delete')) {
      throw Forbidden('Only the comment author can edit this comment.')
    }
    if (ifMatch != null) assertNotStale(ifMatch, current.updated_at)

    let q = supabase
      .from('observation_updates')
      .update({
        text: input.text,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('observation_id', observationId)
    if (ifMatch != null) q = q.eq('updated_at', ifMatch)
    const { data, error } = await q.select(OBSERVATION_UPDATE_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound(`Comment ${commentId} not found`)
    }

    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.comment.update',
        entity_type: 'observation_update',
        entity_id: commentId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.edited',
        user_id: user.id,
        user_name: actor,
        target_id: commentId,
        ...renderBilingual('observations.detail.timeline.commentEdited', { name: actor }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, commentId } = await params
    assertUuid(commentId)
    // W38: same author-or-admin gate as PATCH (see above).
    const { supabase, user, profile, permissions } = await requirePerm('observation:comment')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const ifMatch = readIfMatch(req)

    const { data: current } = await supabase
      .from('observation_updates')
      .select('author_id, updated_at')
      .eq('id', commentId)
      .eq('observation_id', observationId)
      .maybeSingle<{ author_id: string | null; updated_at: string }>()
    if (!current) throw NotFound(`Comment ${commentId} not found`)
    if (current.author_id !== user.id && !permissions.includes('observation:delete')) {
      throw Forbidden('Only the comment author can delete this comment.')
    }
    if (ifMatch != null) assertNotStale(ifMatch, current.updated_at)

    let q = supabase
      .from('observation_updates')
      .delete()
      .eq('id', commentId)
      .eq('observation_id', observationId)
    if (ifMatch != null) q = q.eq('updated_at', ifMatch)
    const { error } = await q
    if (error) throw error

    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.comment.delete',
        entity_type: 'observation_update',
        entity_id: commentId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'comment.deleted',
        user_id: user.id,
        user_name: actor,
        target_id: commentId,
        ...renderBilingual('observations.detail.timeline.commentDeleted', { name: actor }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok({ id: commentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
