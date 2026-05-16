# Phase 4 — Settings / Reports / Audit-log / Compliance / Jobs

> Stage-B agent deliverable. Pattern source: `.planning/07-api-pattern.md`.
> Builds: settings (all lookup CRUD), compliance evaluations, audit-log reader, compliance score reader, job polling.

---

## 1. Endpoint count: 25

| # | Method | Path | Permission |
|---|---|---|---|
| 1 | GET | `/api/settings/frameworks` | authenticated |
| 2 | GET | `/api/settings/framework-config` | authenticated |
| 3 | PATCH | `/api/settings/framework-config/[frameworkId]` | `settings:edit` |
| 4 | POST | `/api/settings/framework-config/pin` | `settings:edit` |
| 5 | POST | `/api/settings/framework-config/unpin/[frameworkId]` | `settings:edit` |
| 6 | GET | `/api/settings/departments` | authenticated |
| 7 | POST | `/api/settings/departments` | `settings:edit` |
| 8 | PATCH | `/api/settings/departments/[id]` | `settings:edit` |
| 9 | DELETE | `/api/settings/departments/[id]` | `settings:edit` |
| 10 | GET | `/api/settings/business-units` | authenticated |
| 11 | POST | `/api/settings/business-units` | `settings:edit` |
| 12 | PATCH | `/api/settings/business-units/[id]` | `settings:edit` |
| 13 | DELETE | `/api/settings/business-units/[id]` | `settings:edit` |
| 14 | GET | `/api/settings/policy-categories` | authenticated |
| 15 | POST | `/api/settings/policy-categories` | `settings:edit` |
| 16 | PATCH | `/api/settings/policy-categories/[id]` | `settings:edit` |
| 17 | DELETE | `/api/settings/policy-categories/[id]` | `settings:edit` |
| 18 | GET | `/api/settings/scale-labels` | authenticated |
| 19 | PATCH | `/api/settings/scale-labels` | `settings:edit` |
| 20 | GET | `/api/settings/compliance-settings` | authenticated |
| 21 | PATCH | `/api/settings/compliance-settings` | `settings:edit` |
| 22 | GET | `/api/settings/saudization` | authenticated |
| 23 | PATCH | `/api/settings/saudization` | `settings:edit` |
| 24 | GET | `/api/settings/onboarding` | authenticated |
| 25 | POST | `/api/settings/onboarding/step` | `settings:edit` |
| 26 | POST | `/api/settings/onboarding/complete` | `settings:edit` |
| 27 | GET | `/api/reports/compliance-evaluations` | authenticated |
| 28 | POST | `/api/reports/compliance-evaluations` | `report:create` |
| 29 | GET | `/api/reports/compliance-evaluations/[id]` | authenticated |
| 30 | PATCH | `/api/reports/compliance-evaluations/[id]` | `report:create` |
| 31 | DELETE | `/api/reports/compliance-evaluations/[id]` | `report:delete` |
| 32 | POST | `/api/reports/compliance-evaluations/bulk` | `report:create` |
| 33 | GET | `/api/reports/compliance-evaluations/score-summary` | authenticated |
| 34 | GET | `/api/compliance/score` | authenticated |
| 35 | GET | `/api/compliance/dashboard-health` | authenticated |
| 36 | GET | `/api/audit-logs` | `audit:view` |
| 37 | GET | `/api/audit-logs/[id]` | `audit:view` |
| 38 | GET | `/api/jobs/[jobId]` | authenticated |

**38 endpoints total** across 22 route files.

---

## 2. Files created

### Schemas
- `src/lib/api/schemas/settings.ts`
- `src/lib/api/schemas/reports.ts`
- `src/lib/api/schemas/audit-logs.ts`
- `src/lib/api/schemas/jobs.ts`

### Services
- `src/lib/api/services/settings.ts`
- `src/lib/api/services/reports.ts`
- `src/lib/api/services/compliance.ts`
- `src/lib/api/services/audit-logs.ts`
- `src/lib/api/services/jobs.ts`

### Route handlers (22)
- `src/app/api/settings/frameworks/route.ts`
- `src/app/api/settings/framework-config/route.ts`
- `src/app/api/settings/framework-config/[frameworkId]/route.ts`
- `src/app/api/settings/framework-config/pin/route.ts`
- `src/app/api/settings/framework-config/unpin/[frameworkId]/route.ts`
- `src/app/api/settings/departments/route.ts`
- `src/app/api/settings/departments/[id]/route.ts`
- `src/app/api/settings/business-units/route.ts`
- `src/app/api/settings/business-units/[id]/route.ts`
- `src/app/api/settings/policy-categories/route.ts`
- `src/app/api/settings/policy-categories/[id]/route.ts`
- `src/app/api/settings/scale-labels/route.ts`
- `src/app/api/settings/compliance-settings/route.ts`
- `src/app/api/settings/saudization/route.ts`
- `src/app/api/settings/onboarding/route.ts`
- `src/app/api/settings/onboarding/step/route.ts`
- `src/app/api/settings/onboarding/complete/route.ts`
- `src/app/api/reports/compliance-evaluations/route.ts`
- `src/app/api/reports/compliance-evaluations/[id]/route.ts`
- `src/app/api/reports/compliance-evaluations/bulk/route.ts`
- `src/app/api/reports/compliance-evaluations/score-summary/route.ts`
- `src/app/api/compliance/score/route.ts`
- `src/app/api/compliance/dashboard-health/route.ts`
- `src/app/api/audit-logs/route.ts`
- `src/app/api/audit-logs/[id]/route.ts`
- `src/app/api/jobs/[jobId]/route.ts`

