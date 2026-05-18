// /api/audits/[auditId]/comments/[commentId] — edit & delete a comment.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { UpdateAuditCommentSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_COMMENT_COLUMNS,
  assertAuditExists,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; commentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId, commentId } = await params
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
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.comment.update',
        entity_type: 'audit_comment',
        entity_id: commentId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'comment.edited',
        description: `Comment edited: "${truncated}"`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
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
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    const { error } = await supabase
      .from('audit_comments')
      .delete()
      .eq('id', commentId)
      .eq('audit_id', auditId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.comment.delete',
        entity_type: 'audit_comment',
        entity_id: commentId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'comment.deleted',
        description: `Comment deleted`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
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
