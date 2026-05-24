// POST /api/circulars/[circularId]/workflow/undo
//
// Wave-19.6 (corrected) — dual-flip cursor model.
//
// One click of Undo walks the workflow cursor backwards by exactly one step:
//   • the most-recently-completed step is promoted back to 'current' (the new
//     active step), and
//   • the previously-current step is demoted back to 'pending'.
//
// `circular_workflow_steps.status` already carries `'current'` as a value
// (alongside `'completed'` / `'pending'`); there is no separate pointer column
// on `circulars`. Highlight in the UI is purely derived from
// `step.status === 'current'`, so the dual flip is what makes the cursor
// move on screen.
//
// Edge cases:
//   • No completed steps → 409 `no_completed_steps_to_undo`.
//   • No currently-current step (e.g. workflow already at terminal state) →
//     skip the demotion silently; just promote the completed step.
//
// Concurrency: W17.2 (corrected) — atomic UPDATE on the parent
// `circulars.updated_at` scoped to `.eq('updated_at', ifMatch)`. The original
// W19.6 implementation re-applied `.eq('circular_id', circularId)` (a no-op);
// that lost the parent-token race. We now bump the parent's `updated_at` in
// a single conditional UPDATE — if 0 rows match → 412 — then proceed with the
// step flips. Mirrors the parent-PATCH pattern in
// `src/app/api/circulars/[circularId]/route.ts`.
//
// Side effects (Wave-19.6 spec):
//   1. Write a dual-store `circular_timeline` row via `renderBilingual` —
//      `regulatoryUpdates.timeline.workflowCursorMovedBack` with `{ from, to }`
//      so the activity log names BOTH affected steps.
//   2. Append a `circular_versions` row — same dual-store body, with TWO
//      structured `field_changes` entries (one per flipped step), each
//      tagged with the step label so the UI can disambiguate.
//   3. `recomputeCircularProgress` so the progress bar reflects the change.

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

type StepShape = {
  id: string
  label: string
  label_ar: string | null
  status: string
  updated_at: string
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const actor = profile.name ?? profile.email ?? user.id

    // SEC-1 (W17.2): read-then-check pre-flight so we can return 412 BEFORE
    // touching any step row. The atomic UPDATE below makes the guarantee.
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

    // Find the most-recently completed step (migration 062 partial index on
    // `(circular_id, completed_at DESC) WHERE status='completed'`).
    const { data: target, error: tErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS + ', completed_at')
      .eq('circular_id', circularId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle<StepShape & { completed_at: string | null }>()
    if (tErr) throw tErr
    if (!target) throw Conflict('no_completed_steps_to_undo')

    // Find the currently-current step (the one whose highlight we will move).
    // Zero rows is an edge case (workflow already at a terminal state with
    // nothing active) — proceed with just the promotion.
    const { data: active, error: aErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .eq('status', 'current')
      .limit(1)
      .maybeSingle<StepShape>()
    if (aErr) throw aErr

    // SEC-1 (W17.2): atomic parent bump scoped to the client's token. If the
    // token matches we win the race and `updated_at` is bumped to NOW(); else
    // 0 rows match → 412. Mirrors the PATCH-on-circulars pattern.
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
      // No `If-Match` header — still bump `updated_at` so subsequent reads
      // observe the cursor change.
      const { error: bumpErr } = await supabase
        .from('circulars')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', circularId)
        .is('deleted_at', null)
      if (bumpErr) throw bumpErr
    }

    // Order matters — demote the active step FIRST so the intermediate state
    // never has two rows with `status='current'` for the same circular. (No
    // uniqueness constraint enforces this today but the order is the safer
    // contract for future tightening.)
    if (active && active.id !== target.id) {
      const { error: dErr } = await supabase
        .from('circular_workflow_steps')
        .update({ status: 'pending', date: null, user_name: null })
        .eq('id', active.id)
        .eq('circular_id', circularId)
      if (dErr) throw dErr
    }

    // Promote the most-recently-completed step → 'current'. The
    // `set_completed_at` trigger auto-clears `completed_at` when status moves
    // away from 'completed'. Clear `date`/`user_name` alongside so the step
    // looks freshly active.
    const { data: promoted, error: pErr } = await supabase
      .from('circular_workflow_steps')
      .update({ status: 'current', date: null, user_name: null })
      .eq('id', target.id)
      .eq('circular_id', circularId)
      .select(WORKFLOW_STEP_COLUMNS)
      .single<StepShape>()
    if (pErr) throw pErr
    if (!promoted) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const targetLabel = { en: target.label, ar: target.label_ar ?? target.label }
    const activeLabel = active
      ? { en: active.label, ar: active.label_ar ?? active.label }
      : null

    // Activity body — name BOTH steps when there was a demotion; fall back to
    // the simpler "undone" message when there was no active step to demote.
    const body = activeLabel
      ? renderBilingual('regulatoryUpdates.timeline.workflowCursorMovedBack', {
          from: activeLabel,
          to: targetLabel,
        })
      : renderBilingual('regulatoryUpdates.timeline.workflowStepUndone', {
          step: targetLabel,
        })

    // Per-step diff entries for the Version History tab. We tag each entry
    // with the affected step's label so the UI can disambiguate when two
    // status flips land in a single revision.
    const fieldChanges: { field: string; from: string; to: string }[] = [
      {
        field: `regulatoryUpdates.timelineField.status — ${target.label}`,
        from: 'completed',
        to: 'current',
      },
    ]
    if (active && active.id !== target.id) {
      fieldChanges.push({
        field: `regulatoryUpdates.timelineField.status — ${active.label}`,
        from: 'current',
        to: 'pending',
      })
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'circular.workflow.undo',
        entity_type: 'circular_workflow_step',
        entity_id: target.id,
        metadata: {
          circular_id: circularId,
          promoted_step_id: target.id,
          promoted_step_label: target.label,
          demoted_step_id: active?.id ?? null,
          demoted_step_label: active?.label ?? null,
        },
        supabase,
      }),
      insertCircularTimeline(supabase, circularId, body, actor, 'completed'),
      insertCircularVersion(supabase, circularId, body, actor, fieldChanges),
      recomputeCircularProgress(supabase, circularId).catch(() => undefined),
    ])

    revalidateAll([
      cacheTags.circulars(),
      cacheTags.circulars(circularId),
      cacheTags.circularWorkflowSteps(circularId),
    ])
    revalidate(cacheTags.compliance())
    // Return the refreshed workflow array so the client can reconcile both
    // flipped rows at once (mirror the reset route).
    const { data: refreshed, error: rErr } = await supabase
      .from('circular_workflow_steps')
      .select(WORKFLOW_STEP_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (rErr) throw rErr
    return ok({
      items: refreshed ?? [],
      promoted: promoted,
      demoted_id: active?.id ?? null,
    })
  } catch (e) {
    return handle(e)
  }
}
