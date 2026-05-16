# ComplianceOS Migration Status

**Target project:** `pamfhghrjfizlbhdfycu` (complianceos, eu-central-1, Postgres 17)
**Applied:** 2026-05-15
**Result:** All 18 planned chunks + 1 hardening chunk applied successfully.

## Migrations applied

| # | Name | Status |
|---|---|---|
| 001 | `extensions_and_helpers` | OK |
| 002 | `auth_and_rbac` | OK (note: `has_permission()` placed in `public` schema, not `auth` — Supabase forbids creating functions in the `auth` schema). |
| 003 | `system_lookups` | OK |
| 004 | `organization_config` | OK |
| 005 | `correspondence_letters` (`sama_letters` + templates + approval steps + timeline + attachments + observation junction) | OK |
| 006 | `correspondence_generic` | OK |
| 007 | `policies_circulars` | OK |
| 008 | `audits_observations` | OK |
| 009 | `risks` | OK |
| 010 | `training` | OK |
| 011 | `calendar_messages_notifications` (+ reports, user_activity_logs, help, compliance_evaluations) | OK |
| 012 | `audit_logs_append_only` (+ audit_admin role, block_update trigger, REVOKE U/D, audit_admin DELETE grant) | OK |
| 013 | `compliance_scoring` cache | OK |
| 014 | `jobs` (+ `claim_jobs(batch_size)` SECURITY DEFINER with FOR UPDATE SKIP LOCKED) | OK |
| 015 | `triggers` (compliance-cache invalidation + auth.users → profiles handler) | OK |
| 016 | `rls_policies` (RLS enabled on 100% of public tables; ~140 policies) | OK |
| 017 | `indexes` (pg_trgm GIN + created_at desc partials) | OK |
| 018 | `seed_data` (4 roles, 25 perms, 54 role→perm mappings, 11 frameworks, 10 default depts, singletons) | OK |
| 019 | `harden_functions` (search_path pinned, REVOKE EXECUTE from anon on SECURITY DEFINER) | OK |

## Database stats

- **Total public tables:** 97
- **Frameworks seeded:** 11 (SAMA, CMA, IA, NCA ECC, ZATCA, MISA, SAFIU, PDPL, COSO IC, ISO 27001, Sharia Board)
- **Default departments:** 10
- **Roles:** 4 (`viewer`, `auditor`, `compliance_officer`, `org_admin`)
- **Permissions:** 25
- **Role→permission grants:** 54 (5 + 9 + 15 + 25 = matrix per BACKEND-API-MAP §3.2)
- **Tables with RLS enabled:** 97 / 97
- **Tables with RLS enabled but zero policies:** 0

## Append-only enforcement

The following 9 tables have:

1. A BEFORE UPDATE trigger raising an exception (`public.block_append_only_update()`),
2. `UPDATE, DELETE, TRUNCATE` revoked from `authenticated`, `anon`, `service_role`,
3. `public.audit_admin` role granted `DELETE` (used by cron retention purge only),
4. RLS policies with `using (false)` for UPDATE and DELETE (defense-in-depth).

Tables: `audit_logs`, `user_activity_logs`, `observation_timeline`, `policy_activity_log`, `risk_history`, `circular_timeline`, `sama_letter_timeline`, `audit_activity_logs`, `article_timeline`.

## Security advisor warnings (15 WARN, 0 ERROR)

All are accepted / intentional:

- **2 × `extension_in_public`** — `citext` and `pg_trgm` installed in `public`. Supabase default; acceptable.
- **11 × `rls_policy_always_true`** — all on append-only timeline INSERT policies. Intended: any authenticated user must be able to INSERT (audit trail), and UPDATE/DELETE are blocked by trigger + GRANT revoke + `using (false)` policies. Plus one on `message_thread_participants` / `message_threads` admin-add policy which is correct (thread admins manage participants).
- **2 × `authenticated_security_definer_function_executable`** — `public.has_permission(text)` and `public.claim_jobs(integer)`. Both intentionally callable by authenticated users:
  - `has_permission` is the central RLS predicate; it MUST be SECURITY DEFINER to read `role_permissions` and `user_roles` regardless of the caller's privileges.
  - `claim_jobs` is the queue worker entrypoint; authenticated callers invoking it come exclusively from API routes that the service layer validates.

No ERROR-level advisors. RLS coverage is 100%.

## Naming notes / deviations from spec

1. **`has_permission` lives in `public`** (not `auth`) — Supabase managed projects deny CREATE FUNCTION in the `auth` schema. All RLS policies call `public.has_permission(...)`.
2. **`sama_letters` retained as table name** (not renamed to a generic `letters`) — frontend stores already use `useSAMALetterStore`. An `authority` column FK'd to `frameworks(id)` generalizes the table for CMA/IA letters in the same registry. SAMA filter is the UI default.
3. **`tenant_id` removed** from every table per single-tenant MVP constraint.
4. **`UNIQUE(tenant_id, ref_code)` → `UNIQUE(ref_code)`** on policies, circulars, letters, etc.
5. **`audit_logs` is `bigserial`** (not UUID) for monotonic sequence-friendly timestamps and cheap sequential scans.

## Outstanding TODOs (for the next migration / app-code phase)

1. **Service-layer audit-log writes.** Triggers do NOT auto-write to `audit_logs` for domain mutations — this stays in the app layer (`lib/services/_base.ts withAuditLog()`). Per-entity timeline writes (`observation_timeline`, etc.) also stay app-side for cleaner action_type/description shaping.
2. **`requirements` table** — deferred per orchestrator decision §13.3. Add later if `/correspondence/regulatory-updates/rules` needs more than the `circulars` projection.
3. **`framework_pins` seeding** — no rows seeded; UI controls top-3 pin order via PATCH.
4. **`audit_categories`, `policy_categories`, etc. seed rows** — left empty. Frontend seeds defaults on first list-load (see `/lib/stores/*-category-store.ts`).
5. **Storage buckets** — out of scope for this migration. Provision via Supabase Studio before file-upload routes ship.
6. **`audit_admin_actions` table** — created. Cron retention purge SQL not yet written; lives in a separate Vercel Cron route.
7. **MFA enrollment** — schema-ready via Supabase Auth; UI deferred to Phase 2 per §13.5.
8. **Region & residency** — eu-central-1 accepted for MVP per §13.1. Document and revisit at scale.

## How to verify locally

```sql
-- Table count
select count(*) from pg_tables where schemaname = 'public';
-- Expect: 97

-- Seed sanity
select count(*) from public.frameworks;        -- 11
select count(*) from public.departments;       -- 10
select count(*) from public.roles;             -- 4
select count(*) from public.permissions;       -- 25
select count(*) from public.role_permissions;  -- 54

-- Append-only test (should error):
-- update public.audit_logs set status = 'failed' where id = 1;
-- -> ERROR: Table public.audit_logs is append-only; UPDATE not allowed
```

Migration files live in `supabase/migrations/`. Remote migration history is also tracked in `supabase_migrations.schema_migrations` (visible via `mcp__supabase__list_migrations`).
