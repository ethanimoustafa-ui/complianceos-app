// /api/observations/[observationId] — item GET/PATCH/DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateObservationSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  assertObservationExists,
  getObservationDetail,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId } = await params
    const { supabase } = await requireUser()
    const detail = await getObservationDetail(supabase, observationId)
    return ok(detail, {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.observations(observationId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const patch = await parseJson(req, UpdateObservationSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const detail = await getObservationDetail(supabase, observationId)
      return ok(detail)
    }

    const { data, error } = await supabase
      .from('observations')
      .update(update)
      .eq('id', observationId)
      .is('deleted_at', null)
      .select(OBSERVATION_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.update',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'updated',
        description: `Updated fields: ${Object.keys(update).join(', ')}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { fields: Object.keys(update) },
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    if (update.status !== undefined || update.progress !== undefined) {
      revalidate(cacheTags.compliance())
    }
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:delete')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { error } = await supabase
      .from('observations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', observationId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'observation.delete',
      entity_type: 'observation',
      entity_id: observationId,
      supabase,
    })

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok({ id: observationId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
