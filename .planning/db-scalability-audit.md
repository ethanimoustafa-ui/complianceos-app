# ComplianceOS — Database & API Scalability Audit

**Date:** 2026-06-14
**Scope:** Read-only audit of database indexing, API call patterns / redundancy, RLS cost, and storage/archival growth — projected to scale.
**Method:** Supabase advisors + live catalog/`EXPLAIN`/`pg_stat_statements` queries, full static analysis of the service layer & RLS migrations (16-agent workflow, every code-pattern finding adversarially re-verified), and live browser measurement of the running dev server via Playwright (network waterfall + Resource Timing).
**Supabase project:** `complianceos` (`qdbitfgxbnbzkqhdoepd`), Postgres 17, region **eu-central-1 (Frankfurt)**.

---

## 0. The one caveat that frames everything

**The database currently holds only demo-seed data.** Largest table is `audit_logs` at **1,684 rows / 1.16 MB**; `circulars`/`policies` = 1 row, `observations` = 8, `risks` = 2, `users` = 4. Live response bodies are <3 KB.

So **nothing here is slow because of data volume yet.** Today's latency is dominated by per-request **auth round-trips** + Next.js dev compilation. Every finding below is a *scalability projection*: what happens at 10k–1M rows per entity and many concurrent users. Severities reflect scale impact, with current impact called out as "negligible" where true.

---

## 1. Executive summary

The codebase is, on the whole, **disciplined**: list endpoints select explicit column lists (no `select('*')`), per-page decorations are gated to the visible page and index-backed, detail composites fan out with `Promise.all`, document bytes are correctly offloaded to object storage, and a JWT custom-access-token hook already moves RBAC out of the per-request path. This is not a rescue job.

The scaling risks cluster into **four themes**:

1. **Per-request auth is the dominant cost, and the dashboard multiplies it.** Every Route Handler does a network `getUser()` to the Frankfurt auth server; the dashboard fans out to **16 distinct `/api/*` calls on one paint**, and global data is **re-fetched from scratch on every navigation**.
2. **Dashboard KPIs are computed client-side from paginated lists** — silently wrong beyond the page size, and non-scaling.
3. **RLS cost is per-row and systemic** — 35 policies re-evaluate `auth.uid()` per row, 77 duplicate permissive policies, and `has_permission()` runs up to 3 RBAC subqueries with the cheap JWT path checked *last*.
4. **Append-only tables grow forever with no retention** — `audit_logs`/`user_activity_logs`, plus per-entity `*_versions`/`*_timeline`. The infrastructure for retention was provisioned but never wired up.

Plus a handful of bounded, easy wins (42 unindexed FKs, exact-count pagination, an over-fetch, a write-side N+1) and **one security item**: an RLS-bypassing aggregator RPC is directly callable by any authenticated user.

---

## 2. Live measurements (running dev server)

> Dev-mode absolute timings are inflated by Next.js lazy compilation **and** by this machine → Frankfurt round-trips; treat them as relative, not production numbers. The *call counts and patterns* are the reliable signal.

### 2.1 Dashboard first paint = 16 `/api/*` calls
```
/api/settings/departments                      /api/observations?page=1&pageSize=100
/api/team/members?page=1&pageSize=10           /api/risks?page=1&pageSize=100
/api/settings/framework-config                 /api/policies?page=1&pageSize=100&archive_filter=active
/api/calendar/event-types                      /api/training/courses?pageSize=100&_ts=...
/api/compliance/score?...                       /api/training/employees?pageSize=100&_ts=...
/api/compliance/dashboard-health?...            /api/letters?page=1&pageSize=10
/api/audits?page=1&pageSize=10                  /api/correspondence?page=1&pageSize=10
/api/circulars?pageSize=100                     /api/reports/compliance-evaluations?page=1&pageSize=100
```
- Several pull **`pageSize=100` full entity lists** purely to compute counts/breakdowns client-side.
- `training/*` carry a **`_ts=` cache-buster** that defeats every cache layer.
- A second wave of the same GETs fired and were **`ERR_ABORTED`** (React StrictMode double-mount in dev) — harmless in prod but confirms the fan-out fires on mount.

### 2.2 Re-fetch on every navigation
Navigating to `/correspondence` re-pulled **~11 of the same datasets** the dashboard just fetched (departments, team, framework-config, event-types, and full `pageSize=100` lists of circulars/risks/observations/policies/training). `apiFetch` has no persistent client cache, so each navigation = another ~15-call fan-out.

