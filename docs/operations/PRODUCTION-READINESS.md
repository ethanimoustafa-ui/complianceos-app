# Production Readiness

A running checklist of work that is **deliberately deferred until production / go-live**.
These items are not bugs and not needed for local development — they are tasks that
only make sense (or only become necessary) once the app is deployed to real users.

When something comes up during development that belongs to "do this at production time,"
add it here instead of doing it early. Review this whole list before any production deploy.

---

## Open items

### PR-1 — Mutation rate limiting (from SEC-2, Wave-16 security audit)
**Status:** Deferred · **Priority for go-live:** High

The `/api/circulars/*` mutation endpoints (POST / PATCH / DELETE) have **no rate
limiting**. A single account can spam-create thousands of rows or hammer the API,
which on the Supabase free tier can exhaust DB connections/compute for the whole org.
Harmless on localhost with a few users; a real abuse/availability gap once deployed.

**Recommended production fix:**
- Add `@upstash/ratelimit` + `@upstash/redis` (global, accurate across server instances).
- Provision a free Upstash Redis database; set env vars `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`.
- Limiter keyed on `user_id`: ~30 mutations/min, ~5 creates/min; reads more permissive
  (~60–120/min). Return `429` with a `Retry-After` header.
- Apply across the whole `/api/circulars/*` mutation surface (and any bulk endpoints).
- An in-memory limiter was considered but rejected for production — per-instance tallies
  are inaccurate behind a load balancer.

### PR-2 — HSTS header (from SEC-6, Wave-16)
**Status:** Deferred · **Priority for go-live:** Medium

`Strict-Transport-Security` is intentionally **not** set, because it is meaningless (and
counter-productive) on localhost HTTP. Add it once the app is served over HTTPS in
production, e.g. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
The other security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, COOP/CORP, CSP) are shipped in Wave-16 and apply everywhere.

### PR-3 — Tighten the Content-Security-Policy (from SEC-6, Wave-16)
**Status:** Deferred · **Priority for go-live:** Medium

The Wave-16 CSP ships intentionally permissive (`script-src` includes `'unsafe-inline'`
and `'unsafe-eval'`) so it doesn't break the Next.js/React runtime during development.
Before production, tighten it: move to nonce/hash-based `script-src`, drop `'unsafe-eval'`
if the framework allows, and narrow `connect-src`/`img-src` to exactly what's used.

### PR-4 — Supabase plan / tier (from project notes)
**Status:** Deferred · **Priority for go-live:** Medium

The project is on the Supabase **free tier**. Before production, evaluate upgrading:
- The free tier blocks leaked-password protection (accepted as a WARN today).
- Connection / compute limits on the free tier are tight and have already caused
  intermittent flakiness under concurrent requests during development.

### PR-5 — Optimistic locking for circular child tables (from SEC-1, Wave-16)
**Status:** ✅ Resolved in Wave-17.1 (2026-05-23)

Migration `052_child_table_updated_at.sql` added `updated_at timestamptz NOT NULL
DEFAULT now()` + a `BEFORE UPDATE` trigger (reusing `public.set_updated_at()`)
to all 6 mutable child tables: `circular_articles`, `article_checklist_items`,
`circular_workflow_steps`, `circular_cap_attachments`,
`circular_remediation_attachments`, `circular_pdf_attachments`. The 4 mutating
child routes (`implementations/[implId]`, `implementations/[implId]/checklist/[itemId]`,
`workflow/steps/[stepId]`, `attachments/[attId]`) now read `If-Match`, do the
atomic conditional UPDATE/DELETE scoped to `updated_at`, and return 412 on
mismatch — same pattern as the parent circular route. The client store
threads the per-entity `updatedAt` into the next request via an `ifMatchHeader()`
helper. Append-only tables (`circular_versions`, `article_versions`,
`*_timeline`) are intentionally not migrated — no PATCH/DELETE route, locking N/A.

### PR-6 — Tighten permissive `*_timeline` INSERT RLS policies (from SEC-9, Wave-16)
**Status:** Deferred (needs migration) · **Priority for go-live:** Low

