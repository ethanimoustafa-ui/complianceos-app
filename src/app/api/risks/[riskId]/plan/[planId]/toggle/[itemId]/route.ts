// PATCH /api/risks/[riskId]/plan/[planId]/toggle/[itemId]
//
// Toggles a `risk_mitigation_checklist` item. When all items in the checklist
// become completed, transitions risk status → 'resolved' and
// mitigation_workflow_status → 'resolved'.
//
// `planId` is `risk_department_proposed_plan.risk_id` (same as `riskId`) per
// the current schema (1:1 sub-table). Accepting it in the path keeps the spec
// shape; we don't query it.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  RISK_CHECKLIST_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ riskId: string; planId: string; itemId: string }>
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const { riskId, planId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)

    const { data: current, error: readErr } = await supabase
      .from('risk_mitigation_checklist')
      .select('id, completed')
      .eq('id', itemId)
      .eq('risk_id', riskId)
      .maybeSingle<{ id: string; completed: boolean }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Checklist item ${itemId} not found`)

    const newCompleted = !current.completed
    const { data, error } = await supabase
      .from('risk_mitigation_checklist')
      .update({ completed: newCompleted })
      .eq('id', itemId)
      .eq('risk_id', riskId)
      .select(RISK_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    // Re-check whether all items are now complete.
    const { data: remaining } = await supabase
      .from('risk_mitigation_checklist')
      .select('id, completed')
      .eq('risk_id', riskId)
    const rows = (remaining ?? []) as Array<{ id: string; completed: boolean }>
    const allDone = rows.length > 0 && rows.every((r) => r.completed)
    const totalCount = rows.length
    const completedCount = rows.filter((r) => r.completed).length
    const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

    const riskUpdate: Record<string, unknown> = { mitigation_progress: progress }
    if (allDone) {
      riskUpdate.status = 'resolved'
      riskUpdate.mitigation_workflow_status = 'resolved'
    }
    const riskRes = await supabase
      .from('risks')
      .update(riskUpdate)
      .eq('id', riskId)
      .is('deleted_at', null)
    if (riskRes.error) throw riskRes.error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.checklist.toggle',
        entity_type: 'risk_mitigation_checklist',
        entity_id: itemId,
        metadata: {
          risk_id: riskId,
          plan_id: planId,
          completed: newCompleted,
          all_done: allDone,
        },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: allDone ? 'mitigated' : 'checklist_toggled',
        user_id: user.id,
        notes: `Item ${itemId} ${newCompleted ? 'completed' : 'reopened'} (${completedCount}/${totalCount})`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    if (allDone) revalidate(cacheTags.compliance())
    return ok({ ...data, risk_progress: progress, all_done: allDone })
  } catch (e) {
    return handle(e)
  }
}
