// /api/correspondence/[correspondenceId]/attachments — list + register.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterCorrespondenceAttachmentSchema } from '@/lib/api/schemas/correspondence'
import {
  CORRESPONDENCE_ATTACHMENT_COLUMNS,
  assertCorrespondenceExists,
} from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ correspondenceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    const { supabase } = await requireUser()
    await assertCorrespondenceExists(supabase, correspondenceId)
    const { data, error } = await supabase
      .from('correspondence_attachments')
      .select(CORRESPONDENCE_ATTACHMENT_COLUMNS)
      .eq('correspondence_id', correspondenceId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.correspondenceAttachments(correspondenceId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCorrespondenceExists(supabase, correspondenceId)
    const input = await parseJson(req, RegisterCorrespondenceAttachmentSchema)

    const { data, error } = await supabase
      .from('correspondence_attachments')
      .insert({
        correspondence_id: correspondenceId,
        name: input.name,
        storage_path: input.storage_path,
        type: input.type ?? null,
        size: input.size ?? null,
        uploaded_by: user.id,
      })
      .select(CORRESPONDENCE_ATTACHMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.attachment.register',
      entity_type: 'correspondence_attachment',
      entity_id: created.id,
      metadata: { correspondence_id: correspondenceId, name: input.name },
      supabase,
    })

    revalidateAll([
      cacheTags.correspondence(),
      cacheTags.correspondence(correspondenceId),
      cacheTags.correspondenceAttachments(correspondenceId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
