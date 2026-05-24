// POST /api/observations/[observationId]/reopen — closed → open.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
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

    const idCol = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam) ? 'id' : 'reference'
    const { data: current, error: readErr } = await supabase
      .from('observations')
      .select('id, status, updated_at')
      .eq(idCol, observationIdParam)
      .maybeSingle<{ id: string; status: string; updated_at: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Observation ${observationIdParam} not found`)
    const observationId = current.id
    if (current.status !== 'closed' && current.status !== 'resolved') {
      throw Conflict(`Cannot reopen observation in status ${current.status}`)
    }

    // Wave-20.cleanup / W17.2 — optimistic-concurrency guard, atomic on the
    // CLIENT-supplied token.
    const ifMatch = readIfMatch(req)
    assertNotStale(ifMatch, current.updated_at)

    let updateQ = supabase
      .from('observations')
      .update({ status: 'open' })
      .eq('id', observationId)
      .is('deleted_at', null)
    if (ifMatch != null) updateQ = updateQ.eq('updated_at', ifMatch)
    const { data, error } = await updateQ
      .select(OBSERVATION_LIST_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Transition returned no row')
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.reopen',
        entity_type: 'observation',
        entity_id: observationId,
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'reopened',
        description: 'Observation reopened',
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
