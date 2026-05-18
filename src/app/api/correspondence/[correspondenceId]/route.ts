// /api/correspondence/[correspondenceId] — detail / patch / soft-delete.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCorrespondenceSchema } from '@/lib/api/schemas/correspondence'
import {
  CORRESPONDENCE_ATTACHMENT_COLUMNS,
  CORRESPONDENCE_DETAIL_COLUMNS,
  assertCorrespondenceExists,
} from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ correspondenceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('correspondence')
      .select(CORRESPONDENCE_DETAIL_COLUMNS)
      .eq('id', correspondenceId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Correspondence ${correspondenceId} not found`)

    const [attachments, thread] = await Promise.all([
      supabase
        .from('correspondence_attachments')
        .select(CORRESPONDENCE_ATTACHMENT_COLUMNS)
        .eq('correspondence_id', correspondenceId)
        .order('uploaded_at', { ascending: false }),
      // Thread peers — by `thread_id` text column. Returns siblings (excluding
      // self) ordered chronologically. Null thread_id → empty array.
      (async () => {
        const tid = (row as { thread_id: string | null }).thread_id
        if (!tid) return { data: [] }
        return supabase
          .from('correspondence')
          .select('id, reference, subject, status, date, from_party, to_parties')
          .eq('thread_id', tid)
          .neq('id', correspondenceId)
          .is('deleted_at', null)
          .order('date', { ascending: true })
      })(),
    ])

    return ok(
      {
        ...row,
        attachments: attachments.data ?? [],
        thread: thread.data ?? [],
      },
      {
        cache: {
          sMaxAge: 60,
          staleWhileRevalidate: 300,
          tags: [cacheTags.correspondence(correspondenceId)],
        },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCorrespondenceExists(supabase, correspondenceId)
    const patch = await parseJson(req, UpdateCorrespondenceSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('correspondence')
      .update(update)
      .eq('id', correspondenceId)
      .is('deleted_at', null)
      .select(CORRESPONDENCE_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.update',
      entity_type: 'correspondence',
      entity_id: correspondenceId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(correspondenceId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertCorrespondenceExists(supabase, correspondenceId)

    // Audit FIRST — append-only trail survives even if cascade is interrupted.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.delete',
      entity_type: 'correspondence',
      entity_id: correspondenceId,
      supabase,
    })

    // Hard-delete — FK cascade (migration 046) clears correspondence_attachments.
    const { error } = await supabase
      .from('correspondence')
      .delete()
      .eq('id', correspondenceId)
    if (error) throw error

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(correspondenceId)])
    return ok({ id: correspondenceId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
