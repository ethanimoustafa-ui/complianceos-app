// POST /api/reports/compliance-evaluations/bulk
// Body: { evaluations: [...] }   batch upsert.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { BulkEvaluationsSchema } from '@/lib/api/schemas/reports'
import { EVALUATION_COLUMNS, evaluationId } from '@/lib/api/services/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('report:create')
    const input = await parseJson(req, BulkEvaluationsSchema)

    const now = new Date().toISOString()
    const rows = input.evaluations.map((e) => ({
      id: evaluationId(e.kind, e.item_id, e.department_id),
      kind: e.kind,
      item_id: e.item_id,
      department_id: e.department_id,
      verdict: e.verdict,
      notes: e.notes ?? null,
      evaluated_by: user.id,
      evaluated_at: now,
    }))

    const { data, error } = await supabase
      .from('compliance_evaluations')
      .upsert(rows, { onConflict: 'id' })
      .select(EVALUATION_COLUMNS)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_evaluation.bulk_upsert',
      entity_type: 'compliance_evaluation',
      metadata: { count: rows.length },
      supabase,
    })

    revalidateAll([
      cacheTags.evaluations(),
      cacheTags.evaluationScores(),
      cacheTags.compliance(),
    ])
    return ok({ items: data ?? [], upserted: rows.length }, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
