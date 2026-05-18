// PATCH  /api/circulars/[circularId]/workflow/steps/[stepId]
//   Editable: label, label_ar, phase, action_label, action_label_ar,
//             action_type, requires_notes, status, assigned_to, notes,
//             sort_order, deadline.
//   When `status` transitions to 'current' the route emits an assignee
//   notification (skipping self-notifications).
//
// DELETE /api/circulars/[circularId]/workflow/steps/[stepId]
//   Removes a step row. If the removed step was 'current', the next pending
//   step by sort_order is promoted to 'current'.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCircularWorkflowStepSchema } from '@/lib/api/schemas/circulars'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  assertCircularWorkflowStepExists,
  getCircularHeader,
  insertCircularTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
import { notifyCircularStepAssignee } from '@/lib/api/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string; stepId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId, stepId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const prev = await assertCircularWorkflowStepExists(supabase, circularId, stepId)
    const input = await parseJson(req, UpdateCircularWorkflowStepSchema)
    const actor = profile.name ?? profile.email ?? user.id

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) update[k] = v
    }
    if (Object.keys(update).length === 0) {
      return ok(prev)
    }

    const { data, error } = await supabase
      .from('circular_workflow_steps')
      .update(update)
      .eq('id', stepId)
      .eq('circular_id', circularId)
      .select(WORKFLOW_STEP_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    const after = data as typeof prev

    const isRename = input.label !== undefined && input.label !== prev.label
    const becameCurrent = after.status === 'current' && prev.status !== 'current'

    const timelineTitle = isRename
      ? `Step renamed: "${prev.label}" → "${after.label}"`
      : becameCurrent
      ? `Step activated: ${after.label}`
      : `Step updated: ${after.label}`

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: isRename
          ? 'circular.workflow_step.rename'
          : 'circular.workflow_step.update',
        entity_type: 'circular_workflow_step',
        entity_id: stepId,
        metadata: {
          circular_id: circularId,
          fields: Object.keys(update),
          previous_label: prev.label,
        },
        supabase,
      }),
      insertCircularTimeline(supabase, circularId, timelineTitle, actor, 'completed'),
      recomputeCircularProgress(supabase, circularId).catch(() => undefined),
    ])

    if (becameCurrent) {
      const header = await getCircularHeader(supabase, circularId)
      if (header) {
        await notifyCircularStepAssignee(supabase, {
          circular: header,
          step: {
            id: after.id,
            label: after.label,
            label_ar: after.label_ar,
            notes: after.notes,
            assigned_to: after.assigned_to,
          },
          actor: { id: user.id, name: actor },
        })
      }
    }

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { circularId, stepId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const prev = await assertCircularWorkflowStepExists(supabase, circularId, stepId)
    const actor = profile.name ?? profile.email ?? user.id

    const { error: delErr } = await supabase
      .from('circular_workflow_steps')
      .delete()
      .eq('id', stepId)
      .eq('circular_id', circularId)
    if (delErr) throw delErr

    // If the removed step was 'current', promote the next pending step
    // (lowest sort_order > prev.sort_order, falling back to lowest pending).
    if (prev.status === 'current') {
      const { data: next, error: nextErr } = await supabase
        .from('circular_workflow_steps')
        .select('id, sort_order, label, label_ar, assigned_to, notes')
        .eq('circular_id', circularId)
        .eq('status', 'pending')
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle<{
          id: string
          sort_order: number
          label: string
          label_ar: string | null
          assigned_to: string | null
          notes: string | null
        }>()
      if (nextErr) throw nextErr
      if (next) {
        const { error: upErr } = await supabase
          .from('circular_workflow_steps')
          .update({ status: 'current' })
          .eq('id', next.id)
        if (upErr) throw upErr
        const header = await getCircularHeader(supabase, circularId)
        if (header) {
          await notifyCircularStepAssignee(supabase, {
            circular: header,
            step: {
              id: next.id,
              label: next.label,
              label_ar: next.label_ar,
              notes: next.notes,
              assigned_to: next.assigned_to,
            },
            actor: { id: user.id, name: actor },
          })
        }
      }
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow_step.delete',
        entity_type: 'circular_workflow_step',
        entity_id: stepId,
        metadata: { circular_id: circularId, label: prev.label },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Workflow step "${prev.label}" removed`,
        actor,
        'completed',
      ),
      recomputeCircularProgress(supabase, circularId).catch(() => undefined),
    ])

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    return ok({ id: stepId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
