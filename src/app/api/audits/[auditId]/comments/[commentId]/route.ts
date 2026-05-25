// /api/audits/[auditId]/comments/[commentId] — edit & delete a comment.
// W26-A: assertUuid on both params + dual-store timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuditCommentSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_COMMENT_COLUMNS,
  assertAuditExists,
  insertAuditTimeline,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; commentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId, commentId } = await params
    // SEC-5: validate both route params.
    assertUuid(auditId, commentId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, UpdateAuditCommentSchema)

    const { data, error } = await supabase
      .from('audit_comments')
      .update({
        content: input.content,
        is_edited: true,
      })
      .eq('id', commentId)
      .eq('audit_id', auditId)
      .select(AUDIT_COMMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Comment ${commentId} not found`)

    const truncated = input.content.length > 50
      ? `${input.content.slice(0, 50)}...`
      : input.content
    const actorName = profile.name ?? profile.email ?? user.id
    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.comment.update',
        entity_type: 'audit_comment',
        entity_id: commentId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'comment.edited',
        i18nKey: 'auditDetail.activityEditedComment',
        params: { comment: truncated },
        userId: user.id,
        userName: actorName,
        metadata: { comment_id: commentId },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId, commentId } = await params
    // SEC-5: validate both route params.
    assertUuid(auditId, commentId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    const { error } = await supabase
      .from('audit_comments')
      .delete()
      .eq('id', commentId)
      .eq('audit_id', auditId)
    if (error) throw error

    const actorName = profile.name ?? profile.email ?? user.id
    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.comment.delete',
        entity_type: 'audit_comment',
        entity_id: commentId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'comment.deleted',
        i18nKey: 'auditDetail.activityDeletedComment',
        params: { comment: commentId },
        userId: user.id,
        userName: actorName,
        metadata: { comment_id: commentId },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok({ id: commentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
