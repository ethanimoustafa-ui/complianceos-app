// POST /api/observations/[observationId]/reopen — closed → open.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  OBSERVATION_LIST_COLUMNS,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')

    const idCol = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam) ? 'id' : 'reference'
    const { data: current, error: readErr } = await supabase
      .from('observations')
      .select('id, status')
      .eq(idCol, observationIdParam)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Observation ${observationIdParam} not found`)
    const observationId = current.id
    if (current.status !== 'closed' && current.status !== 'resolved') {
      throw Conflict(`Cannot reopen observation in status ${current.status}`)
    }

    const { data, error } = await supabase
      .from('observations')
      .update({ status: 'open' })
      .eq('id', observationId)
      .is('deleted_at', null)
      .select(OBSERVATION_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

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
