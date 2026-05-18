// POST /api/observations/[observationId]/close — request closure + transition to 'closed'.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CloseObservationSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const input = await parseJson(req, CloseObservationSchema)

    // Param may be a uuid or a reference (the store maps observation.id to
    // `reference || id`). Probe accordingly so closure works either way.
    const idCol = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam) ? 'id' : 'reference'
    const { data: current, error: readErr } = await supabase
      .from('observations')
      .select('id, status')
      .eq(idCol, observationIdParam)
      .maybeSingle<{ id: string; status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Observation ${observationIdParam} not found`)
    const observationId = current.id
    if (current.status === 'closed') {
      return ok({ id: observationId, status: 'closed' })
    }

    // Upsert closure_request row.
    const reqRes = await supabase
      .from('closure_requests')
      .upsert(
        {
          observation_id: observationId,
          requested_by: user.id,
          notes: input.notes ?? null,
        },
        { onConflict: 'observation_id' },
      )
    if (reqRes.error) throw reqRes.error

    const { data, error } = await supabase
      .from('observations')
      .update({ status: 'closed', progress: 100 })
      .eq('id', observationId)
      .select(OBSERVATION_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? Conflict('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.close',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: { notes: input.notes },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'closed',
        description: 'Observation closed',
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { notes: input.notes },
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
