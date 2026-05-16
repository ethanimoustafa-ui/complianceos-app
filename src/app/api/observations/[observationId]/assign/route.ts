// POST /api/observations/[observationId]/assign — set leader and/or assignees.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AssignObservationSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    await assertObservationExists(supabase, observationId)
    const input = await parseJson(req, AssignObservationSchema)

    if (input.leader_id !== undefined) {
      const { error } = await supabase
        .from('observations')
        .update({ leader_id: input.leader_id ?? null })
        .eq('id', observationId)
        .is('deleted_at', null)
      if (error) throw error
    }

    if (input.assignees) {
      // Replace assignees set: delete + re-insert.
      const delRes = await supabase
        .from('observation_assignees')
        .delete()
        .eq('observation_id', observationId)
      if (delRes.error) throw delRes.error
      if (input.assignees.length > 0) {
        const rows = input.assignees.map((a) => ({
          observation_id: observationId,
          user_id: a.user_id ?? null,
          name: a.name,
          role: a.role ?? null,
        }))
        const insRes = await supabase.from('observation_assignees').insert(rows)
        if (insRes.error) throw insRes.error
      }
    }

    const { data, error } = await supabase
      .from('observations')
      .select(OBSERVATION_LIST_COLUMNS)
      .eq('id', observationId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Observation ${observationId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.assign',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: {
          leader_id: input.leader_id,
          assignees_count: input.assignees?.length,
        },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'assigned',
        description:
          input.leader_id !== undefined
            ? 'Leadership transferred'
            : 'Assignees updated',
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
