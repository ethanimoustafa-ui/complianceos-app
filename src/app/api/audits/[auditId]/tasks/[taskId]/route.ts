// /api/audits/[auditId]/tasks/[taskId] — task item endpoint (PATCH/DELETE).
// W26-A: assertUuid on both params + dual-store timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuditTaskSchema } from '@/lib/api/schemas/audits'
import { assertAuditExists, insertAuditTimeline } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TASK_COLUMNS =
  'id, audit_id, title, description, assignee_id, status, priority, due_date, completed, completed_at, severity, framework_ids, created_at, updated_at'

type Params = { params: Promise<{ auditId: string; taskId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId, taskId } = await params
    // SEC-5: validate both route params.
    assertUuid(auditId, taskId)
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

    const task = data as { title: string }
    const actorName = profile.name ?? profile.email ?? user.id
    const i18nKey = update.completed === true
      ? 'auditDetail.activityCompletedTask'
      : update.completed === false
        ? 'auditDetail.activityReopenedTask'
        : 'auditDetail.activityUpdatedTask'

    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.task.update',
        entity_type: 'audit_task',
        entity_id: taskId,
        metadata: { audit_id: auditId, fields: Object.keys(update) },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'task.updated',
        i18nKey,
        params: { title: task.title },
        userId: user.id,
        userName: actorName,
        metadata: { task_id: taskId, fields: Object.keys(update) },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId), cacheTags.auditTasks(auditId)])
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
    // SEC-5: validate both route params.
    assertUuid(auditId, taskId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    // Fetch title before tombstone for the activity log.
    const { data: taskRow } = await supabase
      .from('audit_tasks')
      .select('title')
      .eq('id', taskId)
      .eq('audit_id', auditId)
      .maybeSingle<{ title: string }>()

    const { error } = await supabase
      .from('audit_tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('audit_id', auditId)
      .is('deleted_at', null)
    if (error) throw error

    const actorName = profile.name ?? profile.email ?? user.id
    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.task.delete',
        entity_type: 'audit_task',
        entity_id: taskId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'task.deleted',
        i18nKey: 'auditDetail.activityDeletedTask',
        params: { title: taskRow?.title ?? taskId },
        userId: user.id,
        userName: actorName,
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId), cacheTags.auditTasks(auditId)])
    return ok({ id: taskId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
