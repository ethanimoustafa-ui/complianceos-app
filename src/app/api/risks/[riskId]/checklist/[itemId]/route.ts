// /api/risks/[riskId]/checklist/[itemId] — PATCH/DELETE risk checklist items.
//
// Mirror of the observation-checklist per-item route. When a `completed`
// patch arrives, we also re-derive `risks.mitigation_progress` and, when the
// whole list goes complete, transition the risk to status/workflow=resolved.
// (This matches the existing plan-toggle route's terminal behaviour.)

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateRiskChecklistItemSchema } from '@/lib/api/schemas/risks'
import {
  RISK_CHECKLIST_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { riskId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)
    const patch = await parseJson(req, UpdateRiskChecklistItemSchema)

    // Drop `deadline` until the column exists.
    const update: Record<string, unknown> = {}
    if (patch.text !== undefined) update.text = patch.text
    if (patch.completed !== undefined) update.completed = patch.completed
    if (patch.sort_order !== undefined) update.sort_order = patch.sort_order

    if (Object.keys(update).length === 0) {
      const { data, error } = await supabase
        .from('risk_mitigation_checklist')
        .select(RISK_CHECKLIST_COLUMNS)
        .eq('id', itemId)
        .eq('risk_id', riskId)
        .maybeSingle()
      if (error) throw error
      if (!data) throw NotFound(`Checklist item ${itemId} not found`)
      return ok(data)
    }

    const { data, error } = await supabase
      .from('risk_mitigation_checklist')
      .update(update)
      .eq('id', itemId)
      .eq('risk_id', riskId)
      .select(RISK_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Checklist item ${itemId} not found`)

    // Recompute progress + maybe terminal-transition the risk.
    let allDone = false
    if (patch.completed !== undefined) {
      const { data: remaining } = await supabase
        .from('risk_mitigation_checklist')
        .select('id, completed')
        .eq('risk_id', riskId)
      const rows = (remaining ?? []) as Array<{ id: string; completed: boolean }>
      const total = rows.length
      const completed = rows.filter((r) => r.completed).length
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100)
      allDone = total > 0 && completed === total

      const riskUpdate: Record<string, unknown> = { mitigation_progress: progress }
      if (allDone) {
        riskUpdate.status = 'resolved'
        riskUpdate.mitigation_workflow_status = 'resolved'
      }
      const rUp = await supabase
        .from('risks')
        .update(riskUpdate)
        .eq('id', riskId)
        .is('deleted_at', null)
      if (rUp.error) throw rUp.error
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.checklist.update',
        entity_type: 'risk_mitigation_checklist',
        entity_id: itemId,
        metadata: { risk_id: riskId, fields: Object.keys(update), all_done: allDone },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action:
          patch.completed === true
            ? allDone
              ? 'mitigated'
              : 'checklist_toggled'
            : patch.completed === false
              ? 'checklist_toggled'
              : patch.text !== undefined
                ? 'checklist_edited'
                : 'updated',
        user_id: user.id,
        new_value: patch.text ?? null,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    if (allDone) revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { riskId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)

    // Fetch text for history note before deleting.
    const { data: before } = await supabase
      .from('risk_mitigation_checklist')
      .select('text')
      .eq('id', itemId)
      .eq('risk_id', riskId)
      .maybeSingle<{ text: string }>()

    const { error } = await supabase
      .from('risk_mitigation_checklist')
      .delete()
      .eq('id', itemId)
      .eq('risk_id', riskId)
    if (error) throw error

    // Re-derive progress after removal.
    const { data: remaining } = await supabase
      .from('risk_mitigation_checklist')
      .select('id, completed')
      .eq('risk_id', riskId)
    const rows = (remaining ?? []) as Array<{ id: string; completed: boolean }>
    const total = rows.length
    const completed = rows.filter((r) => r.completed).length
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100)
    const rUp = await supabase
      .from('risks')
      .update({ mitigation_progress: progress })
      .eq('id', riskId)
      .is('deleted_at', null)
    if (rUp.error) throw rUp.error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.checklist.delete',
        entity_type: 'risk_mitigation_checklist',
        entity_id: itemId,
        metadata: { risk_id: riskId },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'checklist_removed',
        user_id: user.id,
        new_value: before?.text ?? null,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok({ id: itemId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