### Shared lib modifications
- `src/lib/api/cache.ts` — added factories: `frameworkConfig`, `departments`, `businessUnits`, `policyCategories`, `scaleLabels`, `complianceSettings`, `saudization`, `onboarding`, `evaluations`, `evaluationScores`, `globalAuditLogs`, `jobs` (additive only).

### Migrations
- `supabase/migrations/030_settings_onboarding_state.sql` — adds `onboarding_state JSONB` column to `compliance_settings`.

---

## 3. Deviations from the brief

1. **Onboarding storage.** Brief said "any `onboarding_*` table or `compliance_settings` columns". There was no existing column for completion state — added `030_settings_onboarding_state.sql` to introduce `compliance_settings.onboarding_state JSONB`. Route handlers are defensive: if the migration hasn't been applied yet the GET endpoint returns a safe default (`{ completed:false, completed_at:null, steps:{} }`) instead of erroring. The migration must be applied for POST step / complete to persist.
2. **Scale-labels schema.** Brief said "singleton config — only ever one record; if table allows multiple per scope, support per-scope". The DB has `scale_label_overrides` with composite PK `(scale, key, lang)` — it explicitly supports many rows. PATCH accepts a batch upsert `{ overrides: [...] }` instead of a singleton PATCH.
3. **Compliance scoring score cache miss.** Phase 4 only reads the cache — the actual scoring engine lands in Phase 6. On cache miss the endpoint returns HTTP 202 `{ status:'computing', jobId }` and enqueues a `compliance.recompute` job with idempotency key `compliance.recompute:<fw>:<period>:<dept>`. Phase 6 (or Phase 9 cron) will dequeue and recompute.
4. **Permission keys used** (all seeded in migration 018):
    - Settings mutations → `settings:edit` (org_admin only).
    - Compliance evaluations create/update → `report:create` (compliance_officer + org_admin).
    - Compliance evaluations delete → `report:delete` (org_admin only).
    - Audit-log reader → `audit:view` (all roles).
    - The brief mentioned speculative keys `reports:view` / `reports:edit` — these are not seeded; we used the canonical seeded `report:*` keys instead (same rule the audits-reference agent followed for `templates:manage:audits` → `settings:edit`).
5. **Audit-logs `[id]` parameter.** `audit_logs.id` is `bigserial`, not UUID. The route coerces `Number(id)` and falls back to NotFound for non-numeric input.
6. **Reference-counting on department/business-unit/policy-category DELETE.** Implemented inline `count` lookups (uses `head: true` + `count: 'exact'`); refuses with 409 + `details: { table: count }` if any reference is found. Department references checked: profiles, observations, risks, policies, circulars, framework_config, compliance_evaluations. Business-unit checked: profiles. Policy-category checked: policies (via uuid `category_id`). Note: `policies.category` is currently a free-text column in the schema; if a future migration switches it to FK-by-id, the counts will correctly catch the references — until then text-keyed references will not be counted (informational only).

---

## 4. Open TODOs

1. **Apply migration `030_settings_onboarding_state.sql`** to the live DB before the onboarding endpoints persist state.
2. **`compliance.recompute` job handler** (Phase 6 / Phase 9) — must select `compliance_scores_cache` for the `(framework_id, period, department_id)` triple, run the scoring engine, and upsert the row. Without it, score reads will perpetually return 202.
3. **`dashboard-health` scoring** — used a synthetic `framework_id='dashboard-health'` discriminator in `compliance_scores_cache`. Confirm with Phase 6 that this convention is acceptable; otherwise add a dedicated cache table.
4. **`policies.category` migration** — if categories move from text key to FK uuid, `countPolicyCategoryReferences` should pick up the additional column without changes.
5. **Cron-worker tick endpoint** (Phase 9) — `POST /api/jobs/run` was deliberately not added here; that's the worker entry point.
6. **Bulk evaluation batch atomicity** — current implementation issues a single `upsert` on the array (Postgres transactional per statement). A future failure-mid-batch story may want a stored procedure with savepoints.

---

## 5. Verification

- `npx tsc --noEmit` is clean for every file owned by this agent (the only error reported is in `src/lib/api/services/letters.ts`, owned by the correspondence/letters agent).
- Every route exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` per §2 of the pattern doc.
- Every mutation writes `writeAudit({...})` and revalidates the affected cache tags (including `cacheTags.compliance()` for framework-config writes that feed scoring).
- No `select('*')` on list endpoints. Every list endpoint uses an explicit column string defined in the resource's service file.
- `requireUser()` / `requirePerm()` runs at the top of every handler.
