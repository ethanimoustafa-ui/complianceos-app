# W1 — Correspondence + Regulatory Updates Walk

**Walker:** W1 of 4 (parallel sweep)
**Spec:** `tests/e2e/walk-correspondence.spec.ts`
**Run:** 2026-05-16T13:57:36Z – 13:58:18Z (40.4s, all 10 tests passed structurally)
**Report JSON:** `tests/e2e/_artifacts/W1-report-1778939898672.json`

## Dedup'd Bug Table

| Severity | Route | Symptom | Hypothesis | Repro Steps |
|---|---|---|---|---|
| **P0 / blocker** | `/correspondence/letters` | Clicking "New Letter" throws unhandled `Error: getNextReference() has moved server-side. Read \`letter.reference\` from the result of \`create()\` instead.` — full-screen Next.js Runtime Error overlay, modal never opens | `CreateLetterForm.tsx:172` calls `store.getNextReference(selectedType)` at render-time. The store method is a compat shim that throws unconditionally (see `src/stores/sama-letter-store.ts:439-443`). Server moved ref generation to POST; client-side render contract was never updated. | 1) Sign in 2) goto `/correspondence/letters` 3) click "New Letter" button 4) observe runtime error overlay |
| **P1 / perf** | `/sign-in` (post-auth redirect) | First-pass test had every fresh-context sign-in time out at 20s and 45s on `page.waitForURL((url) => !url.startsWith('/sign-in'))`. Supabase `/auth/v1/token?grant_type=password` returned 200 in <300ms every time; the bottleneck is client-side post-login redirect. | After successful auth, the dashboard layout fires duplicate parallel fetches: identical `/rest/v1/profiles?…` and `/rest/v1/user_roles?…` queries fire 4-5 times back-to-back in the same second per sign-in (visible in Supabase api logs at 1778939582, 1778939591, 1778939613 etc.). Suspect a `useEffect` dep array misconfig or an un-memoized client that re-instantiates and re-subscribes — auth context probably double-renders during Zustand hydration. | 1) Hard-refresh tab → /sign-in 2) Sign in 3) Watch network panel — observe 4-5 identical GETs to `/profiles` and `/user_roles` for the same `user_id` within ~1s, then the URL takes 20-45s to redirect away from /sign-in |
| **P3 / data gap** | `/correspondence/advisory`, `/correspondence/observations`, `/correspondence/regulatory-updates/policies`, `/correspondence/regulatory-updates/rules` | All four pages render an empty state — could not exercise list-click user story | Seed data for these tables is either missing or filtered out by RLS for the admin user. Not necessarily a bug, but blocks deeper walk coverage. | Sign in, navigate to each route — see empty list / "no items" placeholder |

## Discovered Routes (filesystem enumeration, not guess)

All from `src/app/(dashboard)/correspondence/**/page.tsx`:

- `/correspondence` (index)
- `/correspondence/feed`
- `/correspondence/letters`
- `/correspondence/advisory`
- `/correspondence/observations`
- `/correspondence/registry`
- `/correspondence/regulatory-updates`
- `/correspondence/regulatory-updates/policies`
- `/correspondence/regulatory-updates/rules`

**Not present** in repo (charter mentioned these as candidates):
- `/correspondence/letters/templates` — does NOT exist as a separate route. Templates live in a modal toggled by `setIsTemplateManagementOpen(true)` inside `/correspondence/letters/page.tsx`. The `getNextReference` bug the supervisor saw was almost certainly triggered there.
- `/correspondence/articles` — does not exist anywhere in `src/app/`.

## Per-Route Results

| Route | Nav OK | Console errors | pageerror | HTTP 4xx/5xx | Visible error | Story exercised | Screenshot |
|---|---|---|---|---|---|---|---|
| `/correspondence` | yes | 0 | 0 | 0 | none | (none) | n/a |
| `/correspondence/feed` | yes | 0 | 0 | 0 | none | (none) | n/a |
| `/correspondence/letters` | yes | 0 | **1** | 0 | **Runtime Error overlay** | opened "New Letter" → crash | `W1-correspondence-letters-1778939881079.png` |
| `/correspondence/advisory` | yes | 0 | 0 | 0 | none | empty state — skipped detail click | n/a |
| `/correspondence/observations` | yes | 0 | 0 | 0 | none | empty state — skipped detail click | n/a |
| `/correspondence/registry` | yes | 0 | 0 | 0 | none | clicked first list row (no nav errors observed) | n/a |
| `/correspondence/regulatory-updates` | yes | 0 | 0 | 0 | none | (none) | n/a |
| `/correspondence/regulatory-updates/policies` | yes | 0 | 0 | 0 | none | empty state — skipped detail click | n/a |
| `/correspondence/regulatory-updates/rules` | yes | 0 | 0 | 0 | none | empty state — skipped detail click | n/a |

