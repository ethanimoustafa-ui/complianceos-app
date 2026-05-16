// /api/audits/[auditId]/tasks/[taskId] — task item endpoint (PATCH/DELETE).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit, writeAuditActivity } from '@/lib/api/audit'
import { UpdateAuditTaskSchema } from '@/lib/api/schemas/audits'
import { assertAuditExists } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TASK_COLUMNS =
  'id, audit_id, title, description, assignee_id, status, priority, due_date, completed, completed_at, severity, framework_ids, created_at, updated_at'

type Params = { params: Promise<{ auditId: string; taskId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId, taskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const patch = await parseJson(req, UpdateAuditTaskSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (update.completed === true && !update.completed_at) {
      update.completed_at = new Date().toISOString()
      update.status ??= 'completed'
    }

    const { data, error } = await supabase
      .from('audit_tasks')
      .update(update)
      .eq('id', taskId)
      .eq('audit_id', auditId)
      .is('deleted_at', null)
      .select(TASK_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Task ${taskId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.task.update',
        entity_type: 'audit_task',
        entity_id: taskId,
        metadata: { audit_id: auditId, fields: Object.keys(update) },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'task.updated',
        description: `Task ${taskId} updated`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        metadata: { task_id: taskId, fields: Object.keys(update) },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(auditId), cacheTags.auditTasks(auditId)])
    if (update.completed !== undefined || update.status !== undefined) {
      revalidate(cacheTags.compliance())
    }
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId, taskId } = await params
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    const { error } = await supabase
      .from('audit_tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('audit_id', auditId)
      .is('deleted_at', null)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'audit.task.delete',
        entity_type: 'audit_task',
        entity_id: taskId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      writeAuditActivity({
        audit_id: auditId,
        action: 'task.deleted',
        description: `Task ${taskId} deleted`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(auditId), cacheTags.auditTasks(auditId)])
    return ok({ id: taskId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
