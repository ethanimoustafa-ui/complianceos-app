// /api/risks — collection endpoint.
//
// Permission gating: there are no `risk:*` keys in the seeded RBAC matrix
// (migration 018). Per BACKEND-API-MAP §4.6 we gate on `audit:*` keys, which
// the matrix grants to compliance_officer and org_admin.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateRiskSchema, ListRisksQuerySchema } from '@/lib/api/schemas/risks'
import { RISK_LIST_COLUMNS, writeRiskHistory } from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    // parseQuery surfaces invalid filter values as a 400 (ValidationFailed);
    // a raw schema.parse() throws a ZodError that the global error handler
    // would surface as a 500. Match audits/circulars/policies/observations.
    const q = parseQuery(req.nextUrl.searchParams, ListRisksQuerySchema)

    let query = supabase
      .from('risks')
      .select(RISK_LIST_COLUMNS, { count: 'exact' })

    if (q.id) query = query.eq('id', q.id)
    if (q.status) query = query.eq('status', q.status)
    if (q.category) query = query.eq('category', q.category)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.intended_department_id)
      query = query.eq('intended_department_id', q.intended_department_id)
    if (q.department_id) query = query.eq('intended_department_id', q.department_id)
    if (q.mitigation_workflow_status)
      query = query.eq('mitigation_workflow_status', q.mitigation_workflow_status)
    if (q.owner_id) query = query.eq('owner_id', q.owner_id)
    if (q.q) query = query.ilike('title', `%${q.q}%`)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('risk_score', { ascending: false })
      .range(from, to)
    if (error) throw error

    // W26-A §2.2 / FORENSIC §4: entity reads must be no-store. The previous
    // 60s sMaxAge + stale-while-revalidate let the BROWSER serve a stale list
    // after workflow writes (assign/send/deadline) and across hard refreshes.
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('audit:edit')
    const input = await parseJson(req, CreateRiskSchema)

    const { data, error } = await supabase
      .from('risks')
      .insert({
        title: input.title,
        description: input.description,
        category: input.category,
        likelihood: input.likelihood,
        impact: input.impact,
        owner_id: input.owner_id ?? null,
        mitigation_plan: input.mitigation_plan ?? null,
        monitoring_frequency: input.monitoring_frequency,
        last_review_date: input.last_review_date ?? null,
        next_review_date: input.next_review_date ?? null,
        review_schedule: input.review_schedule ?? null,
        intended_department_id: input.intended_department_id ?? null,
        mitigation_deadline: input.mitigation_deadline ?? null,
        framework_ids: input.framework_ids,
      })
      .select(RISK_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'risk.create',
        entity_type: 'risk',
        entity_id: created.id,
        metadata: { title: input.title, category: input.category },
        supabase,
      }),
      writeRiskHistory({
        supabase,
        risk_id: created.id,
        action: 'created',
        user_id: user.id,
        notes: `Risk created: ${input.title}`,
      }),
    ])

    revalidateAll([cacheTags.risks(), cacheTags.risks(created.id)])
    revalidate(cacheTags.compliance())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
