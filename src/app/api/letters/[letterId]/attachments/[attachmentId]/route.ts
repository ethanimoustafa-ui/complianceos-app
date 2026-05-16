// DELETE /api/letters/[letterId]/attachments/[attachmentId]

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  assertLetterExists,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string; attachmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { letterId, attachmentId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)

    const { error } = await supabase
      .from('sama_letter_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('letter_id', letterId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'sama_letter.attachment.delete',
        entity_type: 'sama_letter_attachment',
        entity_id: attachmentId,
        metadata: { letter_id: letterId },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'Attachment deleted',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([
      cacheTags.samaLetters(letterId),
      cacheTags.samaLetterAttachments(letterId),
    ])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
