// DELETE /api/observations/[observationId]/evidence/[evidenceId]

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string; evidenceId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, evidenceId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { error } = await supabase
      .from('observation_documents')
      .delete()
      .eq('id', evidenceId)
      .eq('observation_id', observationId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.evidence.delete',
        entity_type: 'observation_document',
        entity_id: evidenceId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'evidence.removed',
        description: `Evidence ${evidenceId} removed`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: evidenceId,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok({ id: evidenceId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
