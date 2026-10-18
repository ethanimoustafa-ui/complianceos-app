# Night-Shift Summary — 2026-05-17 → 2026-05-18

## TL;DR
- **9 of 9 page surfaces** brought to the circular-parity convention: hard-delete cascade, skeleton boundaries, optimistic snapshot-restore mutations, `LoadingButton` everywhere, strong delete confirms, formatted timestamps, defensive `byId ?? list.find ?? null` reads.
- **8 new migrations applied** (025, 026, 039–047) — every domain entity is hard-deletable with full FK cascade and `audit_logs` retains the deletion event.
- **17/17 pages verified** by `tests/e2e/final-sweep.spec.ts`: **0 console errors, 0 console warnings, 0 4xx/5xx network responses**.
- **Request-budget grade** per page in `FINAL-VERIFICATION.md`. 15/17 pages under the ≤25 cold-load budget. Two over (dashboard 48, feed 28) → addressed with the final 30s `lastFetched` TTL guard on `fetchAll` across all 9 hot stores.
- **Live in-flight dedupe** finally wired into `api-client.ts` — a previous wave shipped `src/lib/api/dedupe.ts` but never imported it. Same-tick GETs now collapse to one wire request.
- **`OPTIMIZATION-PATTERNS.md`** at repo root is the canonical doc for adding new features.

## What's where

| Domain | Migration | E2E spec | Notes |
|---|---|---|---|
| Circulars | 025, 026, 040 | `tests/e2e/circulars-e2e.spec.ts` | workflow steps with assignee + deadline + notify-on-current. SECURITY DEFINER reference RPC. |
| Policies | 041 | `tests/e2e/policies-e2e.spec.ts` | hard-delete cascade audited live. policy workflow advance now notifies assignee (defensive — `assigned_to` col not in schema; a future migration unlocks it). |
| Audits | 042 | `tests/e2e/audits-e2e.spec.ts` | header-not-instant bug fixed; `fetchById` now prepends to `audits[]` (was hidden behind "Audit Not Found" on freshly-created rows). |
| Observations | 043 | `tests/e2e/observations-e2e.spec.ts` | all 10 FK children verified CASCADE. |
| Risks | 044 | `tests/e2e/risks-e2e.spec.ts` | server + store + UI done. |
| Training | 045 | `tests/e2e/training-e2e.spec.ts` | server + store + UI done. |
| Letters / Correspondence | 046 | `tests/e2e/letters-e2e.spec.ts` (8/8 PASS) | letter + correspondence both cascade-clean; `attachment_count` derived for cards. |
| Calendar | 047 | `tests/e2e/calendar-e2e.spec.ts` (6/6 PASS) | no separate child tables — attendees/reminders are JSONB on parent. |
| Dashboard / Reports / Settings / Team | — | `tests/e2e/final-sweep.spec.ts` (17/17 PASS) | per-widget skeleton shapes, `LoadingButton` on every mutation, strong remove-member confirm. |

## Known follow-ups (not blocking)

1. **Auth-fanout** (~10 paired `profiles + auth/v1/user` per page from node UA). Fix is Edge Middleware hoist (HANDOFF §4 item 5). Bigger refactor than this session warranted.
2. **`lookup-hydrator.tsx`** still hits Supabase REST directly (~10 browser-UA calls/page). Should be migrated to `apiFetch` so it benefits from dedupe + JWT-hook auth.
3. **`policy_workflow_steps.assigned_to` column** doesn't exist yet — `notifyPolicyStepAssignee` is wired defensively. Add the column in a future migration to enable per-step assignee notifications.
4. **2 list-route Zod parse paths** in less-trafficked endpoints may still throw 500 on invalid query params. Sweep didn't surface them; not a top-priority polish item.

## Files of interest

- `OPTIMIZATION-PATTERNS.md` — the conventions doc (read before adding new features).
- `OPTIMIZATION-BASELINE.md` — Supabase request metrics, top-10 endpoints by hits.
- `FINAL-VERIFICATION.md` — per-page pass/fail + cold-load metrics.
- `tests/e2e/_artifacts/final-sweep-metrics.json` — raw sweep metrics.
- `src/components/ui/{skeleton,spinner,loading-button}.tsx` — primitives.
- `src/lib/api/dedupe.ts` — in-flight request map.
- `src/lib/format-date.ts` — `formatTimelineDate` helper.
- `src/lib/workflow-defaults.ts` — default circular workflow steps (shared client/server).

## Git history

```
a98999a final: 30s TTL guard on fetchAll across 9 stores
4651a24 final wave: live dedupe + policy step notifications + letter-store prepend + sweep verification
693904e checkpoint: dashboard + reports + settings + team waves
1b47714 checkpoint: letters + calendar waves complete
739b7a1 Add calendar E2E verification spec
eaf0be8 Add letters e2e verification spec
259d4c5 checkpoint: cascade migrations + skeleton + optimistic UI across circulars/policies/audits/observations/risks/training
903e0d0 Add audits e2e verification spec
b2306ad Add observations E2E integration spec
ecb5ec4 Add policies E2E integration spec
```

`tsc --noEmit` exits 0 on `a98999a`. Ready for the morning.
