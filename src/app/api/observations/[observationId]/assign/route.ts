// POST /api/observations/[observationId]/assign — set leader and/or assignees.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, parseJson, readIfMatch } from '@/lib/api/validate'
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
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, AssignObservationSchema)

    // Wave-20.cleanup / W17.2 — optimistic-concurrency guard. The PATCH on
    // /observations/[id] uses an atomic-on-client-token shape; mirror it here
    // so leadership / assignee changes can't trample concurrent edits.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('observations')
        .select('updated_at')
        .eq('id', observationId)
        .is('deleted_at', null)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    if (input.leader_id !== undefined) {
      let leaderQ = supabase
        .from('observations')
        .update({ leader_id: input.leader_id ?? null })
        .eq('id', observationId)
        .is('deleted_at', null)
      if (ifMatch != null) leaderQ = leaderQ.eq('updated_at', ifMatch)
      const { data: leaderRow, error } = await leaderQ.select('id').maybeSingle()
      if (error) throw error
      if (!leaderRow && ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
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
