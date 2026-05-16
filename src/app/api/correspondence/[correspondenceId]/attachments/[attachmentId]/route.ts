// DELETE /api/correspondence/[correspondenceId]/attachments/[attachmentId]

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertCorrespondenceExists } from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ correspondenceId: string; attachmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId, attachmentId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCorrespondenceExists(supabase, correspondenceId)

    const { error } = await supabase
      .from('correspondence_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('correspondence_id', correspondenceId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.attachment.delete',
      entity_type: 'correspondence_attachment',
      entity_id: attachmentId,
      metadata: { correspondence_id: correspondenceId },
      supabase,
    })

    revalidateAll([
      cacheTags.correspondence(correspondenceId),
      cacheTags.correspondenceAttachments(correspondenceId),
    ])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
