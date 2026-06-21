// POST /api/risks/[riskId]/send-to-department — transitions workflow status
// from 'not-started' (or 'pending-assignment') → 'sent-to-department'.

import type { NextRequest } from 'next/server'
import { requireUser, canDriveWorkflow } from '@/lib/api/auth'
import { handle, NotFound, Conflict, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  RISK_LIST_COLUMNS,
  assertWorkflowTransition,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    // Ownership model: this is an OWNER-SIDE action. Anyone may attempt it, but
    // driving the risk's workflow requires the global 'workflow:advance' grant
    // (managers/admins by role; officers via the Access Matrix) OR being the
    // risk's owner (risks.owner_id). The generic 'audit:edit' (general editing)
    // no longer grants it. Mirrors the audit/policy/circular workflow routes.
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx

    const { data: current, error: readErr } = await supabase
      .from('risks')
      .select('id, mitigation_workflow_status, intended_department_id, owner_id')
      .eq('id', riskId)
      .maybeSingle<{
        id: string
        mitigation_workflow_status: string
        intended_department_id: string | null
        owner_id: string | null
      }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Risk ${riskId} not found`)
    if (!canDriveWorkflow(ctx, current.owner_id)) {
      throw Forbidden('Missing permission: workflow:advance (or risk ownership)')
    }
    if (!current.intended_department_id) {
      throw Conflict('Cannot send to department: intended_department_id is not set')
    }
    assertWorkflowTransition(current.mitigation_workflow_status, 'sent-to-department')

    const { data, error } = await supabase
      .from('risks')
      .update({
        mitigation_workflow_status: 'sent-to-department',
        sent_to_department_at: new Date().toISOString(),
      })
      .eq('id', riskId)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.send_to_department',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { intended_department_id: current.intended_department_id },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'sent_to_department',
        user_id: user.id,
        previous_value: current.mitigation_workflow_status,
        new_value: 'sent-to-department',
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
