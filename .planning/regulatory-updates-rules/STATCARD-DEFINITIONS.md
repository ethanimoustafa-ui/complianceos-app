# StatCard Definitions — Regulatory Updates (Rules / Circulars)

The four StatCards at the top of the Rules list page count circulars by their
`status` column. This is the canonical definition; **policies, observations,
and letters list pages should reuse the same lifecycle model**.

## The `status` lifecycle

A circular's `status` column is one of `pending | in-progress | completed |
overdue`. It is **derived and persisted server-side** by
`recomputeCircularProgress` in `src/lib/api/services/circulars.ts`, which runs
on every workflow-step CRUD, checklist mutation, and phase advance.

Derivation (in priority order):

1. **completed** — all workflow steps are completed
   (`stepsTotal > 0 && stepsDone === stepsTotal`) **or** `progress >= 100`.
2. **overdue** — not completed **and** `due_date < today`.
3. **in-progress** — not completed, not overdue, and some progress exists
   (`progress > 0` or `stepsDone > 0`).
4. **pending** — nothing started.

## The four StatCards

| Card | Predicate | Intent |
|------|-----------|--------|
| **Total Active Rules** | `circulars.length` | Every circular in scope, regardless of status. The denominator. |
| **In Implementation** | `status === 'in-progress'` | Circulars actively being worked — at least one step done / progress made, not yet finished, not overdue. |
| **Implemented YTD** | `status === 'completed'` | Circulars whose workflow is fully done (all steps complete or 100% progress). |
| **Overdue Actions** | `status === 'overdue'` | Circulars past their `due_date` that are not yet completed — the at-risk bucket. |

`pending` circulars (registered but untouched) deliberately appear **only** in
the Total count, never in the other three.

## Why count by `status` (not recompute in the UI)

The StatCards read the `status` column directly. The previous bug (GAP-6) was
that `status` was never transitioned as a circular progressed — it stayed
`pending` even at 53% progress, so "In Implementation" always showed 0. The fix
keeps the cards' predicates unchanged and instead makes the server maintain the
column. UI logic stays trivial and consistent across all four list pages.

## Reuse guidance (policies / observations / letters)

When building the equivalent StatCards on other list pages:

- Add the same four-state derivation to that entity's progress-recompute
  service function, persisting `status` alongside `progress`.
- Keep the StatCards counting by the `status` column with the identical
  predicates above (`total` / `in-progress` / `completed` / `overdue`).
- Do not recompute status in the React component — the column is authoritative.
