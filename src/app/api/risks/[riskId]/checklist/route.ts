// /api/risks/[riskId]/checklist — list / add risk mitigation checklist items.
//
// Mirror of the observation-checklist route family. Items live in the
// `risk_mitigation_checklist` table (see migration 009_risks.sql). The table
// has no `deadline` column at the moment; the schema accepts `deadline` for
// forward compatibility but the route drops it silently.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateRiskChecklistItemSchema } from '@/lib/api/schemas/risks'
import {
  RISK_CHECKLIST_COLUMNS,
  assertRiskExists,
  writeRiskHistory,
} from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase } = await requireUser()
    await assertRiskExists(supabase, riskId)

    const { data, error } = await supabase
      .from('risk_mitigation_checklist')
      .select(RISK_CHECKLIST_COLUMNS)
      .eq('risk_id', riskId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.risks(riskId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertRiskExists(supabase, riskId)
    const input = await parseJson(req, CreateRiskChecklistItemSchema)

    // If sort_order is not supplied, append after current max.
    let sortOrder = input.sort_order
    if (sortOrder === undefined) {
      const { data: tail } = await supabase
        .from('risk_mitigation_checklist')
        .select('sort_order')
        .eq('risk_id', riskId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle<{ sort_order: number }>()
      sortOrder = (tail?.sort_order ?? -1) + 1
    }

    const { data, error } = await supabase
      .from('risk_mitigation_checklist')
      .insert({
        risk_id: riskId,
        text: input.text,
        completed: false,
        sort_order: sortOrder,
      })
      .select(RISK_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.checklist.create',
        entity_type: 'risk_mitigation_checklist',
        entity_id: created.id,
        metadata: { risk_id: riskId },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: riskId,
        action: 'checklist_added',
        user_id: user.id,
        new_value: input.text,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(riskId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
