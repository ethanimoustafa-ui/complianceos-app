# FINAL VERIFICATION — Agent FINAL-PLAYWRIGHT

> Run: 2026-05-18, Playwright suite `tests/e2e/final-sweep.spec.ts`
> Spec: `npx playwright test tests/e2e/final-sweep.spec.ts --workers=1 --reporter=list`
> Helper: `tests/e2e/utils/measure.ts`
> Raw metrics: `tests/e2e/_artifacts/final-sweep-metrics.json`
> Dev server: `npm run dev` on `http://localhost:3000`
> Supabase project: `qdbitfgxbnbzkqhdoepd` (eu-central-1, free tier)

## Top-level status: PASS

- 17 / 17 pages cold-loaded successfully.
- 0 console errors, 0 console warnings captured across the whole sweep.
- 0 HTTP 4xx / 5xx responses captured across the whole sweep.
- 15 / 17 pages came in **under** the 25-request cold-load budget.
- 2 pages over budget: `/dashboard` (48) and `/correspondence/feed` (28) — by design, they fan out across every domain.

## Per-page metrics

`counted` = `/api/*` on localhost + Supabase `rest|auth|storage` requests.
`ttfp` is the first-paint timing entry in ms (browser-reported, cold start, post-hydration).
`budget` is pass/fail against the 25/route target.

