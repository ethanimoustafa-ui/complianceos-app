# ComplianceOS Backend — Handoff Doc

> **You (the AI session reading this):** you are inheriting a substantially-built Next.js + Supabase backend. The previous session executed Phases 0–10. **Read this whole document before doing anything.** Then read `BACKEND-API-MAP.md` (the source of truth) and skim `.planning/01–16` for any phase whose context you need.
>
> **Bias toward delegation.** The previous session used parallel sub-agents heavily to preserve context. You should do the same — see §6 "Agent fan-out plan" for the next-phase parallelization.
>
> **Date of handoff:** 2026-05-16.

---

## 0. Resume protocol — the first 3 things you do

1. **Verify environment.** Run these in parallel:
   ```
   mcp__supabase__list_projects                    # expect: complianceos (ref qdbitfgxbnbzkqhdoepd) in org ivlyynjqxywmqkzhykaa
   mcp__plugin_vercel_vercel__list_teams           # expect: Hani's projects (team_bIlvjR33ROebAKZhPkE5aj6a)
   git status --short                              # expect: clean if last commit landed; otherwise WIP
   cat .env.local                                  # confirm NEXT_PUBLIC_SUPABASE_URL points at qdbitfgxbnbzkqhdoepd
   ```
   If any of those don't match, **stop and ask the user.** The accounts and project refs are load-bearing.

2. **Verify schema is intact.** `mcp__supabase__list_tables` with schemas=['public'], expect 97 tables. If less, the migration replay needs to be redone — see §5.

3. **Run the smoke test** to capture the current bug state:
   ```bash
   npx playwright test --reporter=list
   ```
   Test admin: `admin@complianceos.local` / `ComplianceOS!2026`. Latest known state: 9 pages render, **2 console 400s** are blocking the assertion (see §4 first item — this is your first triage task).

4. After those three, you have ground truth. **Then** read the rest of this doc.

---

## 1. What's built

10 phases shipped. Don't redo any of this.

