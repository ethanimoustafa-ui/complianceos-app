// /api/audits/[auditId]/documents — list & register documents.
//
// File bytes live in Supabase Storage; this endpoint records the metadata row
// pointing at the storage path. The frontend should upload via the storage
// client, then call POST here with the resulting `storage_path`.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterAuditDocumentSchema } from '@/lib/api/schemas/audits'
import { assertAuditExists, insertAuditTimeline } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC_COLUMNS = 'id, audit_id, name, type, storage_path, uploaded_at, uploaded_by'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    assertUuid(auditId)
    const { supabase } = await requireUser()
    await assertAuditExists(supabase, auditId)

    const { data, error } = await supabase
      .from('audit_documents')
      .select(DOC_COLUMNS)
      .eq('audit_id', auditId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.auditDocuments(auditId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    assertUuid(auditId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, RegisterAuditDocumentSchema)

    const { data, error } = await supabase
      .from('audit_documents')
      .insert({
        audit_id: auditId,
        name: input.name,
        type: input.type,
        storage_path: input.storage_path,
        uploaded_by: user.id,
      })
      .select(DOC_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actorName = profile.name ?? profile.email ?? user.id
    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.document.register',
        entity_type: 'audit_document',
        entity_id: created.id,
        metadata: { audit_id: auditId, name: input.name },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'document.added',
        i18nKey: 'auditDetail.activityUploadedDocument',
        params: { name: input.name },
        userId: user.id,
        userName: actorName,
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId), cacheTags.auditDocuments(auditId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
