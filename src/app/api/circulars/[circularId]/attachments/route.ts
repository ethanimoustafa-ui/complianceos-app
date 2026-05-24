// GAP-1: /api/circulars/[circularId]/attachments — list + create CAP /
// remediation documents. `?kind=cap|remediation` selects the table. The file
// is stored base64-inline in `storage_path` (same precedent as `pdf_url`).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, ValidationFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { safeBasename } from '@/lib/api/sanitize'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  AttachmentKind,
  CreateCircularAttachmentSchema,
} from '@/lib/api/schemas/circulars'
import {
  CIRCULAR_ATTACHMENT_COLUMNS,
  assertCircularExists,
  circularAttachmentTable,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const kindRaw = new URL(req.url).searchParams.get('kind')
    const kindParsed = AttachmentKind.safeParse(kindRaw)
    if (!kindParsed.success) {
      throw ValidationFailed(kindParsed.error.flatten(), 'Invalid or missing kind')
    }

    const { data, error } = await supabase
      .from(circularAttachmentTable(kindParsed.data))
      .select(CIRCULAR_ATTACHMENT_COLUMNS)
      .eq('circular_id', circularId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const input = await parseJson(req, CreateCircularAttachmentSchema)
    const actor = profile.name ?? profile.email ?? user.id

    // SEC-10: the filename is user-controlled — reduce it to a safe basename
    // (strip `/`, `\`, `..` path components) before it's persisted, displayed,
    // or used in a download `name` attribute.
    const safeName = safeBasename(input.name)

    const { data, error } = await supabase
      .from(circularAttachmentTable(input.kind))
      .insert({
        circular_id: circularId,
        name: safeName,
        storage_path: input.storage_path,
        type: input.type ?? null,
        size: input.size ?? null,
        uploaded_by: user.id,
      })
      .select(CIRCULAR_ATTACHMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const uploadedKey =
      input.kind === 'cap'
        ? 'regulatoryUpdates.timeline.capDocumentUploaded'
        : input.kind === 'pdf'
        ? 'regulatoryUpdates.timeline.pdfDocumentUploaded'
        : 'regulatoryUpdates.timeline.remediationDocumentUploaded'
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.attachment.create',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { kind: input.kind, name: safeName },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        renderBilingual(uploadedKey, { name: safeName }),
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
