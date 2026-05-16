// DELETE /api/observations/[observationId]/attachments/[attachmentId]

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

type Params = { params: Promise<{ observationId: string; attachmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { observationId, attachmentId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    await assertObservationExists(supabase, observationId)

    const { error } = await supabase
      .from('observation_documents')
      .delete()
      .eq('id', attachmentId)
      .eq('observation_id', observationId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.attachment.delete',
        entity_type: 'observation_document',
        entity_id: attachmentId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'attachment.removed',
        description: `Attachment ${attachmentId} removed`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: attachmentId,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