## Critical Bug — Full Stack Trace

```
Error: getNextReference() has moved server-side.
       Read `letter.reference` from the result of `create()` instead.
  at Object.getNextReference (src/stores/sama-letter-store.ts:440:11)
  at CreateLetterForm (src/components/correspondence/letters/CreateLetterForm.tsx:172)
  at renderWithHooks (react-dom internals)
```

**Call site:** `src/components/correspondence/letters/CreateLetterForm.tsx:172`
```tsx
const reference = store.getNextReference(selectedType)
```
This runs unconditionally during component render — there is no guard, no try/catch, no useEffect. As soon as the modal mounts, the throwing shim at `src/stores/sama-letter-store.ts:439-443` fires and React unmounts the tree into the error overlay.

**Suspected layer:** Client (React component) — the migration left the form using the deprecated shim. The store comment at `src/stores/sama-letter-store.ts:13-19` even calls this out: *"`getNextReference()` is retained as a no-op compat shim that throws — call sites should be updated to read `letter.reference` off the create() return value instead."* The migration was incomplete: `CreateLetterForm` was not updated. (`grep` shows 5 files still reference `getNextReference`: `letter-store`, `observation-store`, `lib/api/services/letters`, plus `CreateLetterForm` and `add-observation-modal`.)

**Fix shape (for the supervisor's fix wave, NOT applied here):**
- Drop the `const reference = …` line from `CreateLetterForm` render path; display "Reference: pending" until the form is submitted, then surface `letter.reference` from the `create()` response.
- Same audit needed for `src/components/observations/add-observation-modal.tsx` (likely a second instance of the identical bug — file shows up in `getNextReference` grep). W2/W3 should verify if they own observations.

## Supabase Correlation (api + auth logs)

Pulled `mcp__supabase__get_logs({service: 'api'})` and `service: 'auth'` over the test window (1778939856–1778939920 ms).

- **Total api log events in window:** 78
- **Non-2xx in window:** **0**
- Status distribution across full ~100 sample: `{200: 96, 201: 4}`
- Auth `/token` POSTs: all 200 OK with sub-300ms duration

**Conclusion:** every backend call succeeded. The blocker bug is **purely client-side** (a stale store API contract). The P1 perf finding is also client-side — duplicate identical GETs from the React tree, not a server problem.

## Could-Not-Exercise / Soft-Skip Findings

- `/correspondence/feed` and `/correspondence/regulatory-updates` index pages have no obvious primary user story (mostly read-only dashboards). Walker fell through with empty `storyOutcome`. If those pages were supposed to surface live feed widgets that fetch on mount, the lack of any network 4xx suggests they rendered fine — but a richer user-story probe (e.g. open a card detail) would need design intent input.
- 4 routes were stuck in empty-state. Cannot distinguish "feature works but no seed data" vs "RLS hides data from admin" vs "query is broken silently returning []". Worth a `select count(*)` per table for the supervisor.

## Needs Further Investigation

1. **Why does post-auth redirect take 20-45s on a cold context?** The pattern of repeated identical `/profiles?id=eq.<uuid>` and `/user_roles?…` GETs (4-5 per sign-in, ~150ms apart) strongly hints at a React effect re-firing during Zustand store hydration. Could be a major UX regression hidden behind localhost dev compile times. Repro is deterministic in fresh contexts.
2. **Are `correspondence/observations` and `correspondence/advisory` actually wired to data?** Both came up empty. If seed expected them populated, that's a separate finding. If they share a store with `/observations` (different module), the empty state may be correct.
3. **The /registry page accepted a row click without error** — but the spec didn't follow the detail page nav. Worth W3 / supervisor confirming the detail route works (it's outside W1's charter as scoped).

## Test-Harness Notes (for supervisor)

- The first iteration of this spec used per-test `signIn()` calls — that triggered the 45s post-auth-redirect timeout repeatedly and made the suite unusable. Switched to a single `test.beforeAll` that signs in once and persists `storageState` to `tests/e2e/_artifacts/W1-storage-state.json`. That dropped the full suite from "1 of 9 walked" to "9 of 9 walked in 40s". Recommend other walkers adopt the same pattern.
- Deliberately did NOT call `expect()` inside the per-route tests — they would mark routes red and abort the serial loop. All findings are aggregated into the final JSON report instead.

**W1 DONE. Bug count: 1 P0, 1 P1 perf, 1 P3 data-gap. See `.planning/19-walk-correspondence.md`.**