### 2.3 Auth dominates server work (`pg_stat_statements`, cumulative)
| Query (auth-internal, run by `getUser()`) | Calls |
|---|---|
| `sessions` lookup | 113,625 |
| `mfa_amr_claims` | 113,623 |
| `identities` | 112,584 |
| `mfa_factors` | 112,584 |
| `users` (token validation) | 112,135 |
| **`custom_access_token_hook(...)`** | **1,495 — mean 7.31 ms, total 10.9 s** |

Every `requireUser()` → `supabase.auth.getUser()` is a **network call to GoTrue that runs ~5 auth-schema queries server-side**. The data-layer queries don't even rank — **auth/session overhead, not data, is today's bottleneck.** The custom-access-token hook **is enabled** (1,495 invocations) and is the single most expensive function, but it correctly runs at token-refresh time, not per request.

---

## 3. Findings by dimension

Severity = scale impact. Effort = rough implementation size. ✅ = adversarially verified against cited evidence.

### A. Indexing & query plans

| # | Finding | Sev | Effort |
|---|---|---|---|
| A1 | **42 unindexed foreign keys.** All reference `profiles`/`departments`/`users`; all are `ON DELETE CASCADE`/`SET NULL`. At scale, hard-deleting a parent (migrations 040–047 added cascades) **seq-scans ~38 child tables, once per FK, in one locked transaction** → long stalls + statement-timeout risk. Also slows "by this user/department" filters. ✅ | **High** | Small |
| A2 | **Exact-count + offset pagination.** Every list uses `{count:'exact'}` (26 routes, zero use `planned`/`estimated`) and offset `.range()`. Exact count scans all RLS-matched rows per page; deep offsets re-scan-and-discard. Bites the big append-only tables. ✅ | Medium | Medium |
| A3 | **Two unindexed search paths.** `audit_logs.user_name` and `profiles.name/email` leading-wildcard `ILIKE` have **no trigram GIN** → seq scan (`EXPLAIN` confirmed). The `/api/audit-logs` `metadata->>'audit_id'` filter is also unindexable as written. *(Correction to a first-pass claim: the main content-search columns — titles/subjects/names on audits, circulars, observations, risks, policies, letters, etc. — **are** trigram-indexed and fine.)* ✅ | Medium | Small |

### B. API call patterns, redundancy & over-fetch

| # | Finding | Sev | Effort |
|---|---|---|---|
| B1 | **Per-handler auth round-trip × dashboard fan-out.** `requireUser()` (auth.ts:102-146) does `getUser()` (network to GoTrue) + `getSession()` (local) + a `profiles` select on **every** handler; React `cache()` doesn't span concurrent handlers. The dashboard fires ~13–16 distinct GETs, each paying it; in-flight dedupe only coalesces *identical* URLs. ✅ | **High** | Large |
| B2 | **Dashboard KPIs computed from paginated lists.** `useDashboardMetrics` derives totals/by-status/overdue/severity counts from store arrays fed by `fetchAll()`. `audits`/`letters`/`correspondence` default to **pageSize 10** (metrics wrong past 10 rows); `observations`/`risks`/`policies`/`circulars` hardcode **100** (wrong past 100). `MAX_PAGE_SIZE=100` means you can't even pull a full table to "fix" it client-side. *(Training is exempt — it already uses a server aggregate `/api/training/metrics`, which is the pattern to copy.)* ✅ | **High** | Medium |
| B3 | **No navigation cache / re-fetch storm.** No persistent client cache → global lookups + full entity lists re-fetched on every page (see §2.2). | **High** | Medium |
| B4 | **Cache-tag infrastructure is inert.** ~40 `cacheTags` factories + `revalidateTag` on every mutation, but **no GET is wrapped in `unstable_cache`/`'use cache'`** (grep: zero), so nothing is ever cached or invalidated. Worse, some GETs emit `Cache-Control: public, s-maxage=...` on **per-user RLS-scoped** bodies (`team/me`, `training/employees`, `compliance/score`) — latent data-leak if a shared CDN cache is ever added. ✅ | Medium | Medium |
| B5 | **Full `body`/HTML shipped in LIST payloads** for `letters` and `correspondence` (unbounded `text` columns), only CSS line-clamped client-side. A 100-row page transfers MBs of rich text the list never shows. ✅ | Medium | Small |
| B6 | **`has_attachments`/`has_pending_edits` filters** fetch the **entire** child table's ids then build a giant `id IN (...)`/`NOT IN (...)`. FKs are already indexed → fix is an `EXISTS`/`!inner` semi-join, not more indexes. Only fires when the filter is used. ✅ | Medium | Small |
| B7 | **Write-side N+1 on message send** — one sequential `UPDATE` per other participant (messages route.ts:76-87). O(participants) round-trips per send. Bounded by thread size. ✅ | Low | Trivial |

