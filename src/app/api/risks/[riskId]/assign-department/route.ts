// POST /api/risks/[riskId]/assign-department — set intended_department_id.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AssignRiskDepartmentSchema } from '@/lib/api/schemas/risks'
import {
  RISK_LIST_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)
    const input = await parseJson(req, AssignRiskDepartmentSchema)

    const { data, error } = await supabase
      .from('risks')
      .update({ intended_department_id: input.intended_department_id })
      .eq('id', riskId)
      .is('deleted_at', null)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.assign_department',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { intended_department_id: input.intended_department_id },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'department_assigned',
        user_id: user.id,
        new_value: input.intended_department_id ?? null,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
