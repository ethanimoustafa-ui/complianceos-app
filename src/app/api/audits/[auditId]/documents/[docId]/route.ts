// /api/audits/[auditId]/documents/[docId] — delete a single audit document.
//
// Note: this only removes the metadata row. Storage cleanup (deleting the
// blob at `storage_path`) is intentionally deferred — a Phase 6+ background
// job should sweep orphaned files. Doing it inline blocks the response on a
// second network round-trip and risks partial failures.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import {
  AUDIT_DOCUMENT_COLUMNS,
  assertAuditExists,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; docId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId, docId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    const { data, error } = await supabase
      .from('audit_documents')
      .delete()
      .eq('id', docId)
      .eq('audit_id', auditId)
      .select(AUDIT_DOCUMENT_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Document ${docId} not found`)

    const removed = data as { name: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.document.delete',
        entity_type: 'audit_document',
        entity_id: docId,
        metadata: { audit_id: auditId, name: removed.name },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'document.removed',
        description: `Document removed: ${removed.name}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { document_id: docId, name: removed.name },
        supabase,
      }),
    ])

    revalidateAll([
      cacheTags.audits(),
      cacheTags.audits(auditId),
      cacheTags.auditDocuments(auditId),
    ])
    return ok({ id: docId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
