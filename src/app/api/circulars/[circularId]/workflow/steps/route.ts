// GET  /api/circulars/[circularId]/workflow/steps  — list ordered steps
// POST /api/circulars/[circularId]/workflow/steps  — add a custom step
//
// Step-level CRUD endpoints; complements the existing `/workflow/advance` and
// `/workflow/set-phase-deadline` routes.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateCircularWorkflowStepSchema } from '@/lib/api/schemas/circulars'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
  maxCircularWorkflowStepSortOrder,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const { data, error } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const input = await parseJson(req, CreateCircularWorkflowStepSchema)
    const actor = profile.name ?? profile.email ?? user.id

    // GAP-12: ALWAYS compute sort_order server-side. The client sends a
    // stale/optimistic `input.sort_order` (e.g. 10) which would collide with an
    // existing step — ignore it. `maxCircularWorkflowStepSortOrder` is a
    // circular-wide MAX; max+1 keeps the global ordering unique (Story 11.4).
    const sortOrder = (await maxCircularWorkflowStepSortOrder(supabase, circularId)) + 1

    const { data, error } = await supabase
      .from('circular_workflow_steps')
      .insert({
        circular_id: circularId,
        phase: input.phase,
        label: input.label,
        label_ar: input.label_ar ?? input.label,
        status: 'pending',
        action_label: input.action_label,
        action_label_ar: input.action_label_ar,
        action_type: input.action_type,
        requires_notes: input.requires_notes,
        assigned_to: input.assigned_to ?? null,
        notes: input.notes ?? null,
        deadline: input.deadline ?? null,
        sort_order: sortOrder,
      })
      .select(WORKFLOW_STEP_COLUMNS)
      .single()
    if (error || !data) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow_step.create',
        entity_type: 'circular_workflow_step',
        entity_id: (data as { id: string }).id,
        metadata: { circular_id: circularId, label: input.label, phase: input.phase },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        renderBilingual('regulatoryUpdates.timeline.workflowStepAdded', {
          label: input.label,
        }),
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
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
