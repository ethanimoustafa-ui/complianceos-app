// /api/risks/[riskId]/plan-documents/[docId] — delete a received-plan document.
// Removes the metadata row; storage-blob cleanup is deferred to a sweep job
// (same as audit documents).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  RISK_PLAN_DOCUMENT_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string; docId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { riskId, docId } = await params
    assertUuid(riskId, docId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)

    const { data, error } = await supabase
      .from('risk_plan_documents')
      .delete()
      .eq('id', docId)
      .eq('risk_id', riskId)
      .select(RISK_PLAN_DOCUMENT_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Document ${docId} not found`)

    const removed = data as { name: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.plan_document.delete',
        entity_type: 'risk_plan_document',
        entity_id: docId,
        metadata: { risk_id: riskId, name: removed.name },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'mitigation_updated',
        user_id: user.id,
        notes: `Plan document removed: ${removed.name}`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok({ id: docId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
