// /api/policies/[policyId]/attachments/[attachmentId]
// GET (with ETag) + DELETE (with If-Match) — Wave-18 hardening.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  POLICY_ATTACHMENT_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; attachmentId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId, attachmentId } = await params
    assertUuid(policyId, attachmentId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_attachments')
      .select(POLICY_ATTACHMENT_COLUMNS)
      .eq('id', attachmentId)
      .eq('policy_id', uuid)
      .maybeSingle<Record<string, unknown>>()
    if (error) throw error
    if (!data) throw NotFound(`Attachment ${attachmentId} not found`)
    const updatedAt = data.updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined
    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { policyId, attachmentId } = await params
    assertUuid(policyId, attachmentId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const ifMatch = readIfMatch(req)

    // Snapshot for the activity-log message.
    const { data: prev, error: readErr } = await supabase
      .from('policy_attachments')
      .select('id, name, updated_at')
      .eq('id', attachmentId)
      .eq('policy_id', uuid)
      .maybeSingle<{ id: string; name: string; updated_at: string }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Attachment ${attachmentId} not found`)

    let delQuery = supabase
      .from('policy_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('policy_id', uuid)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { data: deleted, error } = await delQuery.select('id')
    if (error) throw error
    if (ifMatch != null && (!deleted || deleted.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

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
