// POST /api/risks/[riskId]/submit-plan — department submits proposed plan.
// Transitions 'sent-to-department' → 'plan-proposed' and upserts
// risk_department_proposed_plan + (optionally) risk_mitigation_checklist rows.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { SubmitRiskPlanSchema } from '@/lib/api/schemas/risks'
import {
  RISK_LIST_COLUMNS,
  assertWorkflowTransition,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    const input = await parseJson(req, SubmitRiskPlanSchema)

    const { data: current, error: readErr } = await supabase
      .from('risks')
      .select('id, mitigation_workflow_status')
      .eq('id', riskId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; mitigation_workflow_status: string }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Risk ${riskId} not found`)
    assertWorkflowTransition(current.mitigation_workflow_status, 'plan-proposed')

    // Upsert proposed plan.
    const upRes = await supabase
      .from('risk_department_proposed_plan')
      .upsert(
        {
          risk_id: riskId,
          plan: input.plan,
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'risk_id' },
      )
    if (upRes.error) throw upRes.error

    // Replace checklist if provided.
    if (input.checklist.length > 0) {
      const delRes = await supabase
        .from('risk_mitigation_checklist')
        .delete()
        .eq('risk_id', riskId)
      if (delRes.error) throw delRes.error
      const rows = input.checklist.map((c, i) => ({
        risk_id: riskId,
        text: c.text,
        completed: false,
        sort_order: c.sort_order ?? i,
        deadline: c.deadline ?? null,
      }))
      const insRes = await supabase.from('risk_mitigation_checklist').insert(rows)
      if (insRes.error) throw insRes.error
    }

    const { data, error } = await supabase
      .from('risks')
      .update({ mitigation_workflow_status: 'plan-proposed' })
      .eq('id', riskId)
      .is('deleted_at', null)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Transition returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.submit_plan',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { checklist_items: input.checklist.length },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'plan_submitted',
        user_id: user.id,
        previous_value: current.mitigation_workflow_status,
        new_value: 'plan-proposed',
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
