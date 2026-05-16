# Phase 10 — Migration Replay to New Supabase Project

## Project Info

- **Project ref**: `qdbitfgxbnbzkqhdoepd`
- **Project name**: complianceos
- **Region**: eu-central-1
- **Postgres**: 17
- **URL**: https://qdbitfgxbnbzkqhdoepd.supabase.co

## Migration Apply Log

All 24 migrations applied successfully on the first attempt.

| # | Migration | Result |
|---|-----------|--------|
| 1 | 001_extensions_and_helpers | ok |
| 2 | 002_auth_and_rbac | ok |
| 3 | 003_system_lookups | ok |
| 4 | 004_organization_config | ok |
| 5 | 005_correspondence_letters | ok |
| 6 | 006_correspondence_generic | ok |
| 7 | 007_policies_circulars | ok |
| 8 | 008_audits_observations | ok |
| 9 | 009_risks | ok |
| 10 | 010_training | ok |
| 11 | 011_calendar_messages_notifications | ok |
| 12 | 012_audit_logs_append_only | ok |
| 13 | 013_compliance_scoring | ok |
| 14 | 014_jobs | ok |
| 15 | 015_triggers | ok |
| 16 | 016_rls_policies | ok |
| 17 | 017_indexes | ok |
| 18 | 018_seed_data | ok |
| 19 | 019_harden_functions | ok |
| 20 | 021_i18n_bilingual_columns | ok |
| 21 | 022_i18n_seed_ar | ok |
| 22 | 023_rbac_foreign_keys | ok |
| 23 | 024_admin_seed | ok |
| 24 | 030_settings_onboarding_state | ok |

**Total**: 24 applied / 0 failed.

## Final Table Count

`select count(*) from pg_tables where schemaname='public'` -> **97** tables (exact match to expected).

## Storage

- Bucket `pdf-renders` created (public=false).
- Policy `authenticated_read_pdfs` created on `storage.objects` (SELECT to authenticated, bucket_id='pdf-renders').

## Admin User

Verification query:
```sql
SELECT u.id, u.email, p.role, ur.role_key, u.confirmation_token IS NOT NULL AS ct_not_null
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'admin@complianceos.local';
```

Result:
- id: `c5a105da-4b42-4152-abbc-af517e8c70cc`
- email: admin@complianceos.local
- profiles.role: `org_admin`
- user_roles.role_key: `org_admin`
- confirmation_token IS NOT NULL: true (tokens populated as empty strings per GoTrue requirement)

## Security Advisors

| Level | Count |
|-------|-------|
| ERROR | 0 |
| WARN | 15 |

WARN breakdown (all expected / known patterns):
- 2x `extension_in_public` (citext, pg_trgm — by design per migration 001)
- 11x `rls_policy_always_true` on append-only timeline INSERT policies + 2 message-thread policies — these are the documented append-only / membership-gated patterns from migration 016
- 2x `authenticated_security_definer_function_executable` (claim_jobs, has_permission — by design)
- 1x `auth_leaked_password_protection` (project-level Auth setting, not a migration concern)

No new ERROR-level findings.

## .env.local Updated

```
NEXT_PUBLIC_SUPABASE_URL=https://qdbitfgxbnbzkqhdoepd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_h6d_E4KjMPUlSaoTsn_IGA_Z7ATQBYT
```

`SUPABASE_SERVICE_ROLE_KEY` left blank (user pastes manually from Studio).

## Re-run #4 — Playwright Smoke

**Result: FAIL** (2x HTTP 400 console errors — page loads themselves all succeeded)

All 9 routes successfully rendered with the correct page title:
- /dashboard
- /observations
- /correspondence/letters
- /correspondence/feed
- /reports/executive
- /reports/risks
- /calendar
- /team/directory
- /settings

But two 400-status network calls leaked into console:
```
Failed to load resource: the server responded with a status of 400 ()
Failed to load resource: the server responded with a status of 400 ()
```

The test asserts `consoleErrors.toHaveLength(0)`, so it failed at line 46 of `tests/e2e/smoke.spec.ts`.

These 400s are likely PostgREST queries that worked against the old project but are mis-shaped against the freshly-replayed schema (no specific resource was logged — only the status code surfaced into the console). Diagnosis is out-of-scope for this phase (replay only); the orchestrator will pick this up.

Log: `/tmp/playwright-newproject.log`
Screenshot: `test-results/smoke-sign-in-then-dashboard-then-key-pages-load/test-failed-1.png`
Test exit code: 0 (Playwright always exits 0 with `--reporter=list` even on failure — failure count = 1).

