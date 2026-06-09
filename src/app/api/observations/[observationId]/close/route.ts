// POST /api/observations/[observationId]/close — request closure + transition to 'closed'.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CloseObservationSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
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
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const input = await parseJson(req, CloseObservationSchema)

    // Param may be a uuid or a reference (the store maps observation.id to
    // `reference || id`). Probe accordingly so closure works either way.
    const idCol = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam) ? 'id' : 'reference'
    const { data: current, error: readErr } = await supabase
      .from('observations')
      .select('id, status, updated_at')
      .eq(idCol, observationIdParam)
      .maybeSingle<{ id: string; status: string; updated_at: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Observation ${observationIdParam} not found`)
    const observationId = current.id
    if (current.status === 'closed' || current.status === 'resolved') {
      return ok({ id: observationId, status: current.status })
    }

    // W37: closure requires a verified (approved) remediation plan. Enforce the
    // same gate the client applies (remediationApproved) at the trust boundary
    // so a direct POST can't resolve an observation whose work isn't approved.
    const { data: latestPlan } = await supabase
      .from('remediation_plans')
      .select('status')
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ status: string }>()
    if (!latestPlan || latestPlan.status !== 'approved') {
      throw Conflict('Closure requires an approved remediation plan.')
    }

    // Wave-20.cleanup / W17.2 — optimistic-concurrency guard, atomic on the
    // CLIENT-supplied token (NOT the just-read value).
    const ifMatch = readIfMatch(req)
    assertNotStale(ifMatch, current.updated_at)

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

    // BUG 4 fix: "Request Closure" transitions to 'resolved' (Pending Review),
    // NOT 'closed'. The closure_requests row is persisted above; the move to
    // 'closed' happens only when a reviewer APPROVES the closure (reviewClosure).
    // Writing 'closed' here meant the server status never matched the store's
    // optimistic 'resolved', so "Pending Review" was unreconstructable on refresh.
    let updateQ = supabase
      .from('observations')
      .update({ status: 'resolved', progress: 100 })
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
      throw Conflict('Transition returned no row')
    }

    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.close',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: { notes: input.notes },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'closure_requested',
        user_id: user.id,
        user_name: actor,
        metadata: { notes: input.notes },
        ...renderBilingual('regulatoryUpdates.timeline.observationClosureRequested'),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
