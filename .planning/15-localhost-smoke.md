# Localhost Smoke Test Status

**Date**: 2026-05-16
**Result**: **FAIL** — sign-in blocked by Supabase auth error before any post-auth routes could be exercised.

---

## 1. Install

| Step | Result |
| --- | --- |
| `npm install -D @playwright/test` | OK — added 4 packages |
| `npx playwright install chromium` | OK — Chrome 148.0.7778.96 (playwright chromium v1223) + Chrome Headless Shell installed to `C:\Users\ha_nn\AppData\Local\ms-playwright\` |
| Playwright runtime | `@playwright/test` resolved (latest from npm) |
| Project deps observed | next ^16.2.6, react 19.2.3, zustand ^5.0.10, @supabase/ssr ^0.10.3, @supabase/supabase-js ^2.105.4 |

`--with-deps` was omitted (Windows doesn't need it and the command isn't supported the same way). Plain `playwright install chromium` succeeded.

---

## 2. Dev server

- `npm run dev` was auto-started by Playwright's `webServer` config.
- Server reached `http://localhost:3000` and served `/sign-in` cleanly (no compile errors).
- Sign-in form rendered correctly (Welcome Back, email + password inputs, Sign In button, EN/AR locale toggle).
- First-time compile completed within the 180s `webServer.timeout` budget.

No Next.js build/compile errors surfaced.

---

## 3. Per-route status

Only `/sign-in` was reached. **All 9 post-auth routes were skipped** because the sign-in step never produced a session — the form stayed on `/sign-in` and `page.waitForURL(!sign-in)` timed out after 20s.

| Route | Status |
| --- | --- |
| `/sign-in` | Rendered OK (200) |
| `/dashboard` | NOT REACHED |
| `/observations` | NOT REACHED |
| `/correspondence/letters` | NOT REACHED |
| `/correspondence/feed` | NOT REACHED |
| `/reports/executive` | NOT REACHED |
| `/reports/risks` | NOT REACHED |
| `/calendar` | NOT REACHED |
| `/team/directory` | NOT REACHED |
| `/settings` | NOT REACHED |

---

## 4. Console errors (deduped)

Playwright captured **no `console.error` messages** before the timeout (the error surfaced inline as a form error paragraph, not as a console log).

---

## 5. Network 5xx (deduped)

Playwright captured **no HTTP 5xx responses** before the timeout. The Supabase auth call returned a structured error (likely HTTP 500 or 400 from `/auth/v1/token`), but the assertion timed out before listing it. The error message is surfaced through the form's `submitError` state, not via a 5xx-only filter.

---

## 6. Primary failure: form-level error surfaced

After filling credentials and clicking **Sign In**, the form rendered the following error message under the password field (captured from the Playwright accessibility snapshot of the failure screenshot):

> **`Database error querying schema`**

The page stayed on `/sign-in`. No redirect to `/dashboard` occurred.

This string is the literal Supabase auth/gotrue server error returned to `signIn()` in `src/stores/auth-store.ts` and propagated to `setSubmitError(result.error)` in `src/app/(auth)/sign-in/page.tsx`.

### Screenshot evidence
`test-results\smoke-sign-in-then-dashboard-then-key-pages-load\test-failed-1.png` shows:
- Email field: `admin@complianceos.local` (filled)
- Password field: `ComplianceOS!2026` (filled, 16 dots visible)
- Red text under password field: **"Database error querying schema"**
- URL still `/sign-in`

---

## 7. Triage groups

### Group A — Supabase Auth schema error (BLOCKING)

**Symptom**: `Database error querying schema` returned from `supabase.auth.signInWithPassword(...)` for an account that the orchestrator confirms exists (`admin@complianceos.local` in `auth.users`, profile.role = `org_admin`, `user_roles` row present).

**Likely root causes** (in order of probability):

1. **A trigger or function attached to `auth.users` (or to a public table referenced during sign-in) is querying a schema/table/column that doesn't exist or that the `supabase_auth_admin` role can't see.** Supabase's gotrue runs a post-auth query through the `auth.users` view and any `on_auth_user_created` / `on_auth_user_login` triggers. If a trigger references e.g. `public.profiles.tenant_id` or `public.user_roles` with a column that's been renamed/dropped in a migration, gotrue surfaces *exactly* this generic "Database error querying schema" message.
2. **A `SECURITY DEFINER` function used by RLS or a trigger has lost its `search_path` / `GRANT` after a migration**, so when `supabase_auth_admin` invokes it during sign-in it fails with a schema/permission error.
3. **The `auth` → `public` foreign-key cascade (`profiles.id` references `auth.users.id`) is broken**, e.g. a migration recreated `public.profiles` without re-granting `SELECT` to `supabase_auth_admin`, or with the wrong column type.
4. Less likely: the project is paused or in maintenance and the auth schema introspection is partially failing.

