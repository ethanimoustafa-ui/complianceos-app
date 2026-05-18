// DELETE /api/letters/[letterId]/attachments/[attachmentId]

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertLetterExists } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string; attachmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { letterId, attachmentId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)

    const { error } = await supabase
      .from('letter_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('letter_id', letterId)
    if (error) throw error

    // Audit log only — attachment lifecycle is too noisy for the workflow
    // timeline. (Fix-3 wave.)
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.attachment.delete',
      entity_type: 'letter_attachment',
      entity_id: attachmentId,
      metadata: { letter_id: letterId },
      supabase,
    })

    revalidateAll([
      cacheTags.letters(),
      cacheTags.letters(letterId),
      cacheTags.letterAttachments(letterId),
    ])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
