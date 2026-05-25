// /api/audits — collection endpoint.
//
//   GET  /api/audits?page&pageSize&status&framework_id&department_id&priority
//   POST /api/audits  body: CreateAuditSchema
//
// W26-A pattern stack:
//   §2.2  cache: 'no-store' on GET
//   §2.13 no assertUuid on collection (no dynamic segment)
//   §2.11 dual-store activity log via insertAuditTimeline
//   §2.3  CreateAuditSchema is strict + HTML-stripped + open-string enums

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, ValidationFailed } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateAuditSchema,
  ListAuditsQuerySchema,
} from '@/lib/api/schemas/audits'
import { AUDIT_LIST_COLUMNS, insertAuditTimeline } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const parsed = ListAuditsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    if (!parsed.success) {
      throw ValidationFailed(parsed.error.issues, 'Invalid query parameters')
    }
    const q = parsed.data

    let query = supabase
      .from('audits')
      .select(AUDIT_LIST_COLUMNS, { count: 'exact' })

    if (q.status) query = query.eq('status', q.status)
    if (q.priority) query = query.eq('priority', q.priority)
    if (q.type) query = query.eq('type', q.type)
    if (q.assignee_id) query = query.eq('assignee_id', q.assignee_id)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('title', `%${q.q}%`)
    if (q.department_id) {
      const { data: members } = await supabase
        .from('profiles')
        .select('id')
        .eq('department_id', q.department_id)
      const ids = (members ?? []).map((r) => (r as { id: string }).id)
      if (ids.length === 0) {
        // W26-A §2.2: no-store on GET.
        return ok(paginate([], q.page, q.pageSize, 0), {
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      query = query.in('assignee_id', ids)
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('due_date', { ascending: true })
      .range(from, to)
    if (error) throw error

    // W26-A §2.2: cache: 'no-store' — entity reads must never use sMaxAge.
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('audit:create')
    // W26-A: CreateAuditSchema is now strict + HTML-stripped + open-string enums.
    const input = await parseJson(req, CreateAuditSchema)

    const { data, error } = await supabase
      .from('audits')
      .insert({
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        framework_ids: input.framework_ids ?? [],
        category: input.category ?? null,
        priority: input.priority ?? 'medium',
        due_date: input.due_date,
        assignee_id: input.assignee_id ?? null,
        frequency: input.frequency ?? null,
        review_schedule: input.review_schedule ?? null,
      })
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string; title: string }
    const actorName = profile.name ?? profile.email ?? user.id

    // Fire-and-forget: dual-store activity log + compliance audit log.
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.create',
        entity_type: 'audit',
        entity_id: created.id,
        metadata: { title: input.title, type: input.type },
        supabase,
      }),
      insertAuditTimeline({
        auditId: created.id,
        action: 'created',
        i18nKey: 'auditDetail.activityCreatedAudit',
        params: { title: created.title },
        userId: user.id,
        userName: actorName,
        supabase,
      }),
    ])

    revalidate(cacheTags.audits())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
