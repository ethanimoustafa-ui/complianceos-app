// GAP-1: DELETE /api/circulars/[circularId]/attachments/[attachmentId]
//   `?kind=cap|remediation|pdf` selects the table.
// W17.2: GET /api/circulars/[circularId]/attachments/[attachmentId]?kind=…
//   single-resource read so the client can pick up `ETag: W/"<updated_at>"`
//   before an `If-Match`-guarded DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed, ValidationFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AttachmentKind } from '@/lib/api/schemas/circulars'
import { assertUuid, readIfMatch } from '@/lib/api/validate'
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

type Params = { params: Promise<{ circularId: string; attachmentId: string }> }

// W17.2: single-resource GET — exposes `ETag: W/"<updated_at>"` so the client
// can echo it on the next `If-Match`-guarded DELETE. `?kind=cap|remediation|pdf`
// selects the table, mirroring the DELETE handler below.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { circularId, attachmentId } = await params
    assertUuid(circularId, attachmentId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const kindRaw = new URL(req.url).searchParams.get('kind')
    const kindParsed = AttachmentKind.safeParse(kindRaw)
    if (!kindParsed.success) {
      throw ValidationFailed(kindParsed.error.flatten(), 'Invalid or missing kind')
    }
    const table = circularAttachmentTable(kindParsed.data)

    const { data, error } = await supabase
      .from(table)
      .select(CIRCULAR_ATTACHMENT_COLUMNS)
      .eq('id', attachmentId)
      .eq('circular_id', circularId)
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
    const { circularId, attachmentId } = await params
    assertUuid(circularId, attachmentId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    // W17-1 / SEC-1: optimistic-concurrency token. DELETE scoped to live
    // `updated_at` when `If-Match` is sent so a concurrent writer trips 412.
    const ifMatch = readIfMatch(req)
    const actor = profile.name ?? profile.email ?? user.id

    const kindRaw = new URL(req.url).searchParams.get('kind')
    const kindParsed = AttachmentKind.safeParse(kindRaw)
    if (!kindParsed.success) {
      throw ValidationFailed(kindParsed.error.flatten(), 'Invalid or missing kind')
    }
    const table = circularAttachmentTable(kindParsed.data)

    // Fetch the row first so we have the name for the timeline event and can
    // confirm it belongs to this circular.
    const { data: existing, error: getErr } = await supabase
      .from(table)
      .select(CIRCULAR_ATTACHMENT_COLUMNS)
      .eq('id', attachmentId)
      .eq('circular_id', circularId)
      .maybeSingle<{ id: string; name: string; updated_at: string }>()
    if (getErr) throw getErr
    if (!existing) throw NotFound(`Attachment ${attachmentId} not found`)

    let delQuery = supabase
      .from(table)
      .delete()
      .eq('id', attachmentId)
      .eq('circular_id', circularId)
    if (ifMatch != null) {
      // W17.2: scope on the CLIENT's claimed token (not the just-read server
      // value) so a stale `If-Match` matches 0 rows and trips 412 below.
      delQuery = delQuery.eq('updated_at', ifMatch)
    }
    const { data: deletedRows, error: delErr } = await delQuery.select('id')
    if (delErr) throw delErr
    if (ifMatch != null && (!deletedRows || deletedRows.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const removedKey =
      kindParsed.data === 'cap'
        ? 'regulatoryUpdates.timeline.capDocumentRemoved'
        : kindParsed.data === 'pdf'
        ? 'regulatoryUpdates.timeline.pdfDocumentRemoved'
        : 'regulatoryUpdates.timeline.remediationDocumentRemoved'
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.attachment.delete',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { kind: kindParsed.data, name: existing.name },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        renderBilingual(removedKey, { name: existing.name }),
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    return ok({ id: attachmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