SEC-9 audit: the app is effectively **single-tenant** — there is no
`org_id`/`tenant_id` column on `circulars` or any related table, and RLS is
**permission-based** (`has_permission('edit'|'create'|'delete')`), not
tenant-scoped. The circulars / articles / workflow-step / checklist /
attachment tables all gate writes correctly through `has_permission()`, and
`org_id` is never read from a request body, so there is no cross-org IDOR.

However the Supabase linter flags several `*_timeline` / activity-log tables
(`circular_timeline`, `article_timeline`, `audit_logs`, `letter_timeline`,
`observation_timeline`, `policy_activity_log`, `risk_history`,
`user_activity_logs`, `audit_activity_logs`) whose **INSERT policy is
`WITH CHECK (true)`** — any authenticated user could insert timeline rows
directly via PostgREST. Low impact (append-only audit noise, no data
exfiltration) and the app's own routes always go through `requirePerm('edit')`
first. Before production, tighten these INSERT policies to require the relevant
permission (e.g. `has_permission('edit')`).

### PR-7 — `field_changes` field-LABEL translation gap (from FORENSIC §5, Wave-17)
**Status:** ✅ Resolved in Wave-19.4 (2026-05-23) · **Priority for go-live:** —

The structured per-field diff stored in `circular_versions.field_changes` /
`article_versions.field_changes` stores the field *name* as an i18n key
(`regulatoryUpdates.timelineField.*`) which `renderFieldLabel` translates at
display time. Wave-19.4 closed the loop on this gap on both entities:

- **Rules audit:** `SELECT DISTINCT field` across `circular_versions.field_changes`
  + `article_versions.field_changes` confirmed 100 % namespaced keys — every
  Rules `FIELD_LABEL_KEYS` entry resolves through a key, no raw English labels
  remain (the "affected departments" exemplar from FORENSIC §5 was already
  `regulatoryUpdates.timelineField.departments`).
- **Policy fix:** `renderFieldLabel` extended to also recognise the
  `policies.field.*` namespace; new `renderFieldLabelsInText` helper substitutes
  embedded field-label keys inside composed `policy_versions.changes` strings
  (e.g. `"Policy updated — policies.field.description"` → `"Policy updated —
  Description"` / `"Policy updated — الوصف"`). The Policy Version-History
  renderer in `PolicyDetailsContent.tsx` now routes `entry.changes` through
  the helper; the legacy fixture-data map (`VERSION_CHANGES_MAP`) still
  short-circuits pre-keyed seed strings. Policy field-label keys
  (`policies.field.{name,description,category,version,approvalTier,owner,
  ownerDepartment,businessOwner,lastReviewDate,nextReviewDate,reviewCycleDays,
  approvedDate,status,reviewSchedule,frameworks,affectedDepartments,
  currentReviewCycle,currentReviewCycleDate}`) were already present in
  `en.json` + `ar.json` — no dictionary additions needed.

Residual (out-of-scope, not blocking): the Policy `policy_versions.changes`
prefix `"Policy updated — "` itself is still authored in English by the PATCH
writer (`src/app/api/policies/[policyId]/route.ts:255`). Tracked separately —
Wave-19.1 / Q8 dual-store contract calls for `policy_versions.changes` to
migrate to `{k,p}` JSON (matching `circular_versions.changes`), at which point
the prefix becomes a translatable key. The orchestrator opted not to migrate
in Wave-19.4; the per-field-label translation is the user-visible win.

### PR-8 — `recomputeCircularProgress` is mutation-triggered only (recompute cron) (from FORENSIC §5, Wave-17)
**Status:** ✅ Resolved in Wave-19 (2026-05-23)

Migration `055_derived_state_triggers_and_cron.sql` adds two persisted bool
columns — `policies.is_expired` and `circulars.is_overdue` — each maintained
by a `BEFORE INSERT OR UPDATE` trigger so any mutation that touches the
relevant fields (`next_review_date` on policies; `due_date` / `status` on
circulars) flips the flag atomically with the write. A daily `pg_cron` job
(`regdocs_derived_state_daily`, `30 0 * * *`) catches rows whose derived state
should flip purely because the calendar advanced — an idle row that no UPDATE
touches. Partial indexes (`policies_is_expired_idx`,
`circulars_is_overdue_idx`) make the StatCard counts O(1). The code layer
threads the new columns through the list/detail GET column lists, the
PolicyApiRow / CircularApiRow types, the Zustand mappers, and the StatCard
predicates (Wave-19 Q2/Q3). FORENSIC §5 bullet crossed out + linked to this
resolution.

