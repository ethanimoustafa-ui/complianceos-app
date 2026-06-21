// /api/risks/[riskId] — item GET/PATCH/DELETE.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser, canDriveWorkflow } from '@/lib/api/auth'
import { handle, NotFound, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateRiskSchema } from '@/lib/api/schemas/risks'
import {
  RISK_LIST_COLUMNS,
  assertRiskExists,
  getRiskDetail,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase } = await requireUser()
    const detail = await getRiskDetail(supabase, riskId)
    // W26-A §2.2 / FORENSIC §4: entity reads must be no-store. The previous
    // 60s sMaxAge + stale-while-revalidate let the BROWSER serve a pre-write
    // detail body (stale workflow status, missing history) after mutations.
    return ok(detail, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    if (!ctx.permissions.includes('risk:edit') && !ctx.permissions.includes('audit:edit')) {
      throw Forbidden('Missing permission: risk:edit')
    }
    await assertRiskExists(supabase, riskId)
    const patch = await parseJson(req, UpdateRiskSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    // RBAC (ownership model): status / mitigation progress / workflow status / owner
    // changes DRIVE the risk lifecycle — gate them like the risk workflow routes
    // (workflow:advance OR risk ownership) so a generic PATCH can't bypass
    // accept-plan / the resolving toggle. Plain risk:edit covers other field edits.
    const RISK_LIFECYCLE_KEYS = ['status', 'mitigation_progress', 'mitigation_workflow_status', 'owner_id']
    if (RISK_LIFECYCLE_KEYS.some((k) => k in update)) {
      const { data: ownerRow } = await supabase
        .from('risks').select('owner_id').eq('id', riskId)
        .maybeSingle<{ owner_id: string | null }>()
      if (!canDriveWorkflow(ctx, ownerRow?.owner_id)) {
        throw Forbidden('Missing permission: workflow:advance (or risk ownership) to change risk status/owner')
      }
    }

    if (Object.keys(update).length === 0) {
      const detail = await getRiskDetail(supabase, riskId)
      return ok(detail)
    }

    const { data, error } = await supabase
      .from('risks')
      .update(update)
      .eq('id', riskId)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.update',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'updated',
        user_id: user.id,
        notes: `Updated fields: ${Object.keys(update).join(', ')}`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    if (update.status !== undefined || update.likelihood !== undefined || update.impact !== undefined) {
      revalidate(cacheTags.compliance())
    }
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['risk:delete', 'audit:delete'])
    await assertRiskExists(supabase, riskId)

    // Write the append-only audit-log entry FIRST so the compliance trail
    // survives even if the row-delete fails. audit_logs.target_id is a
    // polymorphic text/uuid pointer (NOT a FK) so it isn't cascade-cleared
    // by the DELETE below — see migration 044 + HANDOFF §5 gotcha #7.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'risk.delete',
      entity_type: 'risk',
      entity_id: riskId,
      supabase,
    })

    // Hard-delete. Migration 044 verified every child FK
    // (risk_department_proposed_plan, risk_history, risk_mitigation_checklist)
    // already specifies ON DELETE CASCADE, so children disappear in the
    // same statement.
    const { error } = await supabase
      .from('risks')
      .delete()
      .eq('id', riskId)
    if (error) throw error

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    revalidate(cacheTags.compliance())
    return ok({ id: riskId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
