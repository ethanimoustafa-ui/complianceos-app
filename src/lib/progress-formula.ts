// Single shared source of truth for a circular's progress percentage.
//
// FORENSIC §5 / §3-C: the GAP-16 dynamic 50/50 progress formula was
// hand-duplicated in the client store (`recalcProgress` in
// `src/stores/circular-store.ts`) and the server service
// (`recomputeCircularProgress` in `src/lib/api/services/circulars.ts`) and
// drifted repeatedly across Waves 5/6/9/12. Both layers now import this one
// pure function so the formula physically cannot diverge again.
//
// GAP-16 — DYNAMIC 50/50 WEIGHTING.
//
//   Workflow half + checklist half, total 100%.
//   - both halves have units : stepWeight = 50/stepsTotal, itemWeight = 50/checklistTotal
//   - only workflow has units: stepWeight = 100/stepsTotal, itemWeight = 0
//   - only checklist has units: itemWeight = 100/checklistTotal, stepWeight = 0
//   - neither                : progress = 0
//   progress = round(stepsDone*stepWeight + checklistDone*itemWeight), clamped 0..100
//
// This REPLACES the old sticky-monotonic `max(stored, blend)` clamp — progress
// is the freshly-computed value and MAY shrink when empty units (a new article
// / checklist item) are added.
//
// Documented invariant (FORENSIC + STATCARD-DEFINITIONS): 5/13 steps + 0/3
// checklist → 19.

/** Counts that drive a circular's progress percentage. */
export interface CircularProgressInput {
  /** Total workflow steps on the circular. */
  stepsTotal: number
  /** Workflow steps with status `completed`. */
  stepsDone: number
  /** Checklist items across ALL the circular's articles. */
  checklistTotal: number
  /** Completed checklist items across ALL the circular's articles. */
  checklistDone: number
}

/**
 * Compute a circular's progress percentage (0–100) from its workflow-step and
 * checklist-item counts, using the GAP-16 dynamic 50/50 weighting.
 *
 * Pure — no I/O, no side effects. Imported by BOTH the client store's
 * `recalcProgress` and the server service's `recomputeCircularProgress`.
 */
export function computeCircularProgress({
  stepsTotal,
  stepsDone,
  checklistTotal,
  checklistDone,
}: CircularProgressInput): number {
  let stepWeight = 0
  let itemWeight = 0
  if (stepsTotal > 0 && checklistTotal > 0) {
    stepWeight = 50 / stepsTotal
    itemWeight = 50 / checklistTotal
  } else if (stepsTotal > 0) {
    stepWeight = 100 / stepsTotal
  } else if (checklistTotal > 0) {
    itemWeight = 100 / checklistTotal
  } else {
    return 0
  }

  const progress = Math.round(stepsDone * stepWeight + checklistDone * itemWeight)
  return Math.min(100, Math.max(0, progress))
}