### PR-10 — Platform-wide configurable enum infrastructure (from Wave-19 Q4/Q5)
**Status:** Partially resolved in Wave-19.7 — `policy.approval_tier` shipped via the generic `enum_value_definitions` table; remaining domains (priority, severity, step_state, status, risk_level) follow the same pattern. · **Priority for go-live:** Medium

**Wave-19.7 progress (this iteration):**
- Migration 063 adds the generic `enum_value_definitions` table keyed by
  `(domain, key)` with `name_en` / `name_ar` / `sort_order` / `is_default` and
  RLS gated on `settings:edit`. First-domain seed: `policy.approval_tier` with
  `tier_1 / tier_2 / tier_3` defaults.
- `/api/settings/enum-values` (GET/POST) + `/api/settings/enum-values/[id]`
  (PATCH/DELETE) — W17.2 atomic-on-client-token guard, FK-style in-use
  protection against `policies.approval_tier`, immutable `domain`/`key`, no
  delete on seeded rows.
- `useEnumValuesStore` (Zustand, optimistic via `optimisticMutation`).
- Policy Create / Edit modals now read their tier dropdown from the store;
  Policy detail tier chip renders the store label with fallback to the
  legacy static formatter.
- Settings → "Approval Tiers" section (add / edit / delete with the same
  inline-edit shape as other lists).

Remaining (next iteration): port the same pattern to the other enum
domains in the PORTING-TEMPLATE §8 list.

**Original deferral notes follow.**

Wave-19 codified the platform invariant in `.planning/regulatory-updates-rules/PORTING-TEMPLATE.md §8`:
enum values that represent user-domain concepts (`approval_tier`, `status`,
`priority`, `risk_level`, `step_state`, `category`, every other tier/tag/state)
are **user-configurable through Settings**, not hardcoded. Schemas validate
the SHAPE (string, max length) and never lock the SET. Labels resolve through
a single formatter, never per-component label maps.

Today the wiring is partial: `formatEnum` is the central formatter, but the
allowed-value set and the labels still live in i18n dictionaries / inline
constants rather than a queryable table. Before production:

- Add an `enum_value_definitions` table (or per-domain `tier_definitions` /
  `status_definitions` / etc.) keyed by `(entity, field, key)` with `label_en`
  / `label_ar` columns plus ordering + active flags.
- Build a Settings UI to manage the rows.
- Rewrite `formatEnum` (or its successor) to resolve labels from the DB
  instead of the bundled dictionaries, with a tiny in-memory cache.
- Apply across `approval_tier`, `step_state`, every user-facing `status` /
  `priority` / `risk_level`, and every domain enum that user-configures.
- Grandfather the workflow `actionType` set + a few legacy `z.enum`s on the
  Rules page; new ports start clean per PORTING-TEMPLATE §8.

### PR-9 — Legacy `circulars.pdf_url` column (from FORENSIC §5, Wave-17)
**Status:** Deferred (needs migration) · **Priority for go-live:** Low

The Wave-15 multi-file PDF migration introduced `circular_pdf_attachments` but
left the legacy single-PDF `circulars.pdf_url` column in place for backward
compatibility (W15-4). There are now two sources of "the circular's PDF". The
column is still written/read by the PATCH path and the `pdfUrl` store field.
Before production: migrate any remaining `pdf_url` data into
`circular_pdf_attachments`, then drop the column and remove the `pdf_url`
read/write paths so there is a single source of truth.

---

## Notes
- Add new deferred-to-production items here as they surface, with: a short ID, the
  source (which wave/finding), what the gap is, and the recommended fix.
- Items that are fixed in normal development waves do **not** belong here — only work
  that genuinely waits for production.
