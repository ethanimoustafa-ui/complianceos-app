// POST /api/circulars/[circularId]/workflow/steps/reorder
//
// Body: { items: [{ id, sort_order }, …] }
//
// Applies a new sort_order to each listed step. The list need not cover every
// step on the circular — unlisted steps keep their existing order. Returns
// the full ordered list + the (potentially unchanged) circular progress.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ReorderCircularWorkflowStepsSchema } from '@/lib/api/schemas/circulars'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const input = await parseJson(req, ReorderCircularWorkflowStepsSchema)
    const actor = profile.name ?? profile.email ?? user.id

    // Postgres doesn't expose a transaction primitive through PostgREST; apply
    // updates in sequence (each one is small) and rely on RLS for atomicity
    // failure. If any update errors, we surface it — partial state will be
    // visible until the client retries, but the UI snapshot-restores from the
    // pre-call snapshot so the visible state stays consistent.
    for (const item of input.items) {
      const { error } = await supabase
        .from('circular_workflow_steps')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
        .eq('circular_id', circularId)
      if (error) throw error
    }

    const { data: steps, error: listErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (listErr) throw listErr

    const progress = await recomputeCircularProgress(supabase, circularId).catch(() => null)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow_steps.reorder',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { count: input.items.length },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        'Workflow steps reordered',
        actor,
        'completed',
      ),
    ])

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    return ok({ steps: steps ?? [], progress })
  } catch (e) {
    return handle(e)
  }
}
