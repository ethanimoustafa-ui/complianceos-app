# ComplianceOS Backend Map (Single-Tenant MVP)
> Source of truth for the Supabase backend build. Synthesized 2026-05-15. Supersedes any docs in `scope/`.
>
> Inputs digested: `.planning/01-backend-spec-extract.md` (DDL + endpoints + RBAC + scoring + jobs + LaTeX), `.planning/02-stores-map.md` (41 Zustand stores → tables/endpoints/indexes/client-only fields), `.planning/03-pages-and-api-needs.md` (route → store map + deep-links + pagination), `.planning/04-scope-and-pdf-design.md` (scope + 14 modules + PDF templates + regulatory pins), `scope/ComplianceOS — Technical Concerns.txt` (5 pushbacks).
>
> Where the discovery doc is verbatim DDL or extensive enumerations, this map links back to it instead of duplicating — e.g. "see `01-…` §2.9 for full circular DDL." That keeps this doc skimmable.

---

## 0. Architecture at a glance

ComplianceOS MVP is a single-tenant Saudi GRC platform: 33 Next.js routes, 41 Zustand stores (becoming read-through caches), 95+ TS interfaces, ~160 REST endpoints across 25 resource groups, and ~50 Postgres tables, all bound to a 5-component compliance scoring engine plus a bilingual xelatex PDF pipeline. The frontend is already shipped; the backend has to satisfy the contract the stores expect while the orchestrator (one full-time backend engineer) ports the in-browser scoring engine to the server bit-for-bit (0.1-precision match) and shrinks every page's edge-request and Supabase-row budget to fit Vercel free + Supabase free.

The runtime is **Next.js 16 App Router on Vercel (Fluid Compute Functions)** talking to **Supabase Postgres 17 + Supabase Auth + Supabase Storage** via the `@supabase/ssr` client (httpOnly-cookie sessions, no client tokens). Route Handlers are the API surface; long-running work (PDF compile, score recalc, scheduled overdue sweeps) runs as Vercel Functions invoked by **Vercel Cron** plus a thin `jobs` table (poll-claim-run). The append-only `audit_logs` family is protected at the **DB role level** (`REVOKE UPDATE, DELETE`). Caching is Next 16 Cache Components (`use cache` + `cacheTag` + `updateTag`) so every list page is one or two row-reads on warm cache; the client-side Zustand stores become hydrators of cached fetches, not local sources of truth.

```
+-------------------------------+        +------------------------+
|  Browser (Next.js client)     |        |   Vercel Cron (UTC)    |
|  Zustand caches + RSC payload |        |  every 1h / 02:00 / …  |
+--------------+----------------+        +-----------+------------+
               | RSC + fetch                         |
               v                                     v
+-------------------------------+        +------------------------+
|  Next.js Route Handlers       |<------>|  /api/jobs/run         |
|  (Vercel Fluid Functions)     |        |  claims rows from jobs |
|  - Zod validate               |        +-----------+------------+
|  - @supabase/ssr cookie       |                    |
|  - auth+role+permission gate  |                    |
|  - updateTag('audits') etc.   |                    |
+--------------+----------------+                    |
               |                                     |
               v                                     v
+-------------------------------+        +------------------------+
|  Supabase Postgres 17         |        |  PDF Function (Docker) |
|  - public schema (50 tables)  |<-------|  xelatex + polyglossia |
|  - RLS by user/role           |        |  300s timeout, streams |
|  - audit_logs INSERT-only     |        +------------------------+
|  - jobs table                 |
|  - Supabase Auth (auth.users) |
|  - Supabase Storage buckets   |
+-------------------------------+
```

---

## 1. Constraints & decisions log

1. **Single-tenant MVP.** Drop every `tenant_id` column from the spec'd DDL. RLS scopes by `auth.uid()` + role, not tenant. *Rationale:* one client only, ship M1 in days not weeks, retrofit `tenant_id` later (see §12).
2. **Supabase Auth replaces self-hosted GoTrue / Ory Kratos.** *Rationale:* TC #1 — GoTrue is a Supabase building block, not a standalone service; Supabase Auth gives TOTP, refresh-rotation, lockout, password reset, session revoke out of the box for a single-tenant deployment. In-region residency is the one open item (§13).
3. **Next.js Route Handlers replace Express.** *Rationale:* one less deployable, one fewer cold-start surface; Vercel Fluid Compute keeps long tail responses + jobs in-process; the controller-service-repository pattern from the spec collapses into `route.ts` → `lib/services/*` → `lib/repos/*` files.
4. **xelatex + polyglossia is the only LaTeX engine.** *Rationale:* TC #3 — two engines = two preambles, two CI caches, two ways rendering can silently diverge. The compile-time delta on on-demand PDFs is irrelevant.
5. **Audit log is append-only at the DB role level.** `REVOKE UPDATE, DELETE ON audit_logs, user_activity_logs, observation_timeline, policy_activity_log, risk_history, circular_timeline, sama_letter_timeline FROM authenticated, anon, service_role;` then `GRANT INSERT` to the app role only. Retention purge runs under a separate `audit_admin` role invoked by Vercel Cron. *Rationale:* TC #5 — SAMA auditors ask "can anyone with DB access modify rows after the fact?" — answer must be "no".
6. **Scoring engine moves server-side.** Port `src/lib/compliance-engine.ts` (585+ lines) to `lib/services/compliance-score.ts`. Frontend reads `/api/compliance/score?period=...` and the per-framework variants. Result cached in `compliance_scores_cache` keyed by `(period, framework_id, dept_id, inputs_hash)`. *Rationale:* TC #4 — weights leak via devtools at multi-tenant Scale; doing it now means M5 doesn't reopen the frontend.
7. **Free-tier aggressive caching.** Every list endpoint uses `use cache` + `cacheTag('<resource>')`; mutations call `updateTag('<resource>', '<resource>:<id>')`. Default `cacheLife({ stale: 60, revalidate: 300, expire: 3600 })`. Skeleton loading on every dashboard page. *Rationale:* Vercel free + Supabase free row budgets.
8. **Arabic storage: source language as-is.** User-entered content stored verbatim in whatever language the user typed. Bilingual columns (`name_en`/`name_ar`, `subject`/`subject_ar`, `body`/`body_ar`, `description`/`description_ar`) where the scope explicitly demands both. System enums (status, type, role, severity) are canonical English keys; AR rendering happens client-side via the existing i18n dict. UTF-8 default collation is sufficient.
9. **`PAGE_SIZE = 10` across all paginated list endpoints.** Matches `paginate()` and "Showing X–Y of Z" UI on `/correspondence/regulatory-updates/rules`, `/correspondence/regulatory-updates/policies`, and `/reports/compliance-review`.
10. **Soft delete via `deleted_at TIMESTAMPTZ`** on every top-level data table; repos filter `deleted_at IS NULL` by default. Hard delete is admin-only (`/api/admin/purge` — out of MVP scope).
11. **pg-boss is swapped for a `jobs` table + Vercel Cron.** Vercel free has no long-running worker; instead the scheduled function polls `jobs` rows, claims with `FOR UPDATE SKIP LOCKED`, runs, marks complete. See §9.
12. **RBAC: 4 backend roles, 25 permissions** (per `01-…` §4). Frontend `useCan('Permission')` resolves to the JWT `app_metadata.permissions[]` claim merged with role defaults.
13. **No tenant provisioning, no soft-delete grace, no realtime sync, no AI auto-parsing, no legacy migration.** All in scope §"Out of scope".

---

## 2. Database schema

Total **≈50 tables**, grouped below by domain. Full verbatim DDL lives in `01-backend-spec-extract.md` §2.1–2.19; this section harmonizes types, drops `tenant_id`, lists per-table indexes (derived from the WHERE/ORDER BY patterns in `02-stores-map.md` + `03-pages-and-api-needs.md`), RLS policy, trigger notes, and the Zustand store that populates it.

### Global conventions for every table

- Drop every `tenant_id UUID NOT NULL REFERENCES tenants(id)` column from the spec. Keep `created_at`, `updated_at`, `deleted_at` where present.
- Every table: `created_at TIMESTAMPTZ DEFAULT now() NOT NULL` and `updated_at TIMESTAMPTZ DEFAULT now() NOT NULL`. `updated_at` maintained by a single trigger function `set_updated_at()`:
  ```sql
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;
  ```
  Applied per table: `CREATE TRIGGER trg_<table>_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION set_updated_at();`
- Every FK gets an index (Postgres does not auto-index FKs).
- All list-query filter columns (`status`, `due_date`, `severity`, `category`) get a composite index aligned with the page's default sort.
- Soft delete: top-level entity tables have `deleted_at TIMESTAMPTZ` and a partial index `WHERE deleted_at IS NULL` on the primary list key.
- RLS posture (MVP, single-tenant):
  - `SELECT` for `authenticated` (RLS allows all rows; data is one tenant).
  - `INSERT/UPDATE/DELETE` gated by role via JWT `app_metadata.role` per the RBAC matrix in §3.
  - Audit-log family: `INSERT` only for `authenticated`; `UPDATE/DELETE` revoked from every non-superuser role.
  - One canonical RLS template applied per table (below).

### Standard RLS template (single-tenant MVP)

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read non-deleted rows
CREATE POLICY "<table>_select" ON <table>
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);  -- drop the WHERE clause for tables without deleted_at

-- INSERT/UPDATE/DELETE gated by role via a permission check
-- Role lookup: (auth.jwt() -> 'app_metadata' ->> 'role')::text
CREATE POLICY "<table>_insert" ON <table>
  FOR INSERT TO authenticated
  WITH CHECK (auth_has_permission('<resource>:create'));

CREATE POLICY "<table>_update" ON <table>
  FOR UPDATE TO authenticated
  USING (auth_has_permission('<resource>:edit'))
  WITH CHECK (auth_has_permission('<resource>:edit'));

CREATE POLICY "<table>_delete" ON <table>
  FOR DELETE TO authenticated
  USING (auth_has_permission('<resource>:delete'));
