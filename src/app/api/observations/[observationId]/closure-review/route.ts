// POST /api/observations/[observationId]/closure-review — approve / reject a
// pending closure request.
//
// W38: this endpoint is the missing server half of the closure flow. The store
// previously PATCHed `observations.status` directly on approve (so the
// `closure_reviews` table was never written and the verdict — reviewer, date,
// notes — vanished on reload) and POSTed /reopen on reject (which deletes the
// request + review rows, losing the rejection notes entirely).
//
//   approve → upsert closure_reviews(approved=true), status='closed',
//             archived_at=now (closed observations move to the Archive)
//   reject  → upsert closure_reviews(approved=false, notes), delete the
//             closure_request (so the assignee can re-request), status back to
//             'remediated' (plan stays approved)
//
// Self-review is blocked at the trust boundary: the closure requester cannot
// approve/reject their own request, mirroring the remediation-plan pattern.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound, Conflict, Forbidden, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ReviewClosureSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  assertObservationExists,
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
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, ReviewClosureSchema)

    const { data: current, error: readErr } = await supabase
      .from('observations')
      .select('id, status, updated_at')
      .eq('id', observationId)
      .maybeSingle<{ id: string; status: string; updated_at: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Observation ${observationId} not found`)

    // A closure verdict only makes sense on a pending request ('resolved').
    if (current.status !== 'resolved') {
      throw Conflict(`Cannot review closure of an observation in status '${current.status}'.`)
    }

    const { data: request, error: reqErr } = await supabase
      .from('closure_requests')
      .select('observation_id, requested_by, requested_at, notes')
      .eq('observation_id', observationId)
      .maybeSingle<{ observation_id: string; requested_by: string | null }>()
    if (reqErr) throw reqErr
    if (!request) throw Conflict('No closure request is pending review.')

    // Author-blocking: the requester cannot verdict their own closure request.
    if (request.requested_by === user.id) {
      throw Forbidden('You cannot review a closure request you submitted yourself.')
    }

    const ifMatch = readIfMatch(req)
    assertNotStale(ifMatch, current.updated_at)

    const now = new Date().toISOString()
    const reviewRes = await supabase.from('closure_reviews').upsert(
      {
        observation_id: observationId,
        reviewed_by: user.id,
        reviewed_at: now,
        approved: input.approved,
        notes: input.notes ?? null,
      },
      { onConflict: 'observation_id' },
    )
    if (reviewRes.error) throw reviewRes.error

    // Reject → clear the pending request so the assignee can re-request after
    // addressing the rejection notes. Approve → keep it as the audit anchor.
    if (!input.approved) {
      const delRes = await supabase
        .from('closure_requests')
        .delete()
        .eq('observation_id', observationId)
      if (delRes.error) throw delRes.error
    }

    const update = input.approved
      ? { status: 'closed', archived_at: now }
      : { status: 'remediated' }
    let updateQ = supabase
      .from('observations')
      .update(update)
      .eq('id', observationId)
      .is('deleted_at', null)
    if (ifMatch != null) updateQ = updateQ.eq('updated_at', ifMatch)
    const { data, error } = await updateQ.select(OBSERVATION_LIST_COLUMNS).maybeSingle()
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
        action: input.approved ? 'observation.closure.approve' : 'observation.closure.reject',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: { approved: input.approved, notes: input.notes },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: input.approved ? 'closure_approved' : 'closure_rejected',
        user_id: user.id,
        user_name: actor,
        metadata: { notes: input.notes },
        ...renderBilingual(
          input.approved
            ? 'regulatoryUpdates.timeline.observationClosureApproved'
            : 'regulatoryUpdates.timeline.observationClosureRejected',
        ),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
