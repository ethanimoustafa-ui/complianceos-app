// POST /api/risks/[riskId]/accept-plan — officer accepts proposed plan.
// Transitions 'plan-proposed' → 'in-progress' and sets risks.status='mitigating'.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
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
    const { supabase, user, profile } = await requirePerm('audit:edit')

    const { data: current, error: readErr } = await supabase
      .from('risks')
      .select('id, mitigation_workflow_status, status')
      .eq('id', riskId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; mitigation_workflow_status: string; status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Risk ${riskId} not found`)
    assertWorkflowTransition(current.mitigation_workflow_status, 'in-progress')

    const { data, error } = await supabase
      .from('risks')
      .update({
        mitigation_workflow_status: 'in-progress',
        status: 'mitigating',
      })
      .eq('id', riskId)
      .is('deleted_at', null)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.accept_plan',
        entity_type: 'risk',
        entity_id: riskId,
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'plan_accepted',
        user_id: user.id,
        previous_value: current.mitigation_workflow_status,
        new_value: 'in-progress',
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
