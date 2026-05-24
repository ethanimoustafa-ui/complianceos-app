// POST /api/circulars/[circularId]/workflow/reset
//
// Wave-19.6 — resets every workflow step back to 'pending'. Only allowed when
// 100% of steps are currently 'completed' (else 409 `workflow_not_complete`).
// The `set_completed_at` trigger (migration 062) auto-clears `completed_at`
// on the status revert.
//
// Concurrency: W17.2 atomic-on-client-token guard against the parent
// circular's `updated_at` via `If-Match`. 412 on stale.
//
// Side effects:
//   1. ONE dual-store `circular_timeline` row via `renderBilingual` —
//      `regulatoryUpdates.timeline.workflowReset`.
//   2. ONE `circular_versions` row — same body, no field-level diff (this is
//      a workflow-wide event, not a single-field change).
//   3. `recomputeCircularProgress` so the progress bar drops to 0%.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
  insertCircularVersion,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const actor = profile.name ?? profile.email ?? user.id

    // SEC-1 (W17.2): atomic-on-client-token guard via parent `updated_at`.
    const ifMatch = readIfMatch(req)
    const { data: parentBefore, error: parentErr } = await supabase
      .from('circulars')
      .select('updated_at')
      .eq('id', circularId)
      .is('deleted_at', null)
      .maybeSingle<{ updated_at: string }>()
    if (parentErr) throw parentErr
    if (!parentBefore) throw NotFound(`Circular ${circularId} not found`)
    assertNotStale(ifMatch, parentBefore.updated_at)

    // Verify ALL steps are currently 'completed'.
    const { data: allSteps, error: sErr } = await supabase
      .from('circular_workflow_steps')
      .select('id, status')
      .eq('circular_id', circularId)
    if (sErr) throw sErr
    const steps = allSteps ?? []
    if (steps.length === 0 || steps.some((s) => s.status !== 'completed')) {
      throw Conflict('workflow_not_complete')
    }

    // SEC-1 (W17.2 corrected): atomic parent bump scoped to the client's
    // token. If the token matches we win the race; else 0 rows match → 412.
    // Mirrors the PATCH-on-circulars pattern. (The previous implementation
    // re-applied `.eq('circular_id', circularId)` on the step update — a no-op
    // that didn't actually guard against a concurrent parent write.)
    if (ifMatch != null) {
      const { data: parentAfter, error: bumpErr } = await supabase
        .from('circulars')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', circularId)
        .eq('updated_at', ifMatch)
        .is('deleted_at', null)
        .select('updated_at')
        .maybeSingle<{ updated_at: string }>()
      if (bumpErr) throw bumpErr
      if (!parentAfter) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
    } else {
      const { error: bumpErr } = await supabase
        .from('circulars')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', circularId)
        .is('deleted_at', null)
      if (bumpErr) throw bumpErr
    }

    // Bulk-revert. Trigger clears every `completed_at`.
    const { error: uErr } = await supabase
      .from('circular_workflow_steps')
      .update({ status: 'pending', date: null, user_name: null })
      .eq('circular_id', circularId)
    if (uErr) throw uErr

    // Return the fresh ordered workflow so the client can reconcile.
    const { data: refreshed, error: rErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (rErr) throw rErr

    const body = renderBilingual('regulatoryUpdates.timeline.workflowReset')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow.reset',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { step_count: steps.length },
        supabase,
      }),
      insertCircularTimeline(supabase, circularId, body, actor, 'completed'),
      insertCircularVersion(supabase, circularId, body, actor, []),
      recomputeCircularProgress(supabase, circularId).catch(() => undefined),
    ])

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    revalidate(cacheTags.compliance())
    return ok({ items: refreshed ?? [] })
  } catch (e) {
    return handle(e)
  }
}
