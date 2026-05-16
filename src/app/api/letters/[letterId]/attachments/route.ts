// /api/letters/[letterId]/attachments — list + register letter attachments.
// File bytes are uploaded directly to Supabase Storage; this endpoint records
// the metadata row pointing at the storage path.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterLetterAttachmentSchema } from '@/lib/api/schemas/letters'
import { assertLetterExists } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ATT_COLUMNS =
  'id, letter_id, name, storage_path, type, size, uploaded_at, uploaded_by'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase } = await requireUser()
    await assertLetterExists(supabase, letterId)
    const { data, error } = await supabase
      .from('letter_attachments')
      .select(ATT_COLUMNS)
      .eq('letter_id', letterId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.letterAttachments(letterId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)
    const input = await parseJson(req, RegisterLetterAttachmentSchema)

    const { data, error } = await supabase
      .from('letter_attachments')
      .insert({
        letter_id: letterId,
        name: input.name,
        storage_path: input.storage_path,
        type: input.type ?? null,
        size: input.size ?? null,
        uploaded_by: user.id,
      })
      .select(ATT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    // Audit log only — attachment lifecycle does not appear in the workflow
    // timeline (which is reserved for draft_saved / submitted / approved /
    // sent / response_received / archived). (Fix-3 wave.)
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.attachment.register',
      entity_type: 'letter_attachment',
      entity_id: created.id,
      metadata: { letter_id: letterId, name: input.name },
      supabase,
    })

    revalidateAll([
      cacheTags.letters(letterId),
      cacheTags.letterAttachments(letterId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
