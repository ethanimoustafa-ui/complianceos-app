// /api/letters/[letterId]/attachments — list + register letter attachments.
// File bytes are uploaded directly to Supabase Storage; this endpoint records
// the metadata row pointing at the storage path.
//
// Wave-21: assertUuid + SEC-10 path-traversal filename sanitization +
//          cache:'no-store' on GET.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterLetterAttachmentSchema } from '@/lib/api/schemas/letters'
import { assertLetterExists } from '@/lib/api/services/letters'
import { safeBasename } from '@/lib/api/sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ATT_COLUMNS =
  'id, letter_id, name, storage_path, type, size, uploaded_at, uploaded_by'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase } = await requireUser()
    await assertLetterExists(supabase, letterId)
    const { data, error } = await supabase
      .from('letter_attachments')
      .select(ATT_COLUMNS)
      .eq('letter_id', letterId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    // PORTING-TEMPLATE §2.2 — cache:'no-store' on entity reads.
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)
    const input = await parseJson(req, RegisterLetterAttachmentSchema)

    // SEC-10 — path-traversal defence: sanitize the filename to its basename.
    const safeName = safeBasename(input.name)

    const { data, error } = await supabase
      .from('letter_attachments')
      .insert({
        letter_id: letterId,
        name: safeName,
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
      metadata: { letter_id: letterId, name: safeName },
      supabase,
    })

    revalidateAll([
      cacheTags.letters(),
      cacheTags.letters(letterId),
      cacheTags.letterAttachments(letterId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
