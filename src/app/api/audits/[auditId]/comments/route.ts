// /api/audits/[auditId]/comments — list & create audit comments.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { CreateAuditCommentSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_COMMENT_COLUMNS,
  assertAuditExists,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase } = await requireUser()
    await assertAuditExists(supabase, auditId)

    const { data, error } = await supabase
      .from('audit_comments')
      .select(AUDIT_COMMENT_COLUMNS)
      .eq('audit_id', auditId)
      .order('created_at', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.audits(auditId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, CreateAuditCommentSchema)

    const { data, error } = await supabase
      .from('audit_comments')
      .insert({
        audit_id: auditId,
        content: input.content,
        author_id: user.id,
      })
      .select(AUDIT_COMMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const truncated = input.content.length > 50
      ? `${input.content.slice(0, 50)}...`
      : input.content
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.comment.create',
        entity_type: 'audit_comment',
        entity_id: created.id,
        metadata: { audit_id: auditId },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'comment.added',
        description: `Comment added: "${truncated}"`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { comment_id: created.id },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
