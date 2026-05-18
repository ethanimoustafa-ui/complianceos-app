// /api/observations — collection endpoint.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateObservationSchema,
  ListObservationsQuerySchema,
} from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    // parseQuery surfaces invalid filter values as a 400 (ValidationFailed);
    // a raw schema.parse() throws a ZodError that the global error handler
    // would surface as a 500. Match audits/circulars/policies.
    const q = parseQuery(req.nextUrl.searchParams, ListObservationsQuerySchema)

    let query = supabase
      .from('observations')
      .select(OBSERVATION_LIST_COLUMNS, { count: 'exact' })

    if (q.id) query = query.eq('id', q.id)
    if (q.status) query = query.eq('status', q.status)
    if (q.severity) query = query.eq('severity', q.severity)
    if (q.source) query = query.eq('source', q.source)
    if (q.leader_id) query = query.eq('leader_id', q.leader_id)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('title', `%${q.q}%`)

    // department_id is the *department row id*. observations.department is a
    // text label. Resolve dept-id → key/name first if requested.
    if (q.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('key, name_en')
        .eq('id', q.department_id)
        .maybeSingle<{ key: string; name_en: string }>()
      if (!dept) {
        return ok(paginate([], q.page, q.pageSize, 0), {
          cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.observations()] },
        })
      }
      query = query.in('department', [dept.key, dept.name_en])
    }

    // audit_id filter: observations are linked to audits via
    // letter_observations / observation_team currently. There is no
    // direct FK. Filtering by audit_id is a no-op until that link exists.
    // We accept the param without breaking — return all matching rows.
    if (q.audit_id) {
      // intentionally not applied — see note above.
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('due_date', { ascending: true })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.observations()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('observation:create')
    const input = await parseJson(req, CreateObservationSchema)

    const { data, error } = await supabase
      .from('observations')
      .insert({
        title: input.title,
        sub_title: input.sub_title ?? null,
        description: input.description,
        source: input.source,
        severity: input.severity,
        due_date: input.due_date,
        remediation_submission_due: input.remediation_submission_due ?? null,
        department: input.department ?? null,
        reference: input.reference,
        leader_id: input.leader_id ?? null,
        creator_id: user.id,
        framework_ids: input.framework_ids,
      })
      .select(OBSERVATION_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.create',
        entity_type: 'observation',
        entity_id: created.id,
        metadata: { reference: input.reference, severity: input.severity },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: created.id,
        action_type: 'created',
        description: `Observation created: ${input.title}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(created.id)])
    revalidate(cacheTags.compliance())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
