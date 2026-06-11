// /api/risks/[riskId]/plan-documents — list & register received-plan documents.
//
// File bytes live in the `risk_plan_documents` storage bucket; the client
// uploads via the storage client then POSTs the resulting `storage_path` here.
// Mirrors /api/audits/[auditId]/documents.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterRiskPlanDocumentSchema } from '@/lib/api/schemas/risks'
import {
  RISK_PLAN_DOCUMENT_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    assertUuid(riskId)
    const { supabase } = await requireUser()
    await assertRiskExists(supabase, riskId)

    const { data, error } = await supabase
      .from('risk_plan_documents')
      .select(RISK_PLAN_DOCUMENT_COLUMNS)
      .eq('risk_id', riskId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    assertUuid(riskId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)
    const input = await parseJson(req, RegisterRiskPlanDocumentSchema)

    const { data, error } = await supabase
      .from('risk_plan_documents')
      .insert({
        risk_id: riskId,
        name: input.name,
        type: input.type,
        storage_path: input.storage_path,
        uploaded_by: user.id,
      })
      .select(RISK_PLAN_DOCUMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.plan_document.register',
        entity_type: 'risk_plan_document',
        entity_id: created.id,
        metadata: { risk_id: riskId, name: input.name },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'mitigation_updated',
        user_id: user.id,
        notes: `Plan document attached: ${input.name}`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
