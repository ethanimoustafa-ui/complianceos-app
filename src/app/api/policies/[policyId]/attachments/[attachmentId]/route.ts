// DELETE /api/policies/[policyId]/attachments/[attachmentId]

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; attachmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { policyId, attachmentId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)

    // Snapshot to log the human-readable name before removing the row.
    const { data: prev, error: readErr } = await supabase
      .from('policy_attachments')
      .select('id, name')
      .eq('id', attachmentId)
      .eq('policy_id', uuid)
      .maybeSingle<{ id: string; name: string }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Attachment ${attachmentId} not found`)

    const { error } = await supabase
      .from('policy_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('policy_id', uuid)
    if (error) throw error

    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.attachment.delete',
        entity_type: 'policy_attachment',
        entity_id: attachmentId,
        metadata: { policy_id: uuid, name: prev.name },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'attachment_removed',
        text_en: `Attachment "${prev.name}" removed`,
        text_ar: `تمت إزالة المرفق "${prev.name}"`,
        user_name: actor,
      }),
    ])

    revalidateAll([
      cacheTags.policies(),
      cacheTags.policies(uuid),
      cacheTags.policyAttachments(uuid),
    ])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
