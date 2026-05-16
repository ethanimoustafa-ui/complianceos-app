// /api/observations/[observationId]/checklist/[itemId] — PATCH/DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateChecklistItemSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_CHECKLIST_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, itemId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const patch = await parseJson(req, UpdateChecklistItemSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('observation_checklist')
      .update(update)
      .eq('id', itemId)
      .eq('observation_id', observationId)
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Checklist item ${itemId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.checklist.update',
        entity_type: 'observation_checklist',
        entity_id: itemId,
        metadata: { observation_id: observationId, fields: Object.keys(update) },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type:
          update.completed === true
            ? 'checklist.completed'
            : update.completed === false
              ? 'checklist.uncompleted'
              : 'checklist.updated',
        description: `Checklist item ${itemId} updated`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: itemId,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, itemId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { error } = await supabase
      .from('observation_checklist')
      .delete()
      .eq('id', itemId)
      .eq('observation_id', observationId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.checklist.delete',
        entity_type: 'observation_checklist',
        entity_id: itemId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'checklist.removed',
        description: `Checklist item ${itemId} removed`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: itemId,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok({ id: itemId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
