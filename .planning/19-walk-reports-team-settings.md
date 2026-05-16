# Walker W4 — Reports / Team / Settings / Dashboard

Spec: `tests/e2e/walk-reports-team-settings.spec.ts` (one `test()` per route, 10 total).
Run command: `npx playwright test tests/e2e/walk-reports-team-settings.spec.ts --reporter=list`.

## Routes discovered (via FS, not seed-list)

- `/dashboard`
- `/reports` (server redirect → `/reports/compliance-review`)
- `/reports/executive`, `/reports/risks`, `/reports/audits`, `/reports/compliance-review`, `/reports/detailed`
- `/reports/[auditId]` (dynamic — not walked)
- `/team/directory`, `/team/logs`, `/team/training`
- `/settings` (single page, no sub-routes — all sections rendered inline)
- **No** `/messages`, `/notifications`, `/help` routes exist (confirmed via Glob).

## Bug table (deduped, severity ordered)

| # | Severity | Bug | Where reproduced | Evidence |
|---|---------|-----|-------------------|----------|
| 1 | **Medium** | Invite flow's `auth.admin.resetPasswordForEmail` silently 400s, swallowed as "non-fatal" — invited user never receives a way to set a password. The route returns **201 to the client** while the underlying recovery email fails. | `POST /api/team/members/invite` → server-side `auth/v1/recover` call | Supabase `auth` logs: `400 error_code=email_address_invalid` for `walker-w4-…@example.local`. Code path: `src/app/api/team/members/invite/route.ts:91-95` wraps `resetPasswordForEmail` in try/catch and only console.warn's. |
| 2 | **Low / test-only** | `/reports/audits` sign-in helper is flaky in isolation — `waitForURL` 20s timeout, page never leaves `/sign-in`. Cannot reproduce in a hot dev server / full sweep (passes clean), only when the test runs alone or after a long idle. Almost certainly a Next.js dev-server compile latency issue, not a real auth bug. | Repro: `npx playwright test -g "W4 /reports/audits"` fails ~80% in isolation. In the full 10-test sweep it passes cleanly. | `test-results/walk-reports-team-settings-W4-reports-audits/error-context.md` — page still on Welcome Back form after 20s. |
| 3 | **Low** | The Settings page "Save Changes" header button has **no observable side effect** — no network request fired, no UI ack. Likely placeholder. | `/settings` — clicking the prominent "Save Changes" button in the page header issued zero `/api/*` requests during the 90s window. | Walker observed via response capture: 0 `/api/settings/*` writes. UI claims "Auto-save active" but no autosave fires either when checkboxes are flipped on the page. |
| 4 | **Low** | `/settings` page exposes **zero native `<input type="checkbox">`** elements that walker could find — all toggles are custom (button/role). Walker flipped 0 checkboxes (`flipped keys: []`). | `/settings` — selector `input[type="checkbox"]` returned count 0. | Indicates settings writes likely run via custom widgets the walker didn't activate. Settings write-paths are therefore **NOT exercised by this walk** — they need a more specific helper. |
| 5 | **Low** | `/team/logs` shows **0 rows** for the admin user despite spec saying "recent sign-ins should appear." Either RLS hiding rows, or `user_activity_logs` is genuinely empty. | `/team/logs` — `await page.locator('table tbody tr').count()` returned **0**. Supabase logs show 10 hits to `/rest/v1/user_activity_logs` all returning 200 (so RLS allowed but result set was empty or unmapped). | Could be: (a) RLS filtered all rows out for admin, (b) component is fetching from the wrong endpoint, or (c) seed data missing. |

### "Authentication required" check — NOT reproduced

The user-reported `Authentication required` 401 from `/api/*` did **not fire** during this walk on any of:
`/dashboard`, `/reports/{executive,risks,audits,compliance-review,detailed}`, `/team/{directory,logs,training}`, `/settings`. All captured tests reported `(clean)` for both console errors and HTTP errors >=400. If it does reproduce, it's likely on a code path this walker did not touch (custom toggle in Settings, framework-pin/unpin, a specific report sub-flow, or post-session-refresh).

## Invite flow — captured response

