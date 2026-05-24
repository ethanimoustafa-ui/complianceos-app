// Wave-20 — DELETE /api/observations/[observationId]/evidence/[evidenceId]
// W17.2 atomic-If-Match.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  assertObservationExists,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; evidenceId: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, evidenceId } = await params
    assertUuid(evidenceId)
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const ifMatch = readIfMatch(req)

    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('observation_documents')
        .select('updated_at')
        .eq('id', evidenceId)
        .eq('observation_id', observationId)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    let q = supabase
      .from('observation_documents')
      .delete()
      .eq('id', evidenceId)
      .eq('observation_id', observationId)
    if (ifMatch != null) q = q.eq('updated_at', ifMatch)
    const { data: deleted, error } = await q.select('id, name').maybeSingle<{ id: string; name: string }>()
    if (error) throw error
    if (!deleted && ifMatch != null) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.evidence.delete',
        entity_type: 'observation_document',
        entity_id: evidenceId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'evidence.removed',
        user_id: user.id,
        user_name: actor,
        target_id: evidenceId,
        ...renderBilingual('regulatoryUpdates.timeline.pdfDocumentRemoved', {
          name: deleted?.name ?? '',
        }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok({ id: evidenceId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
