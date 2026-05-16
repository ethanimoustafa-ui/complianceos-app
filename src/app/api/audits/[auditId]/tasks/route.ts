// /api/audits/[auditId]/tasks — collection of tasks for an audit.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { CreateAuditTaskSchema } from '@/lib/api/schemas/audits'
import { assertAuditExists } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TASK_COLUMNS =
  'id, audit_id, title, description, assignee_id, status, priority, due_date, completed, completed_at, severity, framework_ids, created_at, updated_at'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase } = await requireUser()
    await assertAuditExists(supabase, auditId)

    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)
    const [from, to] = rangeFor(page, pageSize)

    const { data, error, count } = await supabase
      .from('audit_tasks')
      .select(TASK_COLUMNS, { count: 'exact' })
      .eq('audit_id', auditId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: { sMaxAge: 60, tags: [cacheTags.auditTasks(auditId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, CreateAuditTaskSchema)

    const { data, error } = await supabase
      .from('audit_tasks')
      .insert({
        audit_id: auditId,
        title: input.title,
        description: input.description ?? null,
        assignee_id: input.assignee_id ?? null,
        priority: input.priority,
        due_date: input.due_date ?? null,
        severity: input.severity ?? null,
        framework_ids: input.framework_ids,
      })
      .select(TASK_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.task.create',
        entity_type: 'audit_task',
        entity_id: created.id,
        metadata: { audit_id: auditId, title: input.title },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'task.created',
        description: `Task added: ${input.title}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        supabase,
      }),
    ])

    revalidateAll([
      cacheTags.audits(auditId),
      cacheTags.auditTasks(auditId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