### C. Row-level security cost

| # | Finding | Sev | Effort |
|---|---|---|---|
| C1 | **35 RLS policies call bare `auth.uid()`/`auth.jwt()`** in `USING`/`CHECK` → re-evaluated **per scanned row** (a 100k-row scan = 100k calls). Fix is the standard `(select auth.uid())` wrap. ✅ (advisor `auth_rls_initplan`) | **High** | Medium |
| C2 | **`has_permission()` checks the cheap JWT claim LAST.** The `OR` evaluates (1) `user_permissions`, (2) `user_roles`+`role_permissions`, (3) `profiles`+`role_permissions`, then (4) `auth.jwt()` — so role-based users run up to 3 RBAC subqueries before the JWT short-circuit, used across ~80 policies, and it isn't `(select ...)`-wrapped. ✅ | **High** | Medium |
| C3 | **77 duplicate permissive policies across 76 tables.** `FOR ALL _modify` policies also cover `SELECT`, so many reads run `has_permission('…edit')` on top of the `_select USING(true)` — a read tax on every table. Split `_modify` by command (INSERT/UPDATE/DELETE). ✅ (advisor `multiple_permissive_policies`) | High | Large |
| C4 | **⚠ Security: RLS-bypassing aggregator callable by any authenticated user.** `compute_compliance_inputs` is `SECURITY DEFINER` with `EXECUTE` granted to `authenticated` (029:21). It `jsonb_agg`s org-wide data across 7 tables with **no per-user/RLS filter** and ignores its `framework_id`/`department_id` args. Any user can `POST /rest/v1/rpc/compute_compliance_inputs` with the anon key + their JWT and read org-wide compliance data, and pass a wide window to force a full aggregation. The app's own caller is fine; the raw RPC surface is not gated. ✅ | **High (security)** | Small |

### D. Storage & archival growth (your explicit concern)

| # | Finding | Sev | Effort |
|---|---|---|---|
| D0 | **✅ GOOD — documents are offloaded to object storage.** All 11 attachment/document tables store a `storage_path text` pointer + metadata (`name`/`type`/`size`); **no `bytea`/base64** anywhere. Buckets are private Supabase Storage. So **growing archived documents bloat object storage, not Postgres** — backups, VACUUM, and scans are unaffected by document volume. *This directly answers "as archived documents increase in size": the DB stays lean.* The only watch-item is **orphaned objects** — hard-delete cascades remove DB rows but not the underlying Storage object. ✅ | Low (good) | Medium (cleanup job) |
| D1 | **No retention on append-only logs.** `audit_logs` + `user_activity_logs` are append-only with 3 secondary indexes each and **no partitioning, no purge**. Migration 012 explicitly promised "audit_admin gets DELETE for cron retention purges" and 004 added `audit_retention_years default 7`, but **no cron purge exists and the config is never enforced** → data lives forever. These are already the largest/fastest-growing tables. ✅ | **High** | Large |
| D2 | **`*_versions`/`*_timeline` grow one row per edit, forever, no pruning.** A policy edited 200× = 200 version + 200 activity rows; 10k churning policies → millions of history rows. *Mitigated:* rows store only short bilingual summaries + a `field_changes` jsonb diff (no full-body snapshots), and all are FK-indexed, so per-entity fetch stays fast — the risk is total storage/index bloat, not page latency. ✅ | Medium | Medium |
| D3 | **Observations list never filters `archived_at`** — and this is a **current correctness bug, not just scale.** Migration 076 says archived observations should be hidden by default and added a partial index for it, but the list route only filters `deleted_at` and the query schema has no archive param (policies do this correctly). Archived/closed observations leak into the default list + inflate its `count:'exact'`. Grows unbounded as items are remediated. ✅ | Medium | Small |
| D4 | **`cron.job_run_details` has no retention** — one row per cron run, never trimmed. Trivial now (~22 rows) but worth a housekeeping purge before adding more jobs (e.g. the retention jobs in D1). ✅ | Low | Trivial |

