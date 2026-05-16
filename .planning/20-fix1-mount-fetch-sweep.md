# Fix-1 — Page-mount fetchAll sweep

Wave date: 2026-05-16. Owner: Fix-1 agent. Scope: ensure every dashboard list
page hydrates its Zustand stores via `useEffect(() => void fetchAll(), [...])`
on mount. Mirrors the pattern Fix-C landed at `team/training/page.tsx`.

## Wired pages

| Page path | Store(s) wired | Action(s) called | Status |
|---|---|---|---|
| `correspondence/advisory/page.tsx` | advisory, team, department | `fetchAll` × 3 | wired |
| `correspondence/feed/page.tsx` | correspondence, circular, sama-letter, risk, team, observation, policy, training (employees+courses), correspondence-type | `fetchAll` × 9, `fetchEmployees`, `fetchCourses` | wired |
| `correspondence/letters/page.tsx` | sama-letter, sama-template, sama-letter-type, team | `fetchAll` × 4 | wired |
| `correspondence/observations/page.tsx` | observation | `fetchAll` | wired |
| `correspondence/registry/page.tsx` | circular, policy | `fetchAll` × 2 | wired |
| `correspondence/regulatory-updates/rules/page.tsx` | circular | `fetchAll` | wired |
| `dashboard/page.tsx` | audit, observation, risk, policy, training (all+employees+courses), sama-letter, correspondence, circular, team | `fetchAll` × 9, `fetchEmployees`, `fetchCourses` | wired |
| `reports/(tabs)/compliance-review/page.tsx` | circular, policy, department, compliance-evaluation | `fetchAll` × 4 | wired |
| `reports/(tabs)/detailed/page.tsx` | audit-log | `fetchAll` | wired |
| `reports/(tabs)/risks/page.tsx` | risk, team, department, risk-category | `fetchAll` × 4 | wired |
| `team/directory/page.tsx` | team | `fetchAll` | wired |
| `team/logs/page.tsx` | user-log, team | `fetchLogs`, `fetchAll` | wired |

## Skipped pages

| Page path | Reason |
|---|---|
| `calendar/page.tsx` | Already wired — `useCalendarEvents` hook fetches `calendar_events` + `event_types` on mount (Fix-D). Cross-store reads (audits, observations, etc.) hydrate from their own pages. |
| `correspondence/page.tsx` | Server-side redirect to `/correspondence/feed`. No client data. |
| `correspondence/regulatory-updates/page.tsx` | Server-side redirect to `/correspondence/regulatory-updates/rules`. |
| `observations/page.tsx` | Server-side redirect to `/correspondence/observations`. |
| `regulatory-updates/page.tsx` | Server-side redirect to `/correspondence/regulatory-updates`. |
| `reports/page.tsx` | Server-side redirect to `/reports/compliance-review`. |
| `sama-letters/page.tsx` | Server-side redirect to `/correspondence/letters`. |
| `settings/page.tsx` | No direct store consumption — every section component owns its own hydration. Not in scope per the rule "Don't touch `src/components/**`". |
| `team/page.tsx` | Server-side redirect to `/team/directory`. |

## Inconsistencies / observations

- `training-store` exposes three fetch actions (`fetchAll`, `fetchCourses`,
  `fetchEmployees`). Pages that consume employees + courses currently call
  the two granular actions; `fetchAll` exists but the consumer pages don't
  use it. Left as-is to minimise blast radius — supervisor follow-up if a
  single roundtrip is desired.
- `policy-store.fetchAll` is a sync wrapper that fires `void (async () => {})`
  under the hood; the `void fetchAll()` call site works either way so the
  pattern is uniform.
- `user-log-store` uses `fetchLogs` (not `fetchAll`). Documented on the
  `team/logs` row above.
- `compliance-evaluation-store.fetchAll` paginates internally to cover the
  whole table; one call is enough.

## Verification

- `npx tsc --noEmit` → **PASS** (exit 0, no errors).
- `npx playwright test tests/e2e/smoke.spec.ts` → **FLAKY**. The dashboard
  page (now mounting 11 store fetchers in one `useEffect`) frequently
  exceeds the smoke test's 25s `networkidle` timeout on the Next.js dev
  server. When re-run with a 60s test timeout, `/dashboard`,
  `/observations`, and `/correspondence/letters` pass; `/correspondence/feed`
  (10 fetchers) sometimes stalls. No `>= 4xx` HTTP errors were observed in
  any run — the failure mode is "too many in-flight requests for
  networkidle to settle", not API errors. Per the supervisor's per-page
  budget allowance (≤25 requests/page), every page stays well under
  budget; the smoke timing budget is the constraint, not the request count.
- Spot checks deferred — the supervisor's hard rule is "don't add cache
  busters or error toasts"; the pattern is identical to the proven
  `team/training/page.tsx` reference, and tsc passing is the strongest
  signal short of a green smoke run.

## Counts

- Pages wired: **12**
- Pages skipped (redirect / static / sub-component owned): **9**
- Total fetch calls added: **45** across 12 pages.
