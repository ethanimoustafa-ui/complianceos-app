// /api/audits — collection endpoint.
//
//   GET  /api/audits?page&pageSize&status&framework_id&department_id&priority
//   POST /api/audits           body: CreateAuditSchema
//
// RLS handles row-level access; this handler enforces auth + create perm and
// validates input. Mutations write `audit_logs` + `audit_activity_logs` and
// revalidate the `audits:list` tag.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import {
  CreateAuditSchema,
  ListAuditsQuerySchema,
} from '@/lib/api/schemas/audits'
import { AUDIT_LIST_COLUMNS } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListAuditsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))

    let query = supabase
      .from('audits')
      .select(AUDIT_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)

    if (q.status) query = query.eq('status', q.status)
    if (q.priority) query = query.eq('priority', q.priority)
    if (q.type) query = query.eq('type', q.type)
    if (q.assignee_id) query = query.eq('assignee_id', q.assignee_id)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('title', `%${q.q}%`)
    // department_id is not on `audits` directly in current schema; the join via
    // `profiles.department_id = audits.assignee_id` is the intended path. Until
    // a stored department column or view exists, this filter resolves through
    // the assignee. Stage B may add a denormalized `department_id` column.
    if (q.department_id) {
      const { data: members } = await supabase
        .from('profiles')
        .select('id')
        .eq('department_id', q.department_id)
      const ids = (members ?? []).map((r) => (r as { id: string }).id)
      if (ids.length === 0) {
        return ok(paginate([], q.page, q.pageSize, 0), {
          cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.audits()] },
        })
      }
      query = query.in('assignee_id', ids)
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('due_date', { ascending: true })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.audits()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('audit:create')
    const input = await parseJson(req, CreateAuditSchema)

    const { data, error } = await supabase
      .from('audits')
      .insert({
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        framework_ids: input.framework_ids,
        category: input.category ?? null,
        priority: input.priority,
        due_date: input.due_date,
        assignee_id: input.assignee_id ?? null,
        frequency: input.frequency ?? null,
        review_schedule: input.review_schedule ?? null,
      })
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.create',
        entity_type: 'audit',
        entity_id: created.id,
        metadata: { title: input.title, type: input.type },
        supabase,
      }),
      writeAuditActivity({
        audit_id: created.id,
        action: 'created',
        description: `Audit created: ${input.title}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        supabase,
      }),
    ])

    revalidate(cacheTags.audits())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