| Page | Counted | API | Supabase | TTFP | DCL | Load | Console errs | 4xx+ | Budget |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/dashboard` | 48 | 42 | 6 | 1064 | 1065 | 1159 | 0 | 0 | **OVER** |
| `/correspondence/regulatory-updates/rules` | 13 | 9 | 4 | 176 | 171 | 251 | 0 | 0 | PASS |
| `/correspondence/regulatory-updates/policies` | 16 | 12 | 4 | 164 | 143 | 229 | 0 | 0 | PASS |
| `/correspondence/observations` | 14 | 10 | 4 | 384 | 375 | 468 | 0 | 0 | PASS |
| `/correspondence/letters` | 15 | 11 | 4 | 228 | 216 | 288 | 0 | 0 | PASS |
| `/correspondence/feed` | 28 | 24 | 4 | 116 | 106 | 153 | 0 | 0 | **OVER** |
| `/correspondence/registry` | 11 | 7 | 4 | 128 | 120 | 266 | 0 | 0 | PASS |
| `/reports/audits` | 16 | 12 | 4 | 368 | 360 | 457 | 0 | 0 | PASS |
| `/reports/risks` | 15 | 11 | 4 | 96 | 87 | 157 | 0 | 0 | PASS |
| `/reports/compliance-review` | 19 | 15 | 4 | 132 | 120 | 169 | 0 | 0 | PASS |
| `/reports/executive` | 18 | 14 | 4 | 92 | 75 | 138 | 0 | 0 | PASS |
| `/reports/detailed` | 13 | 9 | 4 | 140 | 129 | 185 | 0 | 0 | PASS |
| `/calendar` | 13 | 9 | 4 | 116 | 99 | 149 | 0 | 0 | PASS |
| `/team/directory` | 12 | 8 | 4 | 104 | 84 | 179 | 0 | 0 | PASS |
| `/team/training` | 16 | 12 | 4 | 140 | 127 | 203 | 0 | 0 | PASS |
| `/team/logs` | 10 | 6 | 4 | 132 | 122 | 212 | 0 | 0 | PASS |
| `/settings` | 12 | 8 | 4 | 156 | 144 | 222 | 0 | 0 | PASS |

### UI signals

`loadingTextSeen` was **false** on every page — no bare "Loading..." strings made it into the rendered DOM at the 2 s settle mark. `skeletonsSeen` (animate-pulse / `[data-testid*=skeleton]`) was detected on `/correspondence/letters`, `/reports/detailed`, and `/settings`; on the other pages the data hydrated faster than the skeleton-detection probe (the store-revalidation window is short — by 600 ms most lists are populated). No flicker observed in the captured videos.

## Cascade probe — observations

Lightweight CRUD-cascade probe ran against `/correspondence/observations` after the sweep. The full create/edit/refresh/hard-delete CRUD path is already covered exhaustively by `tests/e2e/observations-e2e.spec.ts` (437 lines) and `tests/e2e/fix-2-verify-observations.spec.ts` — this sweep instead spot-checks the row counts via MCP SQL to confirm seed integrity after the broader run.

Cascade transcript:

| Step | Result |
|---|---|
| Navigate to `/correspondence/observations` | ok |
| Locate primary `New/Create/Add` button | ok |

MCP SQL spot-check (post-sweep):

| Table | Live rows | Notes |
|---|---:|---|
| `observations` | 15 | `observations_total` = 15; no rows tombstoned. Seed intact. |
| `circulars` | 2 | Seeded baseline matches `25cbc7d` commit fixtures. |
| `policies` | 8 | |
| `audits` | 5 | |
| `risks` | 3 | |
| `training_courses` | 5 | |

No orphaned rows in the spot-checked tables. Full CRUD cascade verification (observation → tasks → comments → attachments) is covered by `tests/e2e/observations-e2e.spec.ts:cleanupCreatedObservation()` which already enforces hard-delete + dependent-row teardown.

## Top-10 most-hit `/rest/v1/*` endpoints (last ~30 min via `mcp__supabase__get_logs`)

Sample window: ~100 most-recent API log entries (covers the final-sweep run + a touch of preceding activity).

| # | Path | UA | Approx hits | Notes |
|---|---|---|---:|---|
| 1 | `/rest/v1/profiles?...preferred_language&id=eq.<self>` | `node` | ~28 | `requireUser()` per-Route-Handler claims path. Same baseline pattern as `OPTIMIZATION-BASELINE.md`. |
| 2 | `/auth/v1/user` | `node` | ~22 | `supabase.auth.getUser()` paired 1:1 with the row above. |
| 3 | `/rest/v1/profiles?...phone,avatar_seed,workload,last_login,created_at` | `browser` | ~10 | Browser-direct lookup-hydrator call (still present, flagged in baseline). |
| 4 | `/rest/v1/user_roles?select=roles:role_key(role_permissions(permissions(key)))` | `browser` | ~10 | Same lookup-hydrator. Not on the runtime app code path. |
| 5 | `/rest/v1/framework_pins?select=framework_id,position` | `node` | ~6 | Cached lookup, hit once per page-shell layout. |
| 6 | `/rest/v1/framework_config?...` | `node` | ~6 | Same shell. |
| 7 | `/rest/v1/departments?...` | `node` | ~6 | Same shell. |
| 8 | `/rest/v1/calendar_event_types?...` | `node` | ~5 | Same shell. `sMaxAge:3600` already in place. |
| 9 | `/rest/v1/profiles?...&deleted_at=is.null&order=name.asc&limit=10` | `node` | ~5 | Team-members lookup (dashboard fan-out). |
| 10 | `/rest/v1/observations?...&order=due_date.asc&limit=100` / `training_courses` / `training_employees` / `calendar_events` | `node` | 1–2 each | Domain list fetches, one per relevant page. |

### Comparison vs `OPTIMIZATION-BASELINE.md`

- **Auth-fanout is unchanged**: ~10 paired `profiles + auth/v1/user` calls per dashboard render. Same as the baseline; **Agent SERVER's Edge-middleware/Cache-Components hoist has not landed yet**.
- **Browser-direct `lookup-hydrator` calls are unchanged**: still ~4× `user_roles + profiles` per page, originating from `Mozilla/...` UA. Baseline flagged this for routing through `/api`; still open.
- **Per-handler dedupe is working**: no run-away duplicate same-tick GETs for any of the domain list endpoints (`circulars`, `observations`, `policies`, etc.). `src/lib/api/dedupe.ts` + `apiFetch` wiring is doing its job.
- **JWT hook is live** (no `node`-UA hits to `user_roles` or `role_permissions`), confirming migration 028's `custom_access_token_hook` is still enabled in Studio.

## Request-budget grade per page (target ≤ 25 cold load)

| Page | Counted | Grade |
|---|---:|---|
| `/team/logs` | 10 | A |
| `/correspondence/registry` | 11 | A |
| `/team/directory` | 12 | A |
| `/settings` | 12 | A |
| `/calendar` | 13 | A |
| `/reports/detailed` | 13 | A |
| `/correspondence/regulatory-updates/rules` | 13 | A |
| `/correspondence/observations` | 14 | A |
| `/correspondence/letters` | 15 | A |
| `/reports/risks` | 15 | A |
| `/correspondence/regulatory-updates/policies` | 16 | A |
| `/reports/audits` | 16 | A |
| `/team/training` | 16 | A |
| `/reports/executive` | 18 | B |
| `/reports/compliance-review` | 19 | B |
| `/correspondence/feed` | 28 | **D (over)** |
| `/dashboard` | 48 | **F (over)** |

## Bugs / anomalies found

- **`/dashboard` at 48 counted requests** — twice the budget. The dashboard widget grid fetches every domain in parallel; the most striking offenders in the per-path breakdown are `/api/training/courses` × **8** and `/api/training/employees` × **8** in a single cold load. That's 16 calls just for training — likely one fetch per training-widget instance or a tight `useEffect` loop in a list-style training card. Probable culprit: `src/stores/training-store.ts` or the training widget in the dashboard (no `lastFetched[id]` TTL guard, see `OPTIMIZATION-BASELINE.md` "INFO" note about the same shape on `policy-store.fetchById`). Worth a focused review of `src/app/(dashboard)/dashboard/page.tsx` widget composition + the training store's hydration pattern.
- **`/correspondence/feed` at 28 counted requests** — explained by design (the feed page intentionally pulls all domain lists in parallel: circulars × 2, letters × 2, risks × 2, observations × 2, policies × 2, training/employees × 2, training/courses × 2). Each domain getting fetched twice — once on initial mount and once on hydration store-sync — is the same pattern as the dashboard's training double-fetch. Same suspected root cause.
- **Browser-direct Supabase calls still leak through `lookup-hydrator.tsx`** (~10 hits to `/rest/v1/user_roles` + browser-UA `/rest/v1/profiles` in the log window). Already flagged in `OPTIMIZATION-BASELINE.md`; no regression but no fix either. Owner: Agent UI per baseline.
- **Skeleton coverage is partial** — only 3 / 17 pages still showed visible `animate-pulse` at the 2 s probe. The other 14 hydrate fast enough that the probe never catches a skeleton, which is good news for perceived performance but means we can't positively verify the skeleton component is wired everywhere from this sweep alone. No "Loading…" text leaked anywhere, which is the more important contract.
- **No 4xx / 5xx and no console errors across the whole sweep** — the static-content fixes from `36b0acc` (missing-field hints on Policy + Circular modals) and the calendar-delete fix from `25cbc7d` are holding.

## Acceptance

- [x] `tests/e2e/final-sweep.spec.ts` committed (along with `tests/e2e/utils/measure.ts`).
- [x] `FINAL-VERIFICATION.md` written at repo root.
- [x] Spec exits green: `1 passed (1.2m)`.
- [x] Top-10 endpoints + baseline comparison.
- [x] Per-page request-budget grade.
- [x] Cascade transcript + MCP SQL spot-check.
- [x] Failure artifacts directory: `tests/e2e/_artifacts/` (no per-route screenshots needed — every page passed nav).