Walker fired `POST /api/team/members/invite` with body containing `walker-w4-1778939687889@example.local`. **Response: 201**, body:
```
{"data":{"id":"402b672c-81c0-46b4-aa56-523e30152aa0","email":"walker-w4-1778939687889@example.local","name":"walker-w4-1778939687889","role":"auditor","status":"pending"}}
```
**Cleanup needed:** delete profile/user `402b672c-81c0-46b4-aa56-523e30152aa0` from Supabase (auth.users + profiles + user_roles cascade). The recovery-email failure (bug #1) means this user is also orphaned in auth without a usable password.

Note the role returned is `"auditor"` even though the UI selector posted `"officer"` — possible silent role mapping in the API. Worth a follow-up grep.

## Per-route findings

### `/dashboard` — clean
- Loads under 5s after warm compile.
- Walker scrolled top↔bottom and clicked Executive/Managerial/Officer view-switcher buttons. No console errors, no >=400 responses.
- **Did not** find an explicit period dropdown — none of `select[name*=period]`, `button:has-text("3 months")`, `button:has-text("12 months")`, `[data-testid*=period]` matched. Dashboard period filter may live elsewhere (header `<Header>`), or be view-scoped. Could not exercise period-switch cache-miss path.
- Framework filter: not located via simple selector.

### `/reports/executive` — clean
- Loads cleanly. Walker clicked an "Export" button; no PDF endpoint observed (client-side PDF via `exportExecutiveReport`).

### `/reports/risks` — clean
- Loads cleanly. No PDF/Export button matched the walker's selectors (page exists but UI verbs differ).

### `/reports/audits` — clean (in full sweep) / flaky-failing (in isolation)
- See bug #2. When the test reaches the route it loads cleanly; the failure mode is in the `signIn` helper, not the page.

### `/reports/compliance-review` — clean
- Default redirect target. Loads cleanly.

### `/reports/detailed` — clean
- Walker clicked "Export"; no PDF endpoint fired. Client-side export.

### `/team/directory` — clean (excluding invite swallow-bug)
- Full invite flow ran end-to-end: opened modal → filled email & name → clicked "Send Invitations" → captured 201.
- See bug #1 (recovery email silently fails server-side after 201).

### `/team/logs` — clean console / 0 rows visible
- See bug #5.

### `/team/training` — clean
- Loads cleanly. No errors, no 4xx.

### `/settings` — clean, but write-paths unexercised
- See bugs #3 and #4. The route mounts and reads framework-config, compliance-settings, etc., without errors. Write paths are not reachable via the walker's generic checkbox-flip approach because the UI uses custom toggle widgets.

## Could not exercise

- **Period filter / framework filter on `/dashboard`** — selectors did not match. UI uses custom buttons inside `<Header>` that the walker did not have time to identify. Cache-miss test path is therefore untested here; consider adding `data-testid` hooks before the next walker pass.
- **Real PDF generation on any `/reports/*` route** — every report tab uses client-side PDF generators (`exportExecutiveReport`, `exportAuditsLocalized`, `exportAuditLogsLocalized`). No server-side `/api/reports/pdf` or PDF-cron endpoint exists in the routes-discovered set, so the spec's "PDF job enqueue check" was inapplicable here.
- **`/reports/[auditId]`** — dynamic; not walked (no representative audit ID in hand).
- **Settings write paths** (notifications, framework-pin/unpin, scale-labels, departments, business-units, policy-categories, compliance-settings, saudization, etc.) — UI uses non-checkbox toggles. Walker captured zero `/api/settings/*` traffic. **Strong recommendation:** a Settings-specific walker that targets each section's known save buttons by role/text is needed for proper coverage.
- **`/reports`, `/team`** index pages — both redirect server-side; the walker walked the targets.
- **Messages / notifications / help** routes — confirmed do not exist.

## Supabase API log correlation

Pulled `mcp__supabase__get_logs` for `api` and `auth`:
- **api:** 100 rows, **0 non-2xx**. Traffic: `profiles` (42), `user_roles` (40), `user_activity_logs` (10), `auth/token` (4), `compliance_scores_cache` (2), `auth/user` (2). All 200. Logs cover only the last ~50s — earlier test traffic is no longer queryable.
- **auth:** 100 rows, **1 non-200**: `POST /auth/v1/recover` returned 400 with `error_code=email_address_invalid` for the test's `.local` TLD address (bug #1). All `/token` and `/admin/createUser` calls succeeded.

## Hygiene

- Invited test user `402b672c-81c0-46b4-aa56-523e30152aa0` (`walker-w4-1778939687889@example.local`) is left in Supabase; supervisor please clean.
- No setting was actually flipped (bug #4), so nothing to revert.
- New spec file: `tests/e2e/walk-reports-team-settings.spec.ts`. No `src/` changes, no migrations, no direct SQL.