| Phase | Status | What landed |
|---|---|---|
| 0. Discovery | ✅ | 4 docs in `.planning/` (backend spec extract, all 41 Zustand stores mapped, all 33 pages mapped, scope + PDF design) |
| 1. Synthesis | ✅ | `BACKEND-API-MAP.md` — 1577-line source of truth covering schema, RBAC, API surface, caching, audit log, scoring, PDF, i18n |
| 2. Schema | ✅ | 24 migrations in `supabase/migrations/`, 97 tables, 100% RLS, append-only audit log, 4-role × 25-perm RBAC, 11 frameworks + 10 departments seeded (en + ar) |
| 3. Auth | ✅ | `@supabase/ssr` wired, root `middleware.ts` gates `/(dashboard)/*`, real `useCan`, 5 auth pages converted, mock auth-store retired (legacy method names preserved as shims) |
| 4. API | ✅ | 146 route files, ~217 endpoints, shared service layer at `src/lib/api/*`, audit-log writes, cache tags, Zod validation |
| 5. Stores | ✅ | All ~40 Zustand stores migrated from persist+seeds to server-state via shared `api` client (`src/lib/api-client.ts`); consumer-page sync→async cascade reconciled |
| 6. Scoring | ✅ | `compliance-engine.ts` + `dashboard-health.ts` moved to `src/lib/api/services/scoring/`; `/api/compliance/score` + `/api/compliance/dashboard-health` cached in `compliance_scores_cache` |
| 7. PDF | ✅ | `@react-pdf/renderer` pipeline (xelatex deferred — won't fit on Vercel free 50MB function limit; documented migration path in `.planning/13-pdf-pipeline.md`); 9 templates; async job queue; `pdf-renders` storage bucket; cron worker at `/api/cron/jobs-run` |
| 8. i18n DB | ✅ | `name_en` + `name_ar` on lookups, AR translations for 11 frameworks + 10 depts seeded, server `localizeName()` + client `useLocalizedName()` helpers |
| 9. Smoke #1 | ✅ | Playwright smoke against localhost — initially failed, fixed two real bugs (GoTrue NULL-token + missing RBAC FKs), then PASSED on the original project |
| 10. Account migration | ✅ | Re-created project on the GitHub-linked Supabase account (`qdbitfgxbnbzkqhdoepd` in `ivlyynjqxywmqkzhykaa`); all 24 migrations replayed; old project (`pamfhghrjfizlbhdfycu`) flagged for manual deletion by user from Studio |

---

## 2. Project identity (load-bearing facts)

| What | Value |
|---|---|
| Supabase project ref | `qdbitfgxbnbzkqhdoepd` |
| Supabase project URL | `https://qdbitfgxbnbzkqhdoepd.supabase.co` |
| Supabase org | `ivlyynjqxywmqkzhykaa` (`ethanimoustafa-ui's Org`) |
| Supabase region | eu-central-1 (Frankfurt — closest free-tier to KSA; me-central not available) |
| Vercel team | `team_bIlvjR33ROebAKZhPkE5aj6a` (`Hani's projects`, slug `hani-s-projects3`) |
| GitHub remote | `https://github.com/ethanimoustafa-ui/complianceos-app.git` |
| Branch | `main` |
| Test admin (local) | `admin@complianceos.local` / `ComplianceOS!2026` (id `c5a105da-4b42-4152-abbc-af517e8c70cc`, role `org_admin`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **BLANK in .env.local** — user must paste from Studio → Project Settings → API → service_role |
| TTF fonts for PDF | Present at `public/fonts/static-amiri/` (4 Amiri TTFs) and `public/fonts/static-inter/` (full Inter family, 18/24/28pt × all weights). Registry uses `Inter_18pt-{Regular,Medium,Bold}` + `Amiri-{Regular,Bold,Italic,BoldItalic}` |

---

## 3. Constraints — never violate

1. **Single-tenant MVP.** Do not add `tenant_id` columns or tenant-scoping RLS. When the platform moves to multi-tenant later, schema can absorb `tenant_id NOT NULL` via migration. Don't preemptively design for multitenancy.
2. **Vercel free tier.** 50MB unzipped function size, 1/day cron minimum on Hobby. Do NOT introduce: Puppeteer/Chromium, xelatex, anything else that breaks the size budget.
3. **Supabase free tier.** Tight on request quotas. **Request minimization is the highest-impact perf work right now** — see §4.
4. **Append-only audit log enforced at DB role level.** `audit_logs` and 8 timeline tables have `REVOKE UPDATE/DELETE` + before-update triggers. Don't try to "fix" the `rls_policy_always_true` advisor warnings on those — they're intentional (any authenticated user must INSERT, the mutation lockdown comes from DB roles, not RLS).
5. **`has_permission()` lives in `public`**, not `auth`. Supabase managed projects deny CREATE FUNCTION in `auth` schema. Every RLS policy calls `public.has_permission(...)`.
6. **`sama_letters` table name retained** (not generalised to `letters`) for frontend-store compatibility. An `authority` FK column generalizes it for CMA/IA/etc.
7. **No `requirements` table for MVP.** `/correspondence/regulatory-updates/rules` reads `circulars`. Deferred per BACKEND-API-MAP §13.3.
8. **Sign-up disabled.** `/sign-up` page is now a "contact admin" notice. Admins invite users (and once `SUPABASE_SERVICE_ROLE_KEY` is set, the `POST /api/team/members/invite` endpoint becomes functional).
9. **PDF engine is `@react-pdf/renderer`.** xelatex is documented as the post-pilot migration. Don't swap engines unless explicitly asked.
10. **Don't reintroduce mock seed data.** All stores are now server-backed. The frontend may show empty states until the user creates real records — that's correct behavior.

---

## 4. Outstanding TODOs — prioritized

### 🔴 Critical (block production)

1. **Two HTTP 400s in console on dashboard load** — captured but undiagnosed in Phase 10's re-run #4 smoke. The 9 pages render but two PostgREST queries return 400. Likely candidates: (a) `compliance_scores_cache` write — same RLS issue identified in Phase 9 logs on the old project (the cache table refuses authenticated writes, so the scoring engine recomputes every request); (b) some other schema-shape mismatch the previous session never traced. **Your first task:** run the smoke, capture the request URLs that 400ed (Playwright `response` event includes the URL; the original test only logged 5xx), then patch.

2. **`compliance_scores_cache` writes blocked by RLS.** Server-side scoring (Phase 6) tries to write to the cache via the user's RLS-bound client and fails with 403/400. This means **every dashboard load recomputes from scratch by querying 7+ source tables**. Fix path (any one of): (a) route the cache write through a service-role client; (b) add an RLS policy allowing authenticated INSERT/UPDATE on the cache table; (c) make `set_compliance_cache(...)` a SECURITY DEFINER function and call it via RPC.

3. **10 missing storage buckets.** Tables `audit_documents`, `observation_documents`, `sama_letter_attachments`, `policy_attachments`, `policy_evidence`, `correspondence_attachments`, `circular_remediation_attachments`, `circular_cap_attachments`, `article_attachments`, `reports` all have `storage_path` columns pointing at buckets that don't exist. Only `pdf-renders` exists today. **Until these are created with per-user RLS + MIME whitelists + size limits, all file uploads will 404.**

4. **No MIME-type whitelisting or size limits** on any bucket. Even `pdf-renders` accepts anything. Need per-bucket `allowed_mime_types` + `file_size_limit` (suggest 20 MB default; 50 MB for evidence/documents; 5 MB for avatars).

5. **Auth-fetch loop — 20–24× duplicate queries per page load.** From Phase 9 logs: `profiles?id=eq.<admin>` queried 24×, `user_roles?...embed(permissions)` queried 20×, `role_permissions` queried 3× from server per page. The intended `react.cache()` memoization in `src/lib/api/auth.ts requireUser()` works per-request but not across multiple Route Handler calls in the same page render. Fix: stuff role + permissions into the Supabase JWT via a [custom access token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook), so the server reads them from the JWT instead of re-querying.

### 🟡 Important (before pilot)

6. **Leaked-password protection disabled.** Toggle on in Studio → Authentication → Policies → "Leaked password protection" (HaveIBeenPwned integration).
7. **Rate limiting** not wired. BACKEND-API-MAP §10 specifies Upstash Redis via Marketplace. Install + wire `@upstash/ratelimit` against the 5 most-hit endpoints (sign-in attempts, create-resource POSTs).
8. **CORS lockdown.** Default Supabase CORS is `*`. Before production, restrict to the Vercel production domain. Project Settings → API → CORS Origins.
9. **Pre-aggregate scoring inputs into a single SQL function.** The scoring engine queries audits/observations/risks/policies/circulars/training_courses/sama_letters in 7 separate roundtrips. Replace with one `compute_compliance_inputs(period_start, period_end, department_id)` SQL function returning a JSONB of all source slices — 1 roundtrip instead of 7.
10. **Vercel cron is 1/day on Hobby tier**, but `vercel.json` has `*/1 * * * *`. Either upgrade to Pro or change PDF/job runner to client-poll on demand (the `/api/cron/jobs-run` route accepts manual GET calls if `CRON_SECRET` matches — frontend can trigger it after enqueueing a PDF job).
11. **Two unfixed legacy auth-store TODOs from Phase 3** (see `.planning/06-auth-status.md` §"Left for the next phase"): wire `useAuthStore.updateProfile()` to persist via Supabase, and capture IP/device in `user_activity_logs` inserts.
12. **Onboarding submit handlers** still write to local Zustand only — Phase 3 noted; needs wiring to `/api/settings/onboarding/*` endpoints.

### 🟢 Nice-to-have

13. Move `citext` + `pg_trgm` extensions out of `public` schema (advisor warns; cosmetic).
14. Drop the `team.switchUser` translation keys (legacy from the demo "Acting As" feature that was removed in Phase 3).
15. Virus scanning on uploaded files (defer to post-pilot).
16. MFA enrolment UI under `/settings/security` (Supabase Auth supports TOTP natively; just needs the React form).
17. OAuth provider buttons on sign-in (Google/Microsoft are static UI; wire `supabase.auth.signInWithOAuth(...)` once providers are configured in dashboard).

---

## 5. Critical gotchas — learn from the past session's pain

These all bit the previous session. Don't get bitten again.

1. **GoTrue cannot scan NULL token columns on `auth.users`.** When inserting a user directly via SQL (bypassing the Auth admin API), `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change_token_current`, `phone_change_token`, `email_change`, `phone_change`, `reauthentication_token` MUST be empty strings, not NULL. Migration `024_admin_seed.sql` does this correctly. Reference for the future: error message is `"sql: Scan error on column index 3, name 'confirmation_token': converting NULL to string is unsupported"` → surfaces in the client as `"Database error querying schema"`.

2. **`user_roles` uses `role_key text` (FK to `roles.key`), NOT `role_id uuid`.** Same for `role_permissions.role_key` + `role_permissions.permission_key`. PostgREST embedding hint is `roles:role_key(...)`, not `roles:role_id(...)`. Migration `023_rbac_foreign_keys.sql` added the FK constraints that PostgREST needs for auto-embedding.

3. **`handle_new_user()` trigger on `auth.users` INSERT auto-creates a `profiles` row.** When seeding an admin, INSERT into `auth.users` then UPDATE `profiles` (don't try to INSERT into both — you'll hit a PK conflict).

4. **`profiles.role` is CHECK-constrained** to `('viewer','auditor','compliance_officer','org_admin')`. Don't use `'admin'` — it's `'org_admin'`.

5. **PostgREST schema cache is sticky.** After adding/changing FKs, `NOTIFY pgrst, 'reload schema';` is in migration 023 — copy that pattern for any future FK-adding migration.

6. **The auth-store keeps legacy method names as shims** (`login: signIn`, `logout: signOut`, `setUser: setSessionUser`, etc.). Don't "clean these up" — 33 consumer files depend on them. The migration plan says they can be retired in a future polish pass, not now.

7. **Append-only timeline INSERT policies use `WITH CHECK (true)`** on purpose. Advisor flags them as `rls_policy_always_true`. The actual lockdown is the BEFORE UPDATE trigger + the `REVOKE UPDATE,DELETE,TRUNCATE FROM authenticated, anon, service_role` grant pattern. **Don't restrict the INSERT policy** — you'll break audit logging.

8. **The previous Phase 9 agent hit Anthropic's per-account rate limit** at ~11 min into a long agent run. If you spawn deep-running agents, watch for `"You've hit your limit · resets HH:MMam"` in the agent's final result — when this happens, the agent did nothing useful and needs to be respawned after the reset window.

9. **The Playwright `webServer` config auto-starts `npm run dev`** with `reuseExistingServer: true`. First compile takes 60–90s. If you re-run smokes back-to-back, the second one is fast.

---

## 6. Agent fan-out plan — the next phase

The 🔴 + 🟡 items above split cleanly into 3 disjoint workstreams. **Spawn them in parallel.** They touch non-overlapping files.

### Agent S — Security & Storage pack
**Files it touches:** `supabase/migrations/025_storage_buckets.sql`, `supabase/migrations/026_compliance_cache_write.sql`, applied via `mcp__supabase__apply_migration`. Also the small `.env.local` note.
**Scope:**
- Create 10 storage buckets (`audit_documents`, `observation_documents`, `sama_letter_attachments`, `policy_attachments`, `policy_evidence`, `correspondence_attachments`, `circular_remediation_attachments`, `circular_cap_attachments`, `article_attachments`, `reports`). Per-bucket: `allowed_mime_types` whitelist (PDFs, common images, common Office MIME types), `file_size_limit` (20 MB default — 50 MB for evidence buckets, 5 MB for avatars).
- For each bucket: 3 RLS policies — authenticated SELECT (scoped by ownership / shared via the parent entity's RLS), authenticated INSERT (writes own files), authenticated DELETE (own files only). Pattern matches the `pdf-renders` SELECT policy already in `migrations/`.
- Fix `compliance_scores_cache` write path: easiest is **option (b)** — add an RLS policy `compliance_scores_cache_authenticated_write` for INSERT/UPDATE/DELETE that any authenticated user can run (the table is a cache, not a security surface; the inputs hash is the dedup key).
- Enable leaked-password protection in Studio via the `mcp__supabase__execute_sql` tool if the project-level config is reachable; otherwise document the manual toggle for the user.
- Tighten CORS — restrict to localhost + future Vercel domain.

### Agent P — Performance pack
**Files it touches:** `src/lib/api/auth.ts`, possibly a new `src/lib/api/services/scoring/inputs.sql` + a Supabase migration, possibly a Supabase auth hook config.
**Scope:**
- Eliminate the 20× auth-fetch loop. Best fix: add a Supabase Custom Access Token Hook that injects `role` + `permissions[]` into the JWT, and rewrite `requireUser()` to read from the JWT instead of querying `profiles` + `user_roles` + `role_permissions`. Fallback if hook setup is too involved: aggressively cache the result of `requireUser()` in a per-request module-level Map keyed by user id with a 60s TTL.
- Pre-aggregate scoring inputs: write a `compute_compliance_inputs(p_period_start timestamptz, p_period_end timestamptz, p_department_id uuid DEFAULT NULL)` SECURITY DEFINER SQL function returning a single JSONB with all required slices. Update `gather-inputs.ts` to do one RPC call instead of 7 selects.
- Add explicit `Cache-Control: s-maxage=3600` + cacheTag on every settings/lookup endpoint that doesn't already have it (frameworks, departments, business_units, all categories, all letter sub-types).

### Agent T — Playwright + log-driven validation
**Files it touches:** `tests/e2e/smoke.spec.ts` (extend, don't replace), maybe `tests/e2e/crud.spec.ts` (new), `tests/e2e/request-budget.spec.ts` (new).
**Scope:**
- **Extend smoke** to capture ALL non-2xx network responses (not just 5xx) and dump them to the failure log so the next failure is debuggable in one pass. The current test silently drops 400s.
- **Add a request-budget test** that loads each page and asserts `requestCount[page] < N` (start with N=20 per page; the current count is 30–50). Use Playwright's `page.on('request')` to count Supabase + `/api/*` calls. This test FAILS the build if a regression doubles the request count.
- **Add 5 CRUD-flow tests** covering the highest-priority modules: (a) create observation → assign → close; (b) create letter → submit for approval → approve all steps → send; (c) create policy → publish version; (d) create audit → add task → complete; (e) invite team member (requires service-role key — skip if env unset, but at least assert the 503 surfaces a useful error).
- **After each Playwright run, pull `mcp__supabase__get_logs({service: 'api'})`** and append a section to the run report counting requests by endpoint. This is how Agent P knows whether its perf fixes actually landed.

### Coordination
- All 3 can run in parallel — they touch disjoint files.
- After all 3 finish, run a final integrated smoke and re-pull API logs. Target: zero 4xx, < 20 requests/page, < 2s p95 page load against localhost.

---

## 7. Document index — read these instead of re-discovering

| Path | What's in it |
|---|---|
| `BACKEND-API-MAP.md` | **Source of truth.** 1577 lines. All schema, all endpoints, all RBAC, caching strategy, PDF plan, i18n strategy, decisions log. Read §1 (decisions) and §13 (orchestrator-resolved questions) first. |
| `.planning/01-backend-spec-extract.md` | Extract from the original 2172-line spec script. Verbatim DDL fragments. |
| `.planning/02-stores-map.md` | Every Zustand store with state shape, actions, and "BACKEND IMPLICATIONS" subsection (which table maps to it). |
| `.planning/03-pages-and-api-needs.md` | Per-route store usage + deep-link params + pagination defaults. |
| `.planning/04-scope-and-pdf-design.md` | Scope summary, 14 modules, PDF templates, regulatory pins. |
| `.planning/05-migration-status.md` | Phase 2 migration apply report. |
| `.planning/06-auth-status.md` | Phase 3 auth wiring report — has the admin user creation steps if `024_admin_seed.sql` ever needs to run manually. |
| `.planning/07-api-pattern.md` | Phase 4 API conventions. Read this before writing any new Route Handler. |
| `.planning/08-api-*.md` (4 files) | Per-resource-group API status from the 4 parallel agents. |
| `.planning/09-store-pattern.md` | Phase 5 Zustand-migration conventions. |
| `.planning/10-stores-migrated-group-*.md` (4 files) | Per-group store migration reports. |
| `.planning/11-stores-reconciliation.md` | The 13 cascading TS errors from sync→async conversion + their fixes. |
| `.planning/12-scoring-port.md` | Phase 6 scoring engine port. |
| `.planning/13-pdf-pipeline.md` | Phase 7 PDF pipeline + the xelatex migration path. |
| `.planning/14-i18n-strategy.md` | Phase 8 i18n policy + which lookup endpoints localize server-side. |
| `.planning/15-localhost-smoke.md` | Phase 9 smoke history. **Has the 2 PostgREST 400 evidence trail.** |
| `.planning/16-migration-replay.md` | Phase 10 account migration report. |
| `latex-pdf-generation-design.md` (root) | The original LaTeX design doc — superseded by Phase 7's `@react-pdf/renderer` swap, but still useful as the template inventory. |
| `scope/ComplianceOS — Technical Concerns.txt` | 5 technical pushbacks from the original engineer — read this before deviating from any of: xelatex mandate (we deviated, documented), append-only audit log, scoring-engine port to server, residency. |

---

## 8. What NOT to do

- **Don't redo discovery.** All 41 stores, all 33 pages, the full spec — already mapped. Read the 4 docs.
- **Don't change RLS policies on append-only timelines** without understanding the `REVOKE UPDATE/DELETE` + trigger pattern (§5 gotcha #7).
- **Don't add `tenant_id`** — see §3 constraint #1.
- **Don't replace `@react-pdf/renderer`** with anything heavier — see §3 constraint #9.
- **Don't commit `.env.local`, `.env*`, `node_modules/`, `test-results/`, `playwright-report/`, `.next/`, `.vercel/`, `*.tsbuildinfo`.** `.gitignore` covers these. The `public/fonts/static-amiri/` and `public/fonts/static-inter/` directories are intentionally tracked — they ship with the repo (OFL-licensed, see `public/fonts/README.md`).
- **Don't `git push --force`** to main. Always inspect `git status` + `git remote -v` before pushing.
- **Don't try to delete the old Supabase project (`pamfhghrjfizlbhdfycu`)** via MCP — it's on a different account and not reachable. User deletes it manually from Studio.

---

## 9. Quick-glance metrics

- **97** public tables, **100%** RLS coverage, **0** ERROR advisors, **15** WARN advisors (all intentional)
- **24** migration files, **146** Route Handler files, **~217** API endpoints
- **41** Zustand stores migrated to server-state, **9** kept client-only (language, help, UI state)
- **25** RBAC permissions, **4** roles, **54** role→permission grants
- **11** frameworks + **10** departments seeded (en + ar)
- **9** PDF templates (`sama-letter`, `audit-report`, `compliance-report`, `risk-register`, `observation-list`, `policy-export`, `correspondence-tracker`, `training-report`, `calendar-export`)
- Smoke pass criteria: 9 routes load, 0 console errors, 0 ≥4xx network responses.

---

## 10. Final note to the next AI

The user is non-technical-adjacent (compliance domain, GRC for Saudi banks) but understands product flow. They prefer:
- Working autonomously after a kick-off — don't pause for trivial choices, just make them and explain.
- Bias toward agents over doing-it-yourself for anything mechanical, to preserve your context window.
- When you see a real gap (like the 400s + storage buckets in §4), say so plainly with severity. Don't downplay.
- Single-tenant MVP for the compliance-department pilot — they will scale to multi-tenant later.
- Free tier on both Vercel and Supabase. Minimize requests aggressively. Skeleton loading on every dashboard page (Phase 9 added the pattern; verify it's applied per-page when you build new ones).

When in doubt, read `BACKEND-API-MAP.md` and check the relevant `.planning/0X` doc. Good luck.