---

## 4. Prioritized action plan

### Quick wins — high value, low effort (recommend first)
1. **Index the 42 FK columns** (A1) — one migration, `CREATE INDEX CONCURRENTLY`. Removes the cascade-delete time-bomb and speeds ownership filters. *Biggest payoff per line of change.*
2. **Fix the observations `archived_at` filter** (D3) — mirrors the existing policies route; **also fixes a live bug**.
3. **Gate or revoke the `compute_compliance_inputs` RPC** (C4) — revoke `authenticated EXECUTE` (the app calls it server-side) or move it behind a gated route. *Security.*
4. **Drop `body` from letters/correspondence LIST columns** (B5) — add a `body_excerpt` for the preview.
5. **Message unread-count → single set-based `UPDATE`/RPC** (B7).
6. **Add the retention/housekeeping crons** (D1 partial, D4) — purge `audit_logs`/`user_activity_logs` past `audit_retention_years`, and trim `cron.job_run_details`. The hooks were already provisioned.

### Medium — meaningful refactors
7. **Replace `getUser()` with `getClaims()`** in `requireUser()` (B1) — local JWT verification, removes a Frankfurt round-trip from every handler. (`getSession()` is already local; only `getUser()` is the network hop.)
8. **`(select auth.uid())`-wrap RLS quals + reorder `has_permission` to check the JWT first** (C1, C2) — large per-row savings, mostly mechanical.
9. **Dashboard aggregate endpoints** (B2) — compute counts/breakdowns in SQL (`COUNT(*) FILTER`, `GROUP BY`), copy the `/api/training/metrics` pattern. Fixes wrong-at-scale KPIs *and* shrinks the fan-out.
10. **Keyset/cursor pagination + `count:'estimated'`** for the big append-only feeds (A2) — reserve `exact` for small bounded tables.
11. **Add the two missing search indexes** (A3) — trigram GIN on `audit_logs.user_name` & `profiles.name/email`; expression index on `metadata->>'audit_id'` if hot.
12. **`EXISTS`/`!inner` for attachment filters** (B6).
13. **Decide the caching model** (B4) — either wrap genuinely-shared lookups in `unstable_cache` keyed by tag, or remove the dead scaffolding; never `public` on RLS-scoped responses.

### Larger — plan deliberately
14. **Client data-layer caching / stop re-fetching on every nav** (B3) — staleness windows / shared store hydration.
15. **Split the 77 `FOR ALL _modify` policies by command** (C3).
16. **Partition `audit_logs`/`user_activity_logs`** by month (PG17 native) so retention = `DROP PARTITION` (D1 full).
17. **Scoring cache hardening** — targeted invalidation instead of full-cache expiry on every write to 19 tables, single-flight on cold compute, `pg_cron` precompute, and period-filter the `letters` CTE (currently unbounded). (rls/scoring finding)
18. **Object-storage orphan cleanup** when attachment rows are hard-deleted (D0).

---

## 5. What's already good (don't "fix")
- Explicit column lists on list endpoints (no `select('*')`); list/detail column split exists.
- Per-page decorations gated to visible-page ids and index-backed.
- Detail composites fan out children via `Promise.all`.
- Documents in object storage, not the DB (the key answer to the archival concern).
- Scoring uses a single RPC with a 10-query `Promise.all` only as fallback; results cached.
- Custom-access-token hook live → RBAC out of the per-request path.
- Content-search columns trigram-indexed.

---

## 6. Security sidebar (from Supabase advisors, not the core scope)
- **C4** above (RLS-bypassing RPC) is the notable one.
- Leaked-password protection **disabled** (Auth setting).
- Public bucket `letter_signatures` has a broad `SELECT` policy allowing object listing.
- `citext`/`pg_trgm` installed in `public` schema (cosmetic).
- Several `WITH CHECK (true)` INSERT policies on timeline/log tables — likely intentional for append-only writes; worth a glance.

---
*Audit performed read-only. No schema, data, or application files were modified.*
