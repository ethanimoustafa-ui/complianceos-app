// POST /api/risks/[riskId]/set-deadline — set mitigation_deadline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { SetRiskDeadlineSchema } from '@/lib/api/schemas/risks'
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
    const input = await parseJson(req, SetRiskDeadlineSchema)

    const { data, error } = await supabase
      .from('risks')
      .update({ mitigation_deadline: input.mitigation_deadline })
      .eq('id', riskId)
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.set_deadline',
        entity_type: 'risk',
        entity_id: riskId,
        metadata: { mitigation_deadline: input.mitigation_deadline },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'deadline_set',
        user_id: user.id,
        new_value: input.mitigation_deadline ?? null,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