```

`auth_has_permission(text)` is a `SECURITY DEFINER` function that reads `auth.jwt() -> 'app_metadata' -> 'permissions'` (TEXT[]) and falls back to the role's default permission set from a `role_permissions` lookup table. Sketch:

```sql
CREATE TABLE role_permissions (
  role TEXT NOT NULL CHECK (role IN ('viewer','auditor','compliance_officer','org_admin')),
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE OR REPLACE FUNCTION auth_has_permission(perm TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions
    WHERE role = (auth.jwt() -> 'app_metadata' ->> 'role')::text
      AND permission = perm
  ) OR (auth.jwt() -> 'app_metadata' -> 'permissions') ? perm;
$$;
```

Seed `role_permissions` from the matrix in §3.

---

### 2.1 Domain: Identity & profiles

#### `profiles` (mirrors `auth.users`)

```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('viewer','auditor','compliance_officer','org_admin')),
  department_id   UUID REFERENCES departments(id),
  phone           TEXT,
  avatar_seed     TEXT,
  workload        INTEGER DEFAULT 0 CHECK (workload BETWEEN 0 AND 100),
  permissions     TEXT[] NOT NULL DEFAULT '{}',
  nationality     TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  joined_at       TIMESTAMPTZ DEFAULT now(),
  invited_by      UUID REFERENCES profiles(id),
  burnout_since   TIMESTAMPTZ,
  last_login      TIMESTAMPTZ,
  preferred_language CHAR(2) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ar')),
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at      TIMESTAMPTZ
);
```

- **Indexes:** `(role)`, `(department_id)`, `(status)`, `(email)` (unique already PK-adjacent).
- **RLS:** all authenticated SELECT; UPDATE on own row only OR `team:edit` permission; INSERT/DELETE restricted to `team:invite`/`team:remove` permissions.
- **Trigger:** on `auth.users INSERT`, also INSERT a `profiles` row (Supabase Auth hook).
- **Sources:** `useAuthStore` (login, profile), `useTeamStore` (CRUD), `useLanguageStore` (`preferred_language`).

#### `user_preferences`

```sql
CREATE TABLE user_preferences (
  user_id                   UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  dashboard_view            TEXT NOT NULL DEFAULT 'executive',
  timezone                  TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  date_format               TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  notification_preferences  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

- **Indexes:** PK only.
- **RLS:** SELECT/UPDATE own row only.
- **Sources:** `useUserPreferencesStore`.

#### `team_member_assignments`

```sql
CREATE TABLE team_member_assignments (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  due_date  DATE,
  progress  INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

- **Indexes:** `(user_id)`, `(due_date)`.
- **RLS:** SELECT all authenticated; INSERT/UPDATE/DELETE on `team:edit`.
- **Sources:** `useTeamStore` (`assignments[]`).

#### `team_member_access_controls`

```sql
CREATE TABLE team_member_access_controls (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  enabled   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, label)
);
```

- **Indexes:** `(user_id)`.
- **RLS:** SELECT all authenticated; mutations on `team:edit`.
- **Sources:** `useTeamStore.accessControls`.

---

### 2.2 Domain: Org configuration (lists & categories)

All of these are CRUD'd in `/settings` and inline on various detail pages. Each is a flat lookup table with bilingual labels.

| Table | Columns | Indexes | Source store |
|---|---|---|---|
| `departments` | id UUID PK, name TEXT, name_ar TEXT, is_default BOOL, created_at, updated_at | `(is_default)` | `useDepartmentStore` |
| `business_units` | id TEXT PK (slug), label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useBusinessUnitStore` |
| `onboarding_regions` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useOnboardingRegionStore` |
| `onboarding_industries` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useOnboardingIndustryStore` |
| `onboarding_headcount_buckets` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useOnboardingHeadcountStore` |
| `calendar_event_types` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useCalendarEventTypeStore` |
| `correspondence_types` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useCorrespondenceTypeStore` |
| `letter_types` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useSAMALetterTypeStore` |
| `risk_categories` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL, color TEXT | `(is_default)` | `useRiskCategoryStore` |
| `policy_categories` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `usePolicyCategoryStore` |
| `audit_categories` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useAuditCategoryStore` |
| `training_categories` | id TEXT PK, label TEXT, label_ar TEXT, is_default BOOL | `(is_default)` | `useTrainingCategoryStore` |
| `framework_sub_categories` | id UUID PK, framework_id TEXT, label, label_ar, is_default BOOL | `(framework_id)` | `useFrameworkSubCategoryStore` |
| `authority_departments` | id UUID PK, authority_id TEXT, en TEXT, ar TEXT, email TEXT, is_seed BOOL | `(authority_id)` | `useAuthorityDeptStore` |
| `scale_label_overrides` | scale TEXT, key TEXT, lang CHAR(2), value TEXT, PK(scale,key,lang) | `(scale, key, lang)` is the PK | `useScaleLabelsStore` |
| `compliance_settings` | id UUID PK (singleton), weights JSONB, target_score INT | one row only | `useComplianceSettingsStore` |

DDL pattern (apply to every list table):

```sql
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ar     TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_departments_is_default ON departments (is_default) WHERE deleted_at IS NULL;
```

- **RLS:** all SELECT for authenticated; INSERT/UPDATE/DELETE require permission `settings:edit` (canonical: "Configure Lists & Categories" — see §3).
- **DELETE constraint:** RLS additionally checks `is_default = false` for non-admin roles.

---

### 2.3 Domain: Frameworks

#### `frameworks`

Drop `tenant_id`, `version` versioning, `framework_version_migrations` (deferred — single-tenant means one framework version per id, no upgrade flow). Keep:

```sql
CREATE TABLE frameworks (
  id                      TEXT PRIMARY KEY,  -- 'sama' | 'nca-ecc' | ...
  name                    TEXT NOT NULL,
  name_ar                 TEXT,
  description             TEXT,
  description_ar          TEXT,
  icon                    TEXT,
  icon_color              TEXT,
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  threshold               TEXT NOT NULL DEFAULT 'standard',
  custom_threshold_value  INTEGER,
  alert_on_non_compliance BOOLEAN NOT NULL DEFAULT true,
  correspondence_based    BOOLEAN NOT NULL DEFAULT false,
  weights                 JSONB NOT NULL DEFAULT '{"audits":15,"observations":15,"letters":10,"policies":15,"circulars":15,"riskPosture":15,"training":15}',
  custom_field_values     JSONB NOT NULL DEFAULT '{}',
  departments             TEXT[] NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE framework_pins (
  framework_id  TEXT PRIMARY KEY REFERENCES frameworks(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  UNIQUE (position)
);
```

- **Indexes:** `frameworks(correspondence_based)`, `frameworks(enabled)`.
- **RLS:** SELECT all; UPDATE on `settings:edit`.
- **Trigger:** on framework weights mutation → `updateTag('compliance')` via Postgres NOTIFY or app-side post-write.
- **Sources:** `useFrameworkConfigStore` (19 seed framework configs — sama, nca-ecc, ndmo-pdpl, nca-cscc, citc, nca-ccc, cma, zatca, misa, safiu, ia, sdaia-pdpl, iso-27001, iso-22301, iso-31000, coso-ic, coso-erm, saso, sharia-board).
- **Note on weights:** Spec §2.4 had 7 keys summing to 100. Frontend v6 migration collapsed to 4 (`audits/observations/letters/circulars`). The scoring engine uses 7 stored keys mapping to 5 components (see §7). Schema retains all 7 keys in the JSONB; UI may edit only 4.

---

### 2.4 Domain: Correspondence (general)

#### `correspondence`

```sql
CREATE TABLE correspondence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     TEXT NOT NULL UNIQUE,  -- 'COR-001', auto-generated
  subject       TEXT NOT NULL,
  from_party    TEXT NOT NULL,
  to_parties    TEXT[] NOT NULL DEFAULT '{}',
  date          TIMESTAMPTZ NOT NULL,
  type          TEXT NOT NULL REFERENCES correspondence_types(id),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received')),
  body          TEXT,
  thread_id     TEXT,
  archived      BOOLEAN NOT NULL DEFAULT false,
  assignee_id   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE correspondence_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID NOT NULL REFERENCES correspondence(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  type              TEXT,
  size              BIGINT,
  uploaded_at       TIMESTAMPTZ DEFAULT now(),
  uploaded_by       UUID REFERENCES profiles(id)
);
```

- **Indexes:** `correspondence(date DESC)` (default sort), `correspondence(status, type)`, `correspondence(thread_id)`, `correspondence(reference)`, `correspondence(assignee_id)`. `correspondence_attachments(correspondence_id)`.
- **RLS:** standard. INSERT on `create`, UPDATE on `edit`, DELETE on `delete`.
- **Sources:** `useCorrespondenceStore`.
- **Consumed by:** `/correspondence/feed`, `/correspondence/registry`, `/correspondence/regulatory-updates/rules` (via cross-store aggregation).

---

### 2.5 Domain: Frameworks/policies/rules (the heaviest domain)

#### `policies` + children

DDL: see `01-backend-spec-extract.md` §2.8 verbatim. Drop `tenant_id`. Drop `UNIQUE(tenant_id, ref_code)` → just `UNIQUE(ref_code)`.

Tables: `policies`, `policy_versions`, `policy_workflow_steps`, `policy_activity_log`, `policy_attachments`, `policy_evidence`, `policy_review_cycles`.

- **Indexes:**
  - `policies(status)` (heavy filter in `/correspondence/regulatory-updates/policies`),
  - `policies(next_review_date)` (overdue cron, `reviewAlerts()`),
  - `policies(business_owner_department_id)`,
  - `policies(category)`,
  - `policies(approval_tier)`,
  - GIN `policies(framework_ids)` (used by per-framework score filter),
  - GIN `policies(affected_departments)`,
  - `policy_versions(policy_id, date DESC)`,
  - `policy_workflow_steps(policy_id, sort_order)`,
  - `policy_activity_log(policy_id, timestamp DESC)` (append-only, see §6),
  - `policy_attachments(policy_id)`,
  - `policy_evidence(policy_id, review_cycle_id)`,
  - `policy_review_cycles(policy_id, initiated_at DESC)`.
- **RLS:** `policies` uses standard template. `policy_activity_log` is append-only (REVOKE UPDATE/DELETE; allow INSERT only from app role; trigger writes it). `policy_workflow_steps` mutations gated by `Approve Policy Reviews` permission.
- **Triggers:**
  - `set_updated_at` on `policies`.
  - On policy `INSERT` or status transition → INSERT row into `policy_activity_log` and `user_activity_logs`.
  - On policy `UPDATE` (status, weights) → `updateTag('policies', 'policies:<id>', 'compliance')`.
- **Sources:** `usePolicyStore` (5 seeds POL-001..005), `usePolicyTemplateStore` (6 templates).

#### `policy_templates`

DDL: see `01-…` §2.18. Drop `tenant_id`. Indexes: `(category)`, `(framework)`, `(status)`.

#### `circulars` + children

DDL: see `01-…` §2.9 verbatim. Drop `tenant_id`, drop `UNIQUE(tenant_id, reference)` → `UNIQUE(reference)`. The `authority` enum should be lowercased to match v8 migration (`sama`, `cma`, etc.).

Tables: `circulars`, `circular_articles`, `circular_workflow_steps`, `circular_timeline`, `circular_versions`, `circular_pending_edits`, `circular_cap_attachments`. Additionally per the stores doc:
- `article_checklist_items` (id, article_id FK, text, completed, sort_order)
- `article_attachments` (id, article_id FK, name, storage_path, size, uploaded_at, uploaded_by)
- `article_versions` (id, article_id FK, version_no INT, date, author, changes TEXT)
- `article_timeline` (id, article_id FK, title, date, user_name, status)
- `circular_remediation_attachments` (parallel to `circular_cap_attachments`)

- **Indexes:** `circulars(authority, status)`, `circulars(due_date)`, `circulars(status, due_date)`, GIN `circulars(framework_ids)`, GIN `circulars(departments)`. Child tables index FK + relevant date/sort fields.
- **RLS:** standard. `circular_timeline`, `article_timeline` are append-only.
- **Triggers:** workflow advance → INSERT `circular_timeline`. Pending edit approve → bump `circular_versions.version` + apply.
- **Sources:** `useCircularStore` (5 seeds).

#### `requirements` (rules)

DDL: see `01-…` §2.19. Drop `tenant_id`. Optional in MVP (`/correspondence/regulatory-updates/rules` page primarily reads `circulars`; requirements is the lighter "rules" abstraction). Defer to phase 2 unless explicitly needed.

---

### 2.6 Domain: Audits / observations

#### `audits` + children

DDL: see `01-…` §2.5. Drop `tenant_id`. Tables: `audits`, `audit_documents`, `audit_team_members`, `audit_comments`, `audit_tasks`, plus the per-audit activity log `audit_activity_logs` (NB: §6 below renames the spec's `audit_logs` to `audit_activity_logs` so it doesn't collide with the global `audit_logs` append-only log).

- **Indexes:** `audits(status, due_date)`, `audits(assignee_id)`, `audits(type)`, `audits(category)`, GIN `audits(framework_ids)`. `audit_tasks(audit_id)`, `audit_tasks(assignee_id, due_date)`, `audit_tasks(status)`. `audit_documents(audit_id)`. `audit_comments(audit_id, created_at DESC)`. `audit_team_members(audit_id, user_id)` unique.
- **RLS:** standard. INSERT/UPDATE/DELETE require `audit:*` permissions.
- **Triggers:** every mutation → INSERT `audit_activity_logs` row.
- **Sources:** `useAuditStore`, `useAuditTaskStore`, `useAuditLogStore`, `useAuditTemplateStore` (6 templates).

#### `audit_templates`

DDL: see `01-…` §2.18. Drop `tenant_id`. Indexes `(category)`, `(framework)`, `(status)`.

#### `observations` + children

DDL: see `01-…` §2.6. Drop `tenant_id`. Tables: `observations`, `observation_assignees`, `observation_checklist`, `observation_updates`, `observation_documents`, `observation_timeline`, `remediation_plans`, `closure_requests`, `closure_reviews`. Add `observation_team` (mirrors `audit_team_members`).

- **Indexes:** `observations(status, due_date)`, `observations(severity)`, `observations(source)`, `observations(leader_id)`, `observations(creator_id)`, `observations(department)`, GIN `observations(framework_ids)`, `observations(reference)` UNIQUE. Child tables: `(observation_id)` on all, plus `observation_timeline(observation_id, date DESC)`.
- **RLS:** standard, but with **observation ownership** overrides (see §3 "Special-case: observation ownership rules").
- **Triggers:** every mutation → INSERT `observation_timeline`. Workflow transitions (`transferLeadership`, `submitRemediationPlan`, `reviewRemediationPlan`, `requestClosure`, `reviewClosure`) all log to timeline.
- **Sources:** `useObservationStore` (5 seeds OBS-2026-0001..0005).

---

### 2.7 Domain: Risks

#### `risks` + children

DDL: see `01-…` §2.7. Drop `tenant_id`. Tables: `risks`, `risk_mitigation_checklist`, `risk_history`, `risk_department_proposed_plan` (sub-table for officer-driven workflow per stores doc §41).

```sql
CREATE TABLE risk_department_proposed_plan (
  risk_id      UUID PRIMARY KEY REFERENCES risks(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL,
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT now()
);
```

Additional columns on `risks` beyond §2.7:
- `intended_department_id UUID REFERENCES departments(id)`,
- `mitigation_deadline DATE`,
- `mitigation_workflow_status TEXT CHECK (mitigation_workflow_status IN ('not-started','sent-to-department','plan-proposed','in-progress','resolved'))`,
- `sent_to_department_at TIMESTAMPTZ`.

- **Indexes:** `risks(status)`, `risks(risk_score DESC)`, `risks(category)`, `risks(intended_department_id)`, `risks(owner_id)`, GIN `risks(framework_ids)`. `risk_mitigation_checklist(risk_id)`. `risk_history(risk_id, created_at DESC)`.
- **RLS:** standard. `risk_history` append-only.
- **Triggers:** every CRUD → INSERT `risk_history`. Status transitions → `updateTag('risks', 'compliance')`.
- **Sources:** `useRiskStore` (6 seeds).

---

### 2.8 Domain: SAMA letters

#### `sama_letters` + children

DDL: see `01-…` §2.10. Drop `tenant_id`. Add `authority TEXT NOT NULL DEFAULT 'sama'` per v5 migration (so the same table can later support non-SAMA authorities; UI filters to SAMA by default).

Tables: `sama_letters`, `sama_letter_approval_steps` (UNIQUE(letter_id, step) where step IN 1,2,3), `sama_letter_timeline`, `sama_letter_attachments`, `sama_letter_observations` (junction).

Also add `placeholder_defs JSONB`, `placeholder_values JSONB` on `sama_letters` per stores doc §42.

- **Indexes:** `sama_letters(authority, status)`, `sama_letters(type)`, `sama_letters(response_deadline)`, `sama_letters(created_by)`, `sama_letters(assigned_to)`, `sama_letters(reference)` UNIQUE. `sama_letter_approval_steps(letter_id, step)` UNIQUE. `sama_letter_timeline(letter_id, date DESC)`.
- **RLS:** standard. Approval steps require `Approve SAMA Letters` permission. `sama_letter_timeline` append-only.
- **Triggers:** on `send` → compute `response_deadline` from RESPONSE_DAYS map by type; INSERT timeline row.
- **Sources:** `useSAMALetterStore` (3 seeds), `useSAMATemplateStore` (8 templates).

#### `sama_letter_templates` (the `letter_templates` table)

DDL: see `01-…` §2.18. Drop `tenant_id`. Indexes `(type)`, `(status)`.

---

### 2.9 Domain: Advisory

#### `advisory_requests` + `advisory_notes`

DDL: see `01-…` §2.11. Drop `tenant_id`. `advisory_requests.ref` UNIQUE.

- **Indexes:** `advisory_requests(status, priority)`, `advisory_requests(business_unit)`, `advisory_requests(requested_date DESC)`, `advisory_requests(assigned_to)`, `advisory_requests(ref)` UNIQUE. `advisory_notes(request_id, created_at DESC)`.
- **RLS:** standard.
- **Sources:** `useAdvisoryStore` (5 seeds).

---

### 2.10 Domain: Calendar

#### `calendar_events`

DDL: see `01-…` §2.12. Drop `tenant_id`.

- **Indexes:** `calendar_events(date)`, `calendar_events(related_entity_id, related_entity_type)`, GIN `calendar_events(framework_ids)`, GIN `calendar_events(attendees)`.
- **RLS:** standard.
- **Sources:** `useCalendarStore`. The aggregated `/calendar` view also reads from audit/observation/policy/sama-letter/circular/training/correspondence/advisory/risk via the `useUnifiedCalendar` selector — these are derived, not stored.

---

### 2.11 Domain: Training / Saudization

#### `training_courses`, `training_employees`, `employee_course_progress`, `saudization_metrics`

DDL: see `01-…` §2.13. Drop `tenant_id` on all four; the singleton `saudization_metrics` becomes a one-row table (no UNIQUE(tenant_id) — use `CHECK ((SELECT count(*) FROM saudization_metrics) <= 1)` or app-level enforcement).

- **Indexes:**
  - `training_courses(category)`, `training_courses(due_date)`, GIN `training_courses(framework_ids)`.
  - `training_employees(department)`, `training_employees(is_saudi)`.
  - `employee_course_progress(employee_id, course_id)` UNIQUE, `(course_id)`, `(status)`, `(due_date)`.
- **RLS:** standard.
- **Derived views (MVP: compute on read):**
  - `v_department_training_progress` — group by department, compute avg progress + completion count.
  - `v_training_overview_stats` — global counts (active, completed, overdue, due-soon).
- **Sources:** `useTrainingStore` (composite store — split correctly maps to these 4 tables + 2 views).

---

### 2.12 Domain: Messaging

#### `message_threads`, `message_thread_participants`, `messages`

DDL: see `01-…` §2.15. Drop `tenant_id`. Add `admins TEXT[]` on `message_threads` per stores doc §30, or model via `message_thread_participants.is_admin BOOLEAN` (already present).

- **Indexes:** `messages(thread_id, created_at)`, `messages(sender_id)`. `message_thread_participants(user_id)`. `message_threads(last_message_at DESC)`.
- **RLS:** SELECT requires participant membership; INSERT message requires participant + `comment` permission.
- **Sources:** `useMessageStore` (3 seed threads, 8 messages).

---

### 2.13 Domain: Notifications & reports

#### `notifications`

DDL: see `01-…` §2.16. Drop `tenant_id`. Add `unique(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL` to make `syncGeneratedNotifications` idempotent.

- **Indexes:** `(user_id, read, created_at DESC)` partial WHERE NOT read for unread-count, UNIQUE `(user_id, dedupe_key)` partial WHERE dedupe_key IS NOT NULL.
- **RLS:** SELECT/UPDATE/DELETE own row only (`user_id = auth.uid()`); INSERT by service role or `create` permission.
- **Sources:** `useNotificationStore` + server-side `notification.generate` job.

#### `reports`

DDL: see `01-…` §2.17. Drop `tenant_id`.

- **Indexes:** `(status)`, `(scheduled_for)`, `(type)`, `(created_at DESC)`.
- **RLS:** standard, `report:create`/`report:delete`.
- **Sources:** `useReportStore` (not persisted in frontend).

---

### 2.14 Domain: Help / CMS-ish

| Table | Columns | Indexes | Source |
|---|---|---|---|
| `help_articles` | id TEXT PK, title TEXT, summary TEXT, category TEXT, content TEXT, icon TEXT | `(category)` | `useHelpStore` |
| `user_help_views` | user_id UUID FK, article_id TEXT FK, viewed_at TIMESTAMPTZ, PK(user_id, article_id) | `(user_id, viewed_at DESC)` | `useHelpStore.trackView` |

- **RLS:** `help_articles` public-read for `authenticated`; `user_help_views` own-row.

---

### 2.15 Domain: Compliance evaluations

#### `compliance_evaluations`

```sql
CREATE TABLE compliance_evaluations (
  id              TEXT PRIMARY KEY,  -- '${kind}:${item_id}::${dept_id}'
  kind            TEXT NOT NULL CHECK (kind IN ('rule','policy')),
  item_id         UUID NOT NULL,
  department_id   UUID NOT NULL REFERENCES departments(id),
  verdict         TEXT NOT NULL CHECK (verdict IN ('compliant','non-compliant','na','unknown')),
  notes           TEXT,
  evaluated_by    UUID REFERENCES profiles(id),
  evaluated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

- **Indexes:** `(kind, item_id)`, `(department_id)`.
- **RLS:** standard.
- **Sources:** `useComplianceEvaluationStore`.

---

### 2.16 Domain: Audit log / activity log (append-only, see §6 for the role enforcement)

#### `audit_logs` (global, cross-entity — this is the SAMA-grade tamper-proof log)

Renamed from the spec's `user_log_store` / `audit_log_store` to consolidate.

```sql
CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID REFERENCES profiles(id),
  user_name     TEXT NOT NULL,
  action        TEXT NOT NULL,
  details_key   TEXT,
  details_params JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  device        TEXT,
  location      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('completed','pending','info','failed')),
  target_type   TEXT,
  target_id     TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_audit_logs_user_ts ON audit_logs (user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action_ts ON audit_logs (action, timestamp DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id);
```

#### `user_activity_logs` (lighter user-activity feed — see `01-…` §2.14)

Drop `tenant_id`. Same append-only enforcement.

#### Five auxiliary timeline tables (all append-only)

- `observation_timeline` (per observation)
- `policy_activity_log` (per policy)
- `risk_history` (per risk)
- `circular_timeline` (per circular)
- `sama_letter_timeline` (per letter)
- `audit_activity_logs` (per audit — was `audit_logs` in spec; renamed to avoid collision)

All six share: append-only DB enforcement (see §6), INSERT-only RLS, no UPDATE/DELETE routes exposed.

---

### 2.17 Domain: Scoring cache

#### `compliance_scores_cache`

```sql
CREATE TABLE compliance_scores_cache (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id   TEXT NOT NULL DEFAULT 'overall',  -- sentinel; not nullable to keep UNIQUE working
  period_filter  TEXT NOT NULL CHECK (period_filter IN ('3months','6months','12months','fiscal')),
  department_id  UUID REFERENCES departments(id),  -- NULL = whole org
  inputs_hash    TEXT NOT NULL,  -- sha256 of (audits, observations, risks, policies, trainings) input set
  overall        NUMERIC NOT NULL,
  change_pct     NUMERIC NOT NULL DEFAULT 0,
  confidence     TEXT NOT NULL,
  components     JSONB NOT NULL,
  deductions     JSONB NOT NULL DEFAULT '[]',
  trend          JSONB NOT NULL DEFAULT '[]',
  calculated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  UNIQUE (framework_id, period_filter, department_id, inputs_hash)
);

CREATE INDEX idx_compliance_scores_lookup ON compliance_scores_cache (framework_id, period_filter, department_id, calculated_at DESC);
```

- **RLS:** SELECT all authenticated; INSERT/UPDATE service-role only.
- **Trigger:** on any source-table mutation (audits, observations, risks, policies, trainings, framework_weights, compliance_settings) → call `updateTag('compliance')` from the Route Handler; the cache row is then ignored until the next score request rebuilds it. The `expires_at` column allows time-based eviction too.
- **Sources:** server-side compliance engine (§7), consumed by `useComplianceScore` hook.

---

### 2.18 Domain: Jobs (the pg-boss substitute)

#### `jobs`

```sql
CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,  -- 'compliance.score.recalculate' | 'policy.status.check' | ...
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed','dead')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  idempotency_key TEXT,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (name, idempotency_key)  -- safe to skip with NULL idempotency_key (Postgres NULLS DISTINCT default)
);

CREATE INDEX idx_jobs_claim ON jobs (status, scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_jobs_name_status ON jobs (name, status);
```

- **RLS:** service-role only.
- **Claim pattern:** `SELECT … FOR UPDATE SKIP LOCKED LIMIT 5` from the cron worker.
- See §9.

---

### 2.19 Domain: System lookups

`role_permissions` (already shown above). Optional: `regulatory_bodies(id TEXT PK, label TEXT, label_ar TEXT)` if `frameworks.id` doesn't carry that itself — in MVP merge into `frameworks`.

---

## 3. RBAC matrix

### 3.1 Roles

| Frontend role | Backend role | Notes |
|---|---|---|
| officer (default) | `auditor` | View + comment + observation full access (create/edit). |
| officer (read-only) | `viewer` | View only across all modules. Provisioned by `invite payload { readOnly:true }`. |
| manager | `compliance_officer` | Create, edit, comment, export. No delete, no settings. |
| admin | `org_admin` | Full access. |

### 3.2 Permission matrix (25 permissions × 4 roles)

Verbatim from `01-backend-spec-extract.md` §4. Rows are the canonical permission strings; `useCan('audit:create')` etc. resolves against this.

| Permission | viewer | auditor | compliance_officer | org_admin |
|---|:---:|:---:|:---:|:---:|
| `view` | ✓ | ✓ | ✓ | ✓ |
| `comment` | — | ✓ | ✓ | ✓ |
| `create` | — | — | ✓ | ✓ |
| `edit` | — | — | ✓ | ✓ |
| `delete` | — | — | — | ✓ |
| `audit:view` | ✓ | ✓ | ✓ | ✓ |
| `audit:comment` | — | — | ✓ | ✓ |
| `audit:create` | — | — | ✓ | ✓ |
| `audit:edit` | — | — | ✓ | ✓ |
| `audit:delete` | — | — | — | ✓ |
| `observation:view` | ✓ | ✓ | ✓ | ✓ |
| `observation:comment` | — | ✓ | ✓ | ✓ |
| `observation:create` | — | ✓ | ✓ | ✓ |
| `observation:edit` | — | ✓ | ✓ | ✓ |
| `observation:delete` | — | — | — | ✓ |
| `report:view` | ✓ | ✓ | ✓ | ✓ |
| `report:create` | — | — | ✓ | ✓ |
| `report:delete` | — | — | — | ✓ |
| `export` | ✓ | ✓ | ✓ | ✓ |
| `settings:view` | — | — | — | ✓ |
| `settings:edit` | — | — | — | ✓ |
| `team:view` | — | — | — | ✓ |
| `team:invite` | — | — | — | ✓ |
| `team:edit` | — | — | — | ✓ |
| `team:remove` | — | — | — | ✓ |

### 3.3 Permission strings used by the frontend (mapped to backend perms)

The Zustand stores call `requirePermission(<label>)` with human strings; these map to the canonical backend perms above. The canonical mapping table:

| Frontend label | Backend perms required |
|---|---|
| `'Configure Lists & Categories'` | `settings:edit` |
| `'Configure Frameworks'` | `settings:edit` |
| `'Manage Settings'` | `settings:view` (page gate) + `settings:edit` (mutation gate) |
| `'Manage Team & Permissions'` | `team:view`, `team:invite`, `team:edit`, `team:remove` |
| `'Manage Policy Templates'` | `settings:edit` |
| `'Manage Audit Templates'` | `settings:edit` |
| `'Manage Letter Templates'` | `settings:edit` |
| `'Approve Policy Reviews'` | `edit` (policies) — only by manager+; logs `policy.approval_step_committed` |
| `'Approve SAMA Letters'` | `edit` (sama_letters) — manager+; logs `samaLetter.approval_step_committed` |
| `'Manage Audit Findings'` | `audit:edit`, `observation:edit`, risk equivalents |

The full canonical list, seeded into `role_permissions`, lives in `lib/auth/permissions.ts` and is the authoritative reference for both `useCan` (client) and `auth_has_permission` (RLS).

### 3.4 Special-case: observation ownership rules

Observations have layered access on top of the role matrix (per `01-…` §4 "Observation-Specific Ownership Rules"):

- **Leader permissions:** creator OR currently-transferred leader (`observations.leader_id`) can edit, transfer leadership, approve closure.
- **Assignee permissions:** any row in `observation_assignees(observation_id, user_id)` can submit remediation, upload documents, request closure.
- **Closure review:** leader OR `org_admin`/`compliance_officer` approves/rejects closure.
- **Comment ownership:** users can edit/delete their own comments; `compliance_officer`+ can edit any.

Enforced at the **service layer** (Route Handler), not RLS — RLS guarantees role-level access; ownership checks are service-layer + return 403 on violation. Sketch:

```ts
// lib/services/observations.ts
async function assertCanSubmitRemediation(obsId: string, userId: string) {
  const obs = await repos.observations.findById(obsId);
  const isLeader = obs.leader_id === userId;
  const isAssignee = await repos.observations.isAssignee(obsId, userId);
  if (!isLeader && !isAssignee) throw new ForbiddenError('observation.remediation.not_owner');
}
```

---

## 4. API surface (Next.js Route Handlers)

~160 endpoints across 25 resource families. All endpoints:

- **Auth:** `authenticated` (cookie session via `@supabase/ssr`) unless marked anonymous. Permission checks run server-side via `auth_has_permission()` (mirrors the RLS function).
- **Response cache:** non-mutating GETs use `unstable_cache` / `use cache` directive with `cacheTag(<resource>)` and `cacheLife({ stale:60, revalidate:300, expire:3600 })` unless noted. Browser `Cache-Control: private, max-age=0, must-revalidate` so revalidation goes through Next's fetch cache, not the browser.
- **Mutations:** call `updateTag(<resource>, <resource:id>)` on success, plus `updateTag('compliance')` for any source-table mutation that feeds the scoring engine.
- **Validation:** Zod schemas per body in `lib/schemas/<resource>.ts`.
- **Pagination:** `?page=1&pageSize=10` (default 10). Sort `?sort=createdAt&dir=desc`. Filter via per-resource query params.
- **Audit log:** every mutation writes a row to `audit_logs` (and the relevant per-entity timeline) inside the same transaction.

### 4.1 Auth (5 endpoints) — `lib/services/auth.ts`

| Method | Path | Auth | Body | Response | Cache | Side effects |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | anonymous | `{ email, password }` | `{ user, sessionExpiresAt }` (cookie set) | no-store | `audit_logs: 'auth.login'` |
| POST | `/api/auth/logout` | authenticated | — | 204 | no-store | `audit_logs: 'auth.logout'` |
| POST | `/api/auth/forgot-password` | anonymous | `{ email }` | 204 | no-store | Supabase Auth email |
| GET | `/api/auth/me` | authenticated | — | `User` | `cacheTag('me')` | — |
| PATCH | `/api/auth/me` | authenticated | `Partial<User>` | `User` | — | `updateTag('me')`, audit log |

- **Stores:** `useAuthStore`.
- **Pages:** `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email`.
- **Note:** sign-up is **disabled in MVP** (admin-creates-users via `/api/team/invite`). The `/sign-up` page can stay but POST is closed.

### 4.2 Audits (12) — `lib/services/audits.ts`

| Method | Path | Permission | Body | Cache tag | Side effects |
|---|---|---|---|---|---|
| GET | `/api/audits` | `audit:view` | — | `audits` | — |
| GET | `/api/audits/:id` | `audit:view` | — | `audits:<id>` | — |
| POST | `/api/audits` | `audit:create` | `CreateAuditDTO` | invalidate `audits` | `audit_activity_logs`, `audit_logs`, `updateTag('audits','compliance')` |
| PATCH | `/api/audits/:id` | `audit:edit` | `Partial<Audit>` | invalidate `audits`, `audits:<id>` | same |
| DELETE | `/api/audits/:id` | `audit:delete` | — | invalidate | soft-delete, `audit_logs` |
| POST | `/api/audits/:id/documents` | `audit:edit` | multipart | invalidate `audits:<id>` | Storage upload, `audit_activity_logs` |
| DELETE | `/api/audits/:id/documents/:docId` | `audit:edit` | — | invalidate | — |
| POST | `/api/audits/:id/team` | `audit:edit` | `{ userId, role }` | invalidate | — |
| DELETE | `/api/audits/:id/team/:memberId` | `audit:edit` | — | invalidate | — |
| POST | `/api/audits/:id/comments` | `audit:comment` | `{ content }` | invalidate `audits:<id>` | — |
| PATCH | `/api/audits/:id/comments/:cid` | `audit:comment` + ownership | `{ content }` | invalidate | — |
| DELETE | `/api/audits/:id/comments/:cid` | `audit:comment` + ownership | — | invalidate | — |

- **Stores:** `useAuditStore`, `useAuditTaskStore`, `useAuditLogStore`.
- **Pages:** `/reports/audits`, `/reports/[auditId]`, `/reports/executive`, `/reports/compliance-review`.

### 4.3 Audit tasks (5)

| Method | Path | Permission | Cache tag |
|---|---|---|---|
| GET | `/api/audits/:auditId/tasks` | `audit:view` | `audits:<auditId>:tasks` |
| POST | `/api/audits/:auditId/tasks` | `audit:edit` | invalidate |
| PATCH | `/api/audit-tasks/:id` | `audit:edit` | invalidate |
| DELETE | `/api/audit-tasks/:id` | `audit:edit` | invalidate |
| PATCH | `/api/audit-tasks/:id/toggle` | `audit:edit` | invalidate, `updateTag('compliance')` |

### 4.4 Audit-log feed (2)

| Method | Path | Permission | Cache tag |
|---|---|---|---|
| GET | `/api/audits/:auditId/logs` | `audit:view` | `audits:<auditId>:logs` |
| GET | `/api/audit-logs` | `org_admin` | `audit-logs` |

### 4.5 Observations (17) — `lib/services/observations.ts`

Complete CRUD + workflow + ownership-gated transitions. See `01-…` §3.5 for full table; permissions per matrix + ownership rules per §3.4 above.

Endpoints:
1. `GET /api/observations` → `observation:view`, cache `observations`.
2. `GET /api/observations/:id` → `observation:view`, cache `observations:<id>`.
3. `POST /api/observations` → `observation:create`.
4. `PATCH /api/observations/:id` → `observation:edit` + ownership.
5. `DELETE /api/observations/:id` → `observation:delete`, soft delete.
6. `POST /api/observations/:id/comments` → `observation:comment`.
7. `PATCH /api/observations/:id/comments/:cid` → comment owner OR `manager`.
8. `DELETE /api/observations/:id/comments/:cid` → same.
9. `POST /api/observations/:id/checklist` → `observation:edit` + ownership.
10. `PATCH /api/observations/:id/checklist/:iid` → same.
11. `DELETE /api/observations/:id/checklist/:iid` → same.
12. `POST /api/observations/:id/documents` → `observation:edit` + ownership/assignee.
13. `DELETE /api/observations/:id/documents/:did` → same.
14. `POST /api/observations/:id/remediation` → leader OR assignee.
15. `PATCH /api/observations/:id/remediation/review` → leader OR manager+.
16. `POST /api/observations/:id/closure` → leader OR assignee.
17. `PATCH /api/observations/:id/closure/review` → leader OR manager+.
18. `PATCH /api/observations/:id/leader` → leader OR admin (`transferLeadership`).

Every mutation invalidates `observations` + `observations:<id>` + `compliance`, writes `observation_timeline` and `audit_logs`.

- **Stores:** `useObservationStore`.
- **Pages:** `/correspondence/observations` (full slice), aggregated into `/correspondence/feed`.

### 4.6 Risks (9 + workflow)

Base CRUD per `01-…` §3.6:
- `GET /api/risks`, `GET /api/risks/:id`, `POST /api/risks`, `PATCH /api/risks/:id`, `DELETE /api/risks/:id` → `audit:edit` (department workflow gated separately).
- `POST /api/risks/:id/checklist`, `PATCH /api/risks/:id/checklist/:iid`, `DELETE /api/risks/:id/checklist/:iid`.
- `GET /api/risks/:id/history` → `audit:view`.

Add per stores doc §41 (officer workflow):
- `PATCH /api/risks/:id/department` `{ deptId }` → `audit:edit`.
- `PATCH /api/risks/:id/deadline` `{ deadline }` → `audit:edit`.
- `POST /api/risks/:id/send-to-department` → officer (`audit:edit`) — transitions `mitigation_workflow_status → 'sent-to-department'`.
- `POST /api/risks/:id/department-plan` `{ plan, checklist }` → department user — transitions to `'plan-proposed'`.
- `POST /api/risks/:id/department-plan/accept` → officer (`audit:edit`) — transitions to `'in-progress'`.
- `PATCH /api/risks/:id/department-plan/items/:itemId/toggle` → officer.

Every mutation invalidates `risks`, `risks:<id>`, `compliance`; writes `risk_history`.

- **Stores:** `useRiskStore`.
- **Pages:** `/reports/risks`, `/reports/executive`.

### 4.7 Policies (15 + workflow)

Per `01-…` §3.7 plus workflow ops from `usePolicyStore`:
- Standard CRUD + `submit-review`, `approve`, `initiate-review` (gated `Approve Policy Reviews`).
- `POST/DELETE` attachments and evidence.
- `POST/PATCH` workflow steps with deadline validation.
- `GET /api/policies/review-alerts` → policies due within 90 days or expired.

Invalidate `policies`, `policies:<id>`, `compliance` on mutation; write `policy_activity_log` and `audit_logs`.

- **Stores:** `usePolicyStore`, `usePolicyTemplateStore`.
- **Pages:** `/correspondence/regulatory-updates/policies` (PAGE_SIZE=10), `/correspondence/registry`, `/reports/compliance-review`.

### 4.8 Circulars (11 + workflow)

Per `01-…` §3.8. Add per stores doc §39:
- `POST /api/circulars/:id/articles/:aid/checklist` and `PATCH` toggle.
- `POST /api/circulars/:id/articles/:aid/attachments`.
- Edit-approval workflow: `POST /:id/pending-edit`, `PATCH /:id/pending-edit/approve/:stepId`, `PATCH /:id/pending-edit/reject/:stepId`.
- `POST /api/circulars/:id/cap-attachments`, `POST /api/circulars/:id/remediation-attachments`.
- `PATCH /api/circulars/:id/business-owner` `{ deptId }`.
- `PATCH /api/circulars/:id/pdf-url` (data-URL store).

Invalidate `circulars`, `circulars:<id>`, `compliance`. Write `circular_timeline`.

- **Stores:** `useCircularStore`.
- **Pages:** `/correspondence/regulatory-updates/rules` (PAGE_SIZE=10), `/correspondence/registry`, `/correspondence/feed`.

### 4.9 SAMA letters (12) — see `01-…` §3.9 + stores §42

Full CRUD + approval workflow (`submit`, `approve/:step`, `reject/:step`), `send` (computes `response_deadline`), `response-received`, attachments. Step actions gated by `Approve SAMA Letters`.

Invalidate `sama-letters`, `sama-letters:<id>`. Write `sama_letter_timeline` + `audit_logs`.

- **Stores:** `useSAMALetterStore`.
- **Pages:** `/correspondence/letters`.

### 4.10 Correspondence (5) — `01-…` §3.10

Standard CRUD. Stores: `useCorrespondenceStore`. Pages: `/correspondence/feed`, `/correspondence/registry`.

### 4.11 Advisory (7) — `01-…` §3.11

Standard CRUD + notes + status. Stores: `useAdvisoryStore`. Page: `/correspondence/advisory`.

### 4.12 Calendar events (5) — `01-…` §3.12

Standard CRUD. Stores: `useCalendarStore`. Page: `/calendar`.

### 4.13 Training (11) — `01-…` §3.13

Course CRUD, employee CRUD, course-progress PATCH, overview stats GET (cached), saudization GET/PUT, CSV upload POST. Stores: `useTrainingStore`. Page: `/team/training` (deep-link `?employeeId=`).

### 4.14 Team (8) — `01-…` §3.14

CRUD + invite + permissions + task assignment shuffling. Stores: `useTeamStore`, `useUserLogStore`. Pages: `/team/directory`, `/team/logs`.

### 4.15 User-activity log (1)

`GET /api/user-logs` → `team:view` (admin), pagination, search by user/action/date.

Stores: `useUserLogStore`. Page: `/team/logs`, `/reports/detailed`.

### 4.16 Messages (8) — `01-…` §3.16

Threads CRUD + messages CRUD + read marker + member management. Stores: `useMessageStore`.

### 4.17 Notifications (5) — `01-…` §3.17

GET (with unreadCount), mark-as-read, mark-all-read, delete, clear-all. Stores: `useNotificationStore`.

### 4.18 Reports (5) — `01-…` §3.18

CRUD + generate + download. `generate` enqueues a `report.generate` job; download streams from Storage. Stores: `useReportStore`. Pages: `/reports/(tabs)/*`.

### 4.19 Departments (4) — `01-…` §3.19

CRUD on `departments`. Stores: `useDepartmentStore`. Used by virtually every detail page.

### 4.20 Lookup CRUD (8 endpoints × ~12 lookup tables ≈ 32 endpoints)

For each of: `business_units`, `onboarding_regions`, `onboarding_industries`, `onboarding_headcount_buckets`, `calendar_event_types`, `correspondence_types`, `letter_types`, `risk_categories`, `policy_categories`, `audit_categories`, `training_categories`, `framework_sub_categories`, `authority_departments`, `scale_label_overrides` —

```
GET    /api/<resource>
POST   /api/<resource>
PATCH  /api/<resource>/:id
DELETE /api/<resource>/:id
```

Plus `useFrameworkSubCategoryStore` filter `?frameworkId=` and `useAuthorityDeptStore` filter `?authorityId=`.

All gated by `settings:edit` for mutations. Cache tag = resource name.

### 4.21 Frameworks (6) — `01-…` §3.20

GET list/:id, PATCH config, PATCH toggle enabled, GET/PATCH pinned. Cache tag `frameworks`; mutation invalidates `frameworks` + `compliance`.

### 4.22 Compliance scoring (3) — `01-…` §3.21

| Method | Path | Query | Permission | Cache | Notes |
|---|---|---|---|---|---|
| GET | `/api/compliance/score` | `?period=3months\|6months\|12months\|fiscal&deptId=<uuid>` | `view` | `cacheTag('compliance')`, life 1h | Track A overall + 5 components |
| GET | `/api/compliance/score/:frameworkId` | same | `view` | same | Track B per-framework, 5 computed components |
| POST | `/api/compliance/recalculate` | — | `org_admin` | invalidate `compliance` | Enqueues `compliance.score.recalculate` job; returns `{ jobId }` |

See §7 for the engine.

### 4.23 Settings & preferences (4) — `01-…` §3.22

GET/PUT compliance-settings (singleton weights+target). GET/PUT user-preferences (own row).

### 4.24 Templates (12) — `01-…` §3.23

CRUD on `audit_templates`, `policy_templates`, `sama_letter_templates`. Stores: `useAuditTemplateStore`, `usePolicyTemplateStore`, `useSAMATemplateStore`. Used during entity creation flows.

### 4.25 Requirements (5) — `01-…` §3.24

Standard CRUD on the `requirements` table. Optional in MVP; defer if not needed.

### 4.26 PDF export (2) — `01-…` §3.25 + §8 below

| Method | Path | Body | Permission |
|---|---|---|---|
| POST | `/api/export/pdf` | `{ template, data, meta, options }` | `export` |
| GET | `/api/export/pdf/:jobId` | — | `export` |

`POST` enqueues a `pdf.generate` job (or compiles synchronously if `meta.locale==='en'` and entity is small — sync path is for ≤30s compiles). Returns `{ jobId }`. `GET` streams the binary from Supabase Storage (`application/pdf`) once the job is complete; polled by client. **Cache:** none — always fresh.

### 4.27 Help (3)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/help/articles` | authenticated, cached `help-articles` (life 24h) |
| GET | `/api/help/articles/:id` | authenticated, cached `help-articles:<id>` |
| POST | `/api/help/views` | authenticated (own user) |

### 4.28 Compliance evaluations (3)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/compliance-evaluations` | `view` |
| PUT | `/api/compliance-evaluations/:kind/:itemId/:deptId` | `edit` |
| DELETE | `/api/compliance-evaluations/:kind/:itemId/:deptId` | `delete` |

### Endpoint count summary

| Group | Count |
|---|---|
| Auth | 5 |
| Audits + tasks + log | 19 |
| Observations | 18 |
| Risks | 13 |
| Policies | 15 |
| Circulars | 14 |
| SAMA letters | 12 |
| Correspondence | 5 |
| Advisory | 7 |
| Calendar | 5 |
| Training | 11 |
| Team | 8 |
| User-activity log | 1 |
| Messages | 8 |
| Notifications | 5 |
| Reports | 5 |
| Departments | 4 |
| Lookup CRUD | 32 |
| Frameworks | 6 |
| Compliance scoring | 3 |
| Settings/prefs | 4 |
| Templates | 12 |
| Requirements | 5 |
| PDF export | 2 |
| Help | 3 |
| Compliance evaluations | 3 |
| **Total** | **~219** (over-counted vs. spec's "~160" because lookup CRUD is explicit here) |

---

## 5. Auth & session

### 5.1 Supabase Auth flows

- **Sign-up: disabled in MVP.** The `/sign-up` page UI exists but the API endpoint returns 403. Users are provisioned exclusively via `POST /api/team/invite` (admin-only). The invite endpoint:
  1. Validates the inviter has `team:invite`.
  2. Calls `supabase.auth.admin.createUser({ email, email_confirm: false, app_metadata: { role, permissions: [] } })`.
  3. INSERTs a `profiles` row.
  4. Triggers `supabase.auth.admin.inviteUserByEmail` to send the magic-link.
  5. Writes an `audit_logs` row `'team.invite'`.
- **Sign-in:** `POST /api/auth/login` calls `supabase.auth.signInWithPassword`. Cookie set by `@supabase/ssr` (httpOnly, secure, SameSite=Lax). Returns the user payload + `sessionExpiresAt`.
- **Password reset:** `POST /api/auth/forgot-password` calls `supabase.auth.resetPasswordForEmail`. Returns 204 regardless (anti-enumeration).
- **Sign-out:** `POST /api/auth/logout` calls `supabase.auth.signOut`; cookie cleared.
- **Email verification:** Supabase Auth sends verification on user creation; `?verified=true&token=<jwt>` deep-link to `/verify-email` triggers `supabase.auth.verifyOtp` server-side.
- **MFA:** TOTP via Supabase Auth `mfa.enroll/verify/challenge`. Not in MVP Phase 1 — deferred to Phase 2 (post-pilot). Schema-ready (Supabase handles it).

### 5.2 Session storage (cookie)

- Use `@supabase/ssr` `createServerClient` in Route Handlers / Server Components, `createBrowserClient` in client components.
- Cookie name set per project; `cookieOptions: { sameSite: 'lax', secure: true, path: '/' }`.
- Session refresh: middleware (`middleware.ts`) calls `supabase.auth.getUser()` on every request to keep the session warm and refresh tokens before expiry.
- **Never trust `getSession()` for auth checks** — always use `getUser()` (per Supabase 2025 best practice; `getSession` reads the cookie without verification).

### 5.3 Middleware: route protection

```ts
// middleware.ts (simplified)
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(/* env, req.cookies, res.cookies */);
  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/sign-in') || path.startsWith('/sign-up')
                   || path.startsWith('/forgot-password') || path.startsWith('/verify-email');
  const isDashboard = path.startsWith('/dashboard') || path.startsWith('/correspondence')
                   || path.startsWith('/reports') || path.startsWith('/team')
                   || path.startsWith('/calendar') || path.startsWith('/settings');

  if (isDashboard && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth/login).*)'],
};
```

### 5.4 JWT custom claims

Supabase JWT carries `app_metadata.role`, `app_metadata.permissions[]`. Read in RLS via `auth.jwt() -> 'app_metadata' ->> 'role'`. Updated via `supabase.auth.admin.updateUserById` whenever team/permissions change.

---

## 6. Audit log & user activity

### 6.1 Two-layer logging model

1. **`audit_logs`** (global, SAMA-grade, tamper-proof) — every API mutation writes one row inside the same transaction. Append-only at the DB role level.
2. **`user_activity_logs`** (lighter cross-entity feed for `/team/logs` UI) — also append-only.
3. **Five auxiliary timelines** — `observation_timeline`, `policy_activity_log`, `risk_history`, `circular_timeline`, `sama_letter_timeline`, `audit_activity_logs` (per-audit) — all append-only, all written by the service layer or DB triggers.

Schema for `audit_logs` is in §2.16. For the five auxiliary tables and `user_activity_logs`, schema is in `01-…` §2.6, §2.7, §2.8, §2.9, §2.10, §2.14.

### 6.2 Append-only enforcement (the M3 exit gate)

```sql
-- Run as the migration's setup role (superuser equivalent):

-- 1. Revoke any incidental write privileges
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON user_activity_logs FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON observation_timeline FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON policy_activity_log FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON risk_history FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON circular_timeline FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON sama_letter_timeline FROM authenticated, anon, service_role, postgres;
REVOKE UPDATE, DELETE ON audit_activity_logs FROM authenticated, anon, service_role, postgres;

-- 2. Grant INSERT to the app role used by Route Handlers
GRANT INSERT, SELECT ON audit_logs TO authenticated;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO authenticated;
-- repeat for the other six tables

-- 3. RLS allows INSERT for authenticated, SELECT scoped by role
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_logs_select_own_or_admin ON audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth_has_permission('team:view'));
```

### 6.3 Retention

- **Default: 7 years** per SAMA-style audit-trail expectations (10 years was the spec's default — revised down to 7 for MVP per the project's regulatory pin in §11 of the scope doc; orchestrator may bump to 10 trivially).
- **Cron purge job:** `audit.log.purge` runs monthly under a separate Postgres role `audit_admin` (which DOES have DELETE on the audit tables). The job:
  1. Computes cutoff = `now() - interval '7 years'`.
  2. DELETEs rows in batches of 10k FROM `audit_logs WHERE timestamp < cutoff` (and similarly for the others).
  3. Writes its own `audit_admin_actions` row recording the purge.
- The `audit_admin` role is **not the app role**. App code can never DELETE.

```sql
CREATE ROLE audit_admin NOLOGIN;
GRANT DELETE ON audit_logs, user_activity_logs, observation_timeline,
                policy_activity_log, risk_history, circular_timeline,
                sama_letter_timeline, audit_activity_logs TO audit_admin;

CREATE TABLE audit_admin_actions (
  id          BIGSERIAL PRIMARY KEY,
  action      TEXT NOT NULL,
  rows_deleted BIGINT NOT NULL,
  cutoff      TIMESTAMPTZ NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT now(),
  performed_by TEXT NOT NULL  -- 'cron:audit.log.purge'
);
```

### 6.4 Write pattern (every service does this)

```ts
// lib/services/_base.ts
export async function withAuditLog<T>(
  supabase: SupabaseClient,
  action: string,
  targetType: string,
  targetId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { data: { user } } = await supabase.auth.getUser();
  const result = await fn();
  await supabase.from('audit_logs').insert({
    user_id: user!.id,
    user_name: user!.email,
    action,
    status: 'completed',
    target_type: targetType,
    target_id: targetId,
    metadata: { /* request meta */ },
  });
  return result;
}
```

---

## 7. Compliance scoring engine

### 7.1 Port plan

- **Source:** `src/lib/compliance-engine.ts` (~585+ lines).
- **Target:** `lib/services/compliance-score.ts` (server). Engine logic moves verbatim — the only delta is data access (reads from Supabase repos, not from Zustand `getState()`).
- **Endpoint:** `GET /api/compliance/score?period=3months&deptId=<uuid>` (Track A) and `GET /api/compliance/score/:frameworkId?period=...` (Track B).
- **Frontend hook:** `useComplianceScore({ period, frameworkId? })` becomes a `useSWR` / `cache()`-wrapped fetcher that hits the API. Stores stop computing; reads stay synchronous via cache.
- **Golden tests:** snapshot the result of the in-browser engine for 6 fixtures (period × framework combos), then the server port must match to 0.1 precision (per scope §M5 exit gate).

### 7.2 Track A — Overall score (5 components)

See `01-…` §8.1. Components, default weights (configurable via `compliance_settings.weights`):
- Audit Completion 25%
- Observation Closure 25%
- Risk Posture 20%
- Policy Currency 15%
- Training Completion 15%

Insufficient confidence (`≤2` data points) excludes a component and renormalizes remaining weights.

### 7.3 Track B — Per-framework (5 computed from 7 stored)

See `01-…` §8.2 — the 7→5 mapping MUST be preserved bit-for-bit.

| Computed component | Stored weight(s) sum |
|---|---|
| Audits | `audits` |
| Observations | `observations` |
| Circulars | `circulars` |
| Policies | `policies` |
| Tasks | `letters + risk_posture + training` |

Tasks formula: `completion×50% − overdue×30% + severity×20%`. Data filtered by `framework_ids @> ARRAY[<frameworkId>]`.

### 7.4 Deductions, period filtering, trend

Per `01-…` §8.3–8.5. Deduction rules verbatim. Periods: `3months | 6months | 12months | fiscal` (fiscal = Jan 1 – Dec 31). Trend = quarterly snapshots for fiscal, monthly for others, each computed with cumulative data up to the snapshot date.

### 7.5 Caching

- **Cache table:** `compliance_scores_cache` (§2.17). PK on `(framework_id, period_filter, department_id, inputs_hash)` with `inputs_hash` = SHA-256 of the concatenated `id+updated_at` of every source row in scope (audits, observations, risks, policies, training, framework_weights, compliance_settings).
- **Cache lookup flow:**
  1. Service computes `inputs_hash`.
  2. SELECT row by PK. If found and `expires_at > now()`, return it.
  3. Otherwise compute, INSERT, return.
- **Invalidation:** any mutation to a source table calls `updateTag('compliance')` from the Route Handler. Next 16 Cache Components then evicts the `GET /api/compliance/score*` cache entry. The DB cache row is also stale because `inputs_hash` no longer matches.
- **TTL:** `expires_at = now() + interval '1 hour'` as a belt-and-suspenders.
- **Recalculate job:** `POST /api/compliance/recalculate` enqueues `compliance.score.recalculate` (§9), which walks all (period × framework × dept) combinations and warms the cache. Useful after bulk imports.

### 7.6 Multi-tenancy note (Future)

When multi-tenant lands, every cache row needs `tenant_id`, and the engine input set is filtered by tenant. The schema is ready (just add the column; see §12).

---

## 8. PDF / LaTeX pipeline

### 8.1 Engine & fonts

- **Engine:** `xelatex` only (per TC #3 / constraint 4).
- **Packages:** `polyglossia`, `fontspec`, `geometry`, `fancyhdr`, `lastpage`, `xcolor`, `tikz`, `pgfplots`, `longtable`, `draftwatermark`, `graphicx`.
- **Latin font:** **Inter** (system OpenType) via `\setmainfont{Inter}`.
- **Arabic font:** **Amiri** via `\newfontfamily\arabicfont{Amiri}`. Fallback: Noto Naskh Arabic.
- **Mono:** system mono (`\setmonofont`).
- **Docker base layer:**
  ```dockerfile
  FROM node:22-slim
  RUN apt-get update && apt-get install -y --no-install-recommends \
        texlive-xetex texlive-lang-arabic texlive-fonts-recommended \
        texlive-latex-extra fonts-noto fontconfig && \
      mkdir -p /usr/share/fonts/truetype/amiri && \
      curl -L https://github.com/aliftype/amiri/releases/latest/download/Amiri-Regular.ttf \
           -o /usr/share/fonts/truetype/amiri/Amiri-Regular.ttf && \
      fc-cache -fv && \
      rm -rf /var/lib/apt/lists/*
  ```
- **Vercel Function:** the `/api/export/pdf/render` route runs as a Vercel Function with a custom Docker runtime. Timeout: **300s** (Fluid Compute paid tier; free tier is 60s — see §13 open question). Streams `application/pdf` back to the client.

### 8.2 Templates

Per `04-…` §4.2 table:
1. `base.tex` — shared preamble, colors, fonts, fancyhdr, severity/status badges.
2. `cover.tex` — cover page (title, subtitle, org, date, classification).
3. `observation-list.tex` — observations export (longtable + severity bar chart).
4. `compliance-report.tex` — executive scorecard (framework table, trend chart, deadlines).
5. `audit-report.tex` — audit metadata + findings + activity log.
6. `risk-register.tex` — landscape, 5×5 TikZ heat map + longtable.
7. `sama-letter.tex` — bilingual letterhead, signature block, no `fancyhdr` on page 1.
8. `correspondence-tracker.tex` — generalized correspondence export.
9. `training-report.tex` — per-employee rows.
10. `calendar-export.tex` — date-grouped events.
11. `generic-table.tex` — fallback dynamic-table renderer.

### 8.3 API contract

`POST /api/export/pdf` body per `04-…` §4.7 (verbatim):

```ts
{
  template: 'compliance-report' | 'audit-report' | 'observation-list'
          | 'risk-register' | 'sama-letter' | 'correspondence-tracker'
          | 'training-report' | 'calendar-export' | 'generic-table',
  data: Record<string, unknown>,
  meta: {
    title: string, subtitle?: string,
    generatedBy: string, organization: string,
    locale: 'en' | 'ar', dateFormat?: string,
  },
  options?: {
    orientation?: 'portrait' | 'landscape',
    includeCharts?: boolean, includeSummary?: boolean,
    watermark?: string,
    headerLogo?: string,  // base64 PNG
  },
}
```

Returns `Content-Type: application/pdf` binary on sync path, or `{ jobId }` on async path (poll `GET /api/export/pdf/:jobId`).

### 8.4 Sanitization (the non-negotiable production gate)

Verbatim from `01-…` §9.3 + `04-…` §4.9. Backslash escape FIRST, then `& % $ # _ { } ~ ^`. Plus block-list: `\input`, `\include`, `\write`, `\read`, `\def`, `\newcommand`, `\catcode`, `\openout`, `\immediate`. Applied recursively over every string in the request body before Handlebars rendering.

```ts
// lib/services/latex/sanitize.ts
const LATEX_ESCAPE_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',  // MUST be first
  '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
const BLOCKLIST = /\\(input|include|write|read|def|newcommand|catcode|openout|immediate)\b/gi;

export function sanitizeLatex(s: string): string {
  return s
    .replace(/\\/g, LATEX_ESCAPE_MAP['\\'])
    .replace(/[&%$#_{}~^]/g, c => LATEX_ESCAPE_MAP[c] ?? c)
    .replace(BLOCKLIST, '\\$1\\_BLOCKED');
}
```

### 8.5 Compile flow

1. `POST /api/export/pdf` → validate body, sanitize all strings.
2. Render Handlebars template → `output.tex` in temp dir.
3. Run `xelatex -interaction=nonstopmode -halt-on-error output.tex` twice (TOC + lastpage).
4. Upload `output.pdf` to Supabase Storage bucket `pdf-exports/<jobId>.pdf`.
5. Insert `reports` row with `status='ready'`, `storage_path=<bucket>/<jobId>.pdf`.
6. Write `audit_logs` row `'EXPORT_PDF'`.

### 8.6 Audit-log entry per export

Per `04-…` §4.11 — every PDF export writes `audit_logs.action='EXPORT_PDF'` with `target_type='report'`, `target_id=<reportId>`, metadata = `{ template, locale, title }`.

---

## 9. Background jobs (Vercel Cron + `jobs` table)

### 9.1 Why not pg-boss

pg-boss assumes a long-running worker process. Vercel free has no long-running worker — Functions are stateless and time-bound. Replacement:

- **`jobs` table** (§2.18) holds queued/running rows.
- **Vercel Cron** invokes `/api/cron/run` every N minutes (per-job schedule defined in `vercel.json`).
- **`/api/cron/run`** is a Vercel Function that:
  1. Authenticates the request via `Authorization: Bearer <CRON_SECRET>`.
  2. SELECTs up to N (e.g. 5) rows from `jobs` with `status='queued' AND scheduled_for <= now()` `FOR UPDATE SKIP LOCKED`.
  3. UPDATEs each to `status='running', started_at=now()`.
  4. Runs the handler keyed by `jobs.name`.
  5. On success: `UPDATE … SET status='complete', completed_at=now()`. On failure: increment `attempts`; if `attempts >= max_attempts`, set `status='dead'`; else `status='queued'` with exponential-backoff `scheduled_for`.
- **Triggers** (event-driven jobs): an INSERT into `jobs` from any Route Handler enqueues work. Cron's role is then to *also* sweep the queue for any unclaimed rows.

### 9.2 The 10 scheduled jobs

| Job name | Schedule (UTC) | Trigger | Handler summary |
|---|---|---|---|
| `compliance.score.recalculate` | hourly | + event on entity mutation | Walks (period × framework × dept), upserts `compliance_scores_cache`. |
| `policy.status.check` | daily 02:00 | — | Flips `policies` to `overdue` or `requires-review`; notifies owner. |
| `sama.letter.overdue.check` | daily 02:00 | — | Flips sent letters past `response_deadline` → `overdue`; notifies. |
| `audit.overdue.check` | daily 02:00 | — | Flips audits past `due_date` → `overdue`; notifies. |
| `notification.generate` | every 5m | + event-driven | Generates notifications for new assignments, status changes, approaching deadlines. |
| `notification.email.digest` | weekly Mon 08:00 | — | Aggregates unread → email digest if `emailDigestEnabled`. |
| `report.generate` | on-demand | `POST /api/reports/:id/generate` | Async PDF/Excel via LaTeX pipeline; sets `status='ready'`. |
| `training.overdue.check` | daily 02:00 | — | `employee_course_progress.due_date < today` → `overdue`. |
| `circular.cap.deadline.check` | daily 02:00 | — | Notifies on CAP deadline overruns. |
| `burnout.detection` | daily 06:00 | — | Updates `profiles.burnout_since` from overdue-task + workload heuristics. |
| `audit.log.purge` | monthly 1st 03:00 | — | Runs under `audit_admin` role; deletes rows older than 7y. |

### 9.3 Vercel Cron config (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/run?job=compliance.score.recalculate", "schedule": "0 * * * *" },
    { "path": "/api/cron/run?job=policy.status.check", "schedule": "0 2 * * *" },
    { "path": "/api/cron/run?job=sama.letter.overdue.check", "schedule": "5 2 * * *" },
    { "path": "/api/cron/run?job=audit.overdue.check", "schedule": "10 2 * * *" },
    { "path": "/api/cron/run?job=training.overdue.check", "schedule": "15 2 * * *" },
    { "path": "/api/cron/run?job=circular.cap.deadline.check", "schedule": "20 2 * * *" },
    { "path": "/api/cron/run?job=burnout.detection", "schedule": "0 6 * * *" },
    { "path": "/api/cron/run?job=notification.generate", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/run?job=notification.email.digest", "schedule": "0 8 * * MON" },
    { "path": "/api/cron/run?job=audit.log.purge", "schedule": "0 3 1 * *" },
    { "path": "/api/cron/run?job=sweep", "schedule": "*/2 * * * *" }
  ]
}
```

The `sweep` cron picks up any `jobs` rows that were INSERTed by event-driven enqueues (e.g. `report.generate`) and runs them.

---

## 10. Caching & free-tier optimization

### 10.1 The cache layer

- **`use cache` directive** on Server Components and Route Handlers. Default `cacheLife({ stale: 60, revalidate: 300, expire: 3600 })`.
- **`cacheTag(<resource>, <resource:id>)`** on every cached fetch.
- **`updateTag(<resource>, <resource:id>, 'compliance')`** on every mutation that affects scoring.
- **`unstable_cache`** for derived computations (e.g. dashboard aggregates) when the `use cache` directive isn't available.

### 10.2 Cache tag inventory

| Tag | Used by | Invalidated by |
|---|---|---|
| `me` | `GET /api/auth/me` | `PATCH /api/auth/me` |
| `audits` | list endpoint | any audit mutation |
| `audits:<id>` | detail endpoint | mutation of that audit (incl. tasks, docs, comments) |
| `observations`, `observations:<id>` | same pattern | same |
| `risks`, `risks:<id>` | same | same |
| `policies`, `policies:<id>` | same | same |
| `circulars`, `circulars:<id>` | same | same |
| `sama-letters`, `sama-letters:<id>` | same | same |
| `correspondence`, `correspondence:<id>` | same | same |
| `advisory`, `advisory:<id>` | same | same |
| `calendar` | list | any event mutation |
| `frameworks`, `frameworks:pinned` | list/pinned | toggle/edit |
| `training`, `training:saudization`, `training:overview` | sublists | course/employee/saudization mutations |
| `team`, `team:<id>` | directory | invite/update/remove |
| `notifications:<userId>` | list per-user | mark-read/clear |
| `reports` | list | create/delete/generate complete |
| `compliance` | every `GET /api/compliance/score*` | ANY source-table mutation |
| `lookups:<resource>` | each lookup list | mutation of that lookup |
| `help-articles` | list | (none — read-only CMS) |

### 10.3 Query batching pattern

Use Supabase's nested-select to fetch a parent + 2 levels of children in **one** request:

```ts
const { data } = await supabase
  .from('policies')
  .select('*, policy_workflow_steps(*), policy_attachments(*), policy_activity_log(*)')
  .eq('id', policyId)
  .single();
```

Apply on every detail-page endpoint (`GET /api/<resource>/:id`). This collapses what would otherwise be 4–6 queries into 1.

### 10.4 Pagination defaults

`PAGE_SIZE = 10` everywhere (per `03-…`). Page numbering 1-based. Response shape:

```ts
{ data: T[], pagination: { page: number, pageSize: number, total: number, totalPages: number } }
```

Server uses `range(from, to)` on Supabase queries: `from = (page-1) * pageSize, to = from + pageSize - 1`.

### 10.5 Skeleton loading

Add `loading.tsx` per dashboard route. Auth pages do **not** need skeletons (forms render instantly).

| Page | Needs `loading.tsx`? |
|---|---|
| `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email`, `/welcome` | No |
| `/onboarding` | Yes (framework list query) |
| `/dashboard`, `/calendar`, `/settings` | Yes |
| All `/correspondence/*` | Yes |
| All `/reports/*` | Yes |
| All `/team/*` | Yes |
| Redirect-only routes | N/A |

### 10.6 Row-read minimization

- Detail pages: 1 query (nested select).
- List pages: 1 query with `range` + `count: 'exact'` (Postgres counts the rows in the same call when using `select('*, …', { count: 'exact' })`).
- Dashboard: 1 query per widget, all cached `cacheTag('dashboard:<userId>')` with 5-minute revalidate.
- Calendar unified view: 1 aggregate query OR a Postgres function returning the unioned event list (preferred — reduces N queries to 1).

---

## 11. Arabic / i18n storage strategy

### 11.1 Storage rules

- **User-entered text content** (observation descriptions, audit titles, correspondence bodies) is stored **as-is in the language the user typed**. No machine translation, no enforced language.
- **Bilingual columns** exist for any field the scope says must be presented in both languages regardless of input language:
  - `departments.name` / `name_ar`
  - `frameworks.name` / `name_ar`, `description` / `description_ar`
  - Every lookup table: `label` / `label_ar`
  - `sama_letters.subject` / `subject_ar`, `body` / `body_ar`, `recipient_name_*`, `signer_name_*`
  - `sama_letter_templates.default_subject_en` / `default_subject_ar`, body equivalents
  - `audit_templates.default_title` / `default_title_ar`, `default_description` / `default_description_ar`
  - `policy_templates.default_description` / `default_description_ar`
  - `circular_articles` (timeline title and similar): `title` / `title_ar`
  - `policy_activity_log.text_en` / `text_ar`
- **System enums** (status, type, role, severity, action codes) are **canonical English keys**: `'in_progress'`, `'critical'`, `'org_admin'`. AR labels rendered on the client via `dict[lang][enumValue]`.
- **Notifications, audit-log actions, timeline action codes**: same — canonical English keys + i18n dict at render. Where the scope demands AR persistence (e.g. `policy_activity_log.text_ar`, `observation_timeline.description_ar`), store both renderings produced at write time.

### 11.2 Collation & encoding

- Database default UTF-8.
- No special collation needed; Arabic is supported by Postgres's default UTF-8 collation. If sorting needs to honor Arabic alphabetical order, use `ORDER BY <col> COLLATE "ar-x-icu"` on a per-query basis (no need to alter table columns).
- Full-text search: for MVP, `ILIKE '%term%'` is fine. If/when search needs FTS, use `to_tsvector('simple', col)` with the `'simple'` config (locale-agnostic) and add a GIN index.

### 11.3 Rendering rules

- Client reads `useLanguageStore.language` (`'en' | 'ar'`) and `direction` (`'ltr' | 'rtl'`).
- `direction` is derived from language — never persisted independently (it's a render concern). The `profiles.preferred_language` column persists language only.
- PDF: `meta.locale: 'en' | 'ar'` drives template choice (`\setmainlanguage{english}` vs `\setmainlanguage{arabic}`).

---

## 12. Future multi-tenancy migration

When the platform moves to multi-tenant (the scope's "Scale" milestone), the migration is mechanical: add `tenant_id UUID NOT NULL REFERENCES tenants(id)` to every domain table (defaulting to a sentinel UUID for existing rows), add a `tenants` table, add `tenant_id` to the `compliance_scores_cache` PK, and rewrite RLS policies from `auth_has_permission(...)` to `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND auth_has_permission(...)`. JWT custom claims get a `tenant_id` field set by an admin endpoint that calls `supabase.auth.admin.updateUserById`. The scoring engine starts filtering inputs by tenant. The `jobs` table gets a `tenant_id` column so cron handlers run one tenant at a time. The frontend stops being free to read scoring weights from JS — it has to call the API (TC #4). Storage buckets become per-tenant prefixes. Soft-delete grace periods, tenant provisioning flows, and per-tenant onboarding go in. None of this changes the application API surface; it's a schema + middleware migration. The MVP schema is **deliberately one column away** from multi-tenant ready.

---

## 13. Orchestrator decisions (resolves open questions below)

Decisions taken on 2026-05-15 to unblock migration work. These resolve every item in §14:

1. **Region/residency**: Accept eu-central-1 (Frankfurt) for MVP. Document residency gap; revisit at scale. Project `pamfhghrjfizlbhdfycu` already provisioned.
2. **PDF generation**: Always async via `jobs` table. Endpoint returns `{ jobId }`; frontend polls `/api/jobs/[id]`. No sync PDF endpoints.
3. **`requirements` table**: Defer. Use `circulars` only for MVP rules surface.
4. **Realtime sync**: Out of scope. Frontend reads on mount + on-mutation refetch. No Supabase Realtime subscriptions in MVP.
5. **MFA**: Phase 2 (post-pilot). Schema-ready via Supabase Auth; UI deferred.
6. **Sign-up flow**: Public sign-up disabled. `/sign-up` route remains as redirect to `/sign-in` (admin-creates-users via dashboard).
7. **Retention**: 7 years for MVP. Tunable via `compliance_settings.audit_retention_years` (default 7).
8. **Saudization**: JSONB `by_department` shape stays as-is. No new enum.
9. **Audit type**: CHECK constraint (`'internal'|'sama'|'sharia'`) for MVP. FK migration deferred to multi-tenant phase.
10. **Arabic templates in MVP**: SAMA letter + audit report bilingual at launch. Other templates English-only; Arabic in Phase 8.

## 14. Open questions for the orchestrator

1. **Supabase region & SAMA residency.** Supabase managed regions don't include a Saudi region as of synthesis. The scope (§5 regulatory pins) mandates in-Kingdom data residency for SAMA + PDPL. Options: (a) accept the residency gap for MVP (one client, internal use) and document it; (b) self-host Supabase on a Saudi cloud account; (c) pivot to a Postgres-only stack (Supabase Postgres → direct managed Postgres in `me-central` and replace Supabase Auth with Clerk/Auth0/Stack Auth running on Vercel). Discovery-week call.
2. **Vercel Function timeout for PDF.** Free tier = 60s, Pro = 300s with Fluid Compute. Two-pass xelatex on a 50-page risk register typically completes in 5–20s but can spike. If free tier, push all PDF compiles to async jobs (always return `{ jobId }`, never sync). Confirm tier.
3. **`requirements` table — ship or defer?** Scope mentions "rules" indexing alongside circulars. `/correspondence/regulatory-updates/rules` reads `circulars` today, so `requirements` may be redundant in MVP. Ship lazily?
4. **Realtime cross-device sync.** Scope marks this as out-of-scope. The MVP frontend persists state to localStorage; multi-device users will see stale state. Confirm we're accepting that for MVP.
5. **MFA in MVP.** Supabase Auth supports TOTP MFA out of the box but it's not in the MVP scope per the scope doc's framing. Ship MFA Phase 1 or Phase 2 (post-pilot)?
6. **Sign-up flow.** MVP disables public sign-up (admin-creates-users). Confirm the `/sign-up` page can be removed (or stays for marketing demo)?
7. **Retention period.** 7y assumed (per regulatory pin). SAMA artifacts sometimes mandate 10y. Confirm 7 or 10.
8. **Saudization classification levels.** Scope §10 calls out Platinum/Gold/Silver classification not yet modelled. The `saudization_metrics.by_department` JSONB can carry arbitrary keys, so this is a UI/product question, not a schema blocker — but the orchestrator should know if the MVP need maps to existing UI.
9. **Audit "type" enum vs FK.** `audits.type` is a CHECK constraint (`'internal'|'sama'|'sharia'`). Scope flags it as known debt — should become an FK to a future `audit_types` table before the second tenant. Defer or do now?
10. **Arabic template rollout order.** All 11 LaTeX templates need English; SAMA letter must have Arabic from M5. Confirm which other templates ship with Arabic in MVP vs post-pilot.
