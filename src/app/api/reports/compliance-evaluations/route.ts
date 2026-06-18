// /api/reports/compliance-evaluations — list / create officer evaluations.
//
// Each evaluation row keys on (kind, item_id, department_id). The row id is
// constructed as `${kind}:${itemId}::${departmentId}` (matches the legacy
// store key shape).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateEvaluationSchema,
  ListEvaluationsQuerySchema,
} from '@/lib/api/schemas/reports'
import { EVALUATION_COLUMNS, evaluationId } from '@/lib/api/services/reports'
import { invalidateScoreCache } from '@/lib/api/services/compliance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListEvaluationsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('compliance_evaluations')
      .select(EVALUATION_COLUMNS, { count: 'exact' })
    if (q.kind) query = query.eq('kind', q.kind)
    if (q.item_id) query = query.eq('item_id', q.item_id)
    if (q.department_id) query = query.eq('department_id', q.department_id)
    if (q.verdict) query = query.eq('verdict', q.verdict)
    if (q.evaluator_id) query = query.eq('evaluated_by', q.evaluator_id)
    if (q.date_from) query = query.gte('evaluated_at', q.date_from)
    if (q.date_to) query = query.lte('evaluated_at', q.date_to)

    // framework_id filter: resolve via the underlying item.
    if (q.framework_id) {
      const [{ data: circs }, { data: pols }] = await Promise.all([
        supabase.from('circulars').select('id').eq('framework', q.framework_id),
        supabase.from('policies').select('id').eq('framework', q.framework_id),
      ])
      const ids = [
        ...((circs ?? []) as { id: string }[]).map((r) => r.id),
        ...((pols ?? []) as { id: string }[]).map((r) => r.id),
      ]
      if (ids.length === 0) {
        return ok(paginate([], q.page, q.pageSize, 0), { cache: 'no-store' })
      }
      query = query.in('item_id', ids)
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('evaluated_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('report:create')
    const input = await parseJson(req, CreateEvaluationSchema)

    const row = {
      id: evaluationId(input.kind, input.item_id, input.department_id),
      kind: input.kind,
      item_id: input.item_id,
      department_id: input.department_id,
      verdict: input.verdict,
      notes: input.notes ?? null,
      evaluated_by: user.id,
      evaluated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('compliance_evaluations')
      .upsert(row, { onConflict: 'id' })
      .select(EVALUATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Upsert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_evaluation.upsert',
      entity_type: 'compliance_evaluation',
      entity_id: row.id,
      metadata: { kind: input.kind, verdict: input.verdict },
      supabase,
    })

    revalidateAll([
      cacheTags.evaluations(),
      cacheTags.evaluations(row.id),
      cacheTags.evaluationScores(),
      cacheTags.compliance(),
    ])
    // Evict the dashboard-health DB cache so the hero's business-compliance
    // score recomputes on next load. revalidateAll only busts the route cache,
    // not the compliance_scores_cache rows (the real staleness source).
    await invalidateScoreCache(supabase)
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