**Where to look**:
- `supabase/migrations/*` — most recent migrations touching `public.profiles`, `public.user_roles`, or any `on_auth_*` trigger.
- `mcp__supabase__get_advisors` (security advisor) and `mcp__supabase__get_logs` (filter to `auth` service) will pinpoint the failing statement.
- `mcp__supabase__execute_sql` with `select tgname, tgrelid::regclass from pg_trigger where tgrelid = 'auth.users'::regclass;` to enumerate user-defined triggers on `auth.users`.

### Group B — Test harness adaptations (informational, not a bug)

- Sign-in form labels are **not** associated with inputs (no `htmlFor`/`id`), so `page.getByLabel(/email/i)` would not work. Test was adapted to use `input[type="email"]` / `input[type="password"]` selectors. No source change required.

---

## 8. Verdict

**FAIL** — Smoke test blocked at sign-in. Dev server is healthy; Next.js compiles; UI renders. The blocker is a Supabase server-side error during password sign-in: `"Database error querying schema"`. No application route past `/sign-in` was exercised. Orchestrator should dispatch a fix agent against Group A (auth schema / trigger / grants).

Artifacts:
- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`
- `test-results/smoke-sign-in-then-dashboard-then-key-pages-load/test-failed-1.png`
- `test-results/smoke-sign-in-then-dashboard-then-key-pages-load/video.webm`
- `test-results/smoke-sign-in-then-dashboard-then-key-pages-load/error-context.md`

---

## Re-run #2 (after auth.users NULL-token patch)

**Date**: 2026-05-16
**Result**: **FAIL** — different blocker. The original `Database error querying schema` is **gone** (the NULL-token patch worked); Supabase auth now accepts the credentials. However, the first post-auth Supabase query (`fetchPermissions` joining `user_roles` to `roles`) fails because the PostgREST schema cache cannot find the `user_roles.role_id` foreign key. Result: the sign-in handler never navigates away from `/sign-in` and the test times out.

### Sign-in outcome

- The form is submitted and `supabase.auth.signInWithPassword(...)` **no longer returns** `Database error querying schema`.
- **But** the page never leaves `/sign-in` — `page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))` times out after 20s.
- The Next.js Dev Tools overlay shows **"2 Issues"** in the failure screenshot — these correspond to the two `console.error` calls captured by the webServer log (both originating from `fetchPermissions` in `src/stores/auth-store.ts:95`).

### Per-route status

Same as the first run: only `/sign-in` was reached. All 9 post-auth routes were skipped.

| Route | Status |
| --- | --- |
| `/sign-in` | Rendered OK (200) |
| `/dashboard` | NOT REACHED |
| `/observations` | NOT REACHED |
| `/correspondence/letters` | NOT REACHED |
| `/correspondence/feed` | NOT REACHED |
| `/reports/executive` | NOT REACHED |
| `/reports/risks` | NOT REACHED |
| `/calendar` | NOT REACHED |
| `/team/directory` | NOT REACHED |
| `/settings` | NOT REACHED |

### Console errors (deduped)

Two console errors, both identical content, emitted from `src/stores/auth-store.ts:95` — once via `signIn()` (auth-store.ts:204) and once via `setSessionUser()` (auth-store.ts:298):

```
[auth-store] fetchPermissions error {
  code: 'PGRST200',
  details: "Searched for a foreign key relationship between 'user_roles' and 'role_id' in the schema 'public', but no matches were found.",
  hint: "Perhaps you meant 'roles' instead of 'role_id'.",
  message: "Could not find a relationship between 'user_roles' and 'role_id' in the schema cache"
}
```

Stack (deduped):
- `fetchPermissions (src/stores/auth-store.ts:95:13)` → `signIn (src/stores/auth-store.ts:204:36)` → `onSubmit (src/app/(auth)/sign-in/page.tsx:55:20)`
- `fetchPermissions (src/stores/auth-store.ts:95:13)` → `setSessionUser (src/stores/auth-store.ts:298:36)`

Note: these errors were captured from the Next.js webServer pipe (browser-side logs forwarded to the dev server console). Playwright's `page.on('console')` did not fire because the test timed out before the page settled and the `console.error` call happens after the relevant promise rejects.

### Network 5xx (deduped)

None captured. The PostgREST error is returned as a structured `PGRST200` JSON body — likely with HTTP 400 (not 5xx). The test's `r.status() >= 500` filter does not match.

### Triage groups

#### Group A — `user_roles.role_id` foreign-key relationship missing from PostgREST schema cache (BLOCKING)

**Symptom**: After successful `auth.signInWithPassword`, `fetchPermissions(userId)` runs a PostgREST query that uses embedded-resource syntax to join `user_roles` to `roles` via `role_id`. PostgREST replies:

```
code:    PGRST200
message: Could not find a relationship between 'user_roles' and 'role_id' in the schema cache
hint:    Perhaps you meant 'roles' instead of 'role_id'.
details: Searched for a foreign key relationship between 'user_roles' and 'role_id' in the schema 'public', but no matches were found.
```

**Likely root causes** (in order of probability):

1. **The embedded-resource hint name in the `.select()` is wrong.** PostgREST resolves embeds by matching either (a) the foreign-key constraint name, (b) the related-table name, or (c) the foreign-key column name. The hint "Perhaps you meant 'roles' instead of 'role_id'" suggests the query is using the column name `role_id` as the embed hint, but the FK constraint resolves under `roles` instead. Typical fix is to change `.select('..., role_id:roles(...)')` style or use `roles!user_roles_role_id_fkey(...)`. (Source-level — no DB change.)
2. **The `user_roles.role_id → roles.id` foreign-key constraint does not exist** in the current Supabase database, even though the column is present. A migration may have created the column without `REFERENCES roles(id)`. Fix would be to add the FK and call PostgREST's schema reload (or it will refresh on next deploy).
3. **The FK exists but PostgREST's schema cache is stale.** Less likely on a fresh project, but `NOTIFY pgrst, 'reload schema';` would resolve it.

**Where to look**:
- `src/stores/auth-store.ts:73-100` — the exact `.from('user_roles').select(...)` shape will reveal which embed-hint name is being used.
- `supabase/migrations/*` — search for `create table .* user_roles` and check whether `role_id` has a `references roles(id)` clause.
- `mcp__supabase__execute_sql` with `select conname, conrelid::regclass, confrelid::regclass from pg_constraint where conrelid = 'public.user_roles'::regclass and contype = 'f';` to enumerate FKs.

#### Group B — Sign-in handler does not navigate on permissions-fetch failure (secondary)

Even though `fetchPermissions` returns `[]` on error (it doesn't re-throw), the sign-in page never navigates to `/dashboard`. Either:
- `signIn()` swallows the permissions error but still resolves with `success: false` / `error: <something>`; or
- The router push is gated on `permissions.length > 0` somewhere in `onSubmit`.

This is a UX bug but is downstream of Group A — fixing Group A should unblock navigation. Worth a code-read of `src/app/(auth)/sign-in/page.tsx:55` and `src/stores/auth-store.ts:204` to confirm.

### Final outcome

**FAIL** — Smoke test is still blocked at sign-in, but the original Supabase auth-server schema error is **resolved**. New blocker is application-level: a PostgREST embed query against `user_roles` cannot resolve the `role_id` relationship hint. No post-auth route was exercised.

---

## Re-run #3 (after RBAC FK + auth-store query fix)

**Date**: 2026-05-16
**Result**: **PASS** — sign-in completes, all 9 post-auth routes load with no console errors and no 5xx responses.

Fixes applied since Re-run #2:
1. Migration `023_rbac_foreign_keys` added FK constraints so PostgREST can embed `user_roles → roles → role_permissions → permissions`.
2. `src/stores/auth-store.ts` `fetchPermissions` query changed from `roles:role_id(...)` to `roles:role_key(...)`.

### Sign-in outcome

- `supabase.auth.signInWithPassword(...)` succeeds.
- Post-auth `fetchPermissions` PostgREST embed resolves cleanly — no `PGRST200` error.
- `page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))` resolves; the test proceeds to navigate all 9 routes.
- Total test runtime: **38.6s** (1 test, 1 worker).

### Per-route status

All 9 routes returned the expected page title `ComplianceOS - Governance, Risk & Compliance Platform`.

| Route | Status | Title |
| --- | --- | --- |
| `/sign-in` | OK (auth flow) | n/a |
| `/dashboard` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/observations` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/correspondence/letters` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/correspondence/feed` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/reports/executive` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/reports/risks` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/calendar` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/team/directory` | OK | ComplianceOS - Governance, Risk & Compliance Platform |
| `/settings` | OK | ComplianceOS - Governance, Risk & Compliance Platform |

### Console errors (deduped)

**None.** Playwright's `page.on('console')` captured zero `console.error` messages across all 9 routes. The Playwright assertion `expect(consoleErrors).toHaveLength(0)` passed without producing the `CONSOLE ERRORS:` log line.

### Network 5xx (deduped)

**None.** Zero HTTP responses with status >= 500 across all routes. The assertion `expect(networkErrors).toHaveLength(0)` passed without producing the `NETWORK 5xx:` log line.

### Triage groups

No triage groups required — no errors observed.

- **Group A (RBAC FK / embed)**: RESOLVED. The combination of `023_rbac_foreign_keys` + the `roles:role_key(...)` query change eliminates the `PGRST200 "Could not find a relationship between 'user_roles' and 'role_id'"` error from Re-run #2.
- **Group B (sign-in navigation gated on permissions)**: RESOLVED transitively. With `fetchPermissions` now succeeding, the sign-in handler proceeds to `/dashboard` without intervention.

### Final outcome

**PASS** — Smoke test green end-to-end:
- Sign-in completes against the local Supabase instance.
- All 9 post-auth routes navigate to a 200 page with the correct title.
- No browser-console errors emitted.
- No 5xx HTTP responses observed.
- Test: `tests/e2e/smoke.spec.ts` — `1 passed (43.0s)`.

Artifacts:
- `/tmp/playwright-run3.log` — full reporter output (preserved by `tee`).
