# Phase 6 — Scoring engine port to server

`tsc --noEmit` is clean.

## Files moved / shimmed

- `src/lib/compliance-engine.ts` → moved logic to `src/lib/api/services/scoring/compliance-engine.ts`. Original file is now a thin `export *` shim so existing type imports keep working.
- `src/lib/compliance-engine.types.ts` → moved to `src/lib/api/services/scoring/compliance-engine.types.ts`; original is a re-export shim.
- `src/lib/dashboard-health.ts` → moved to `src/lib/api/services/scoring/dashboard-health.ts`; original is a re-export shim.
- `src/lib/dashboard-health.types.ts` → moved to `src/lib/api/services/scoring/dashboard-health.types.ts`; original is a re-export shim.

## Files created

- `src/lib/api/services/scoring/gather-inputs.ts` — pulls audits, observations, risks, policies, training_courses, circulars, sama_letters, frameworks, framework_pins, and compliance_settings in parallel via `Promise.all`. Each SELECT lists only columns the engine reads. `created_at` is filtered by SQL `.gte/.lte` against the resolved period window (not in JS). Outputs both `ComplianceEngineInput` and `DashboardHealthInput` plus a deterministic FNV-1a `inputsHash`.

## Files modified

- `src/app/api/compliance/score/route.ts` — cache HIT → ok with `s-maxage=60, swr=300, tags=[compliance]`. MISS → gather + `calculateComplianceScore` + UPSERT into `compliance_scores_cache` (TTL 1h via `expires_at`). Compute wrapped in `Promise.race` against a 45s budget; on timeout → enqueue `compliance.recompute` job and respond `202 { status: 'computing' }` with `Retry-After: 30`.
- `src/app/api/compliance/dashboard-health/route.ts` — same pattern using synthetic `framework_id = 'dashboard-health'` discriminator. The richer dashboard-health shape (7-key components, `frameworkScores`, business-compliance numbers) is packed into the `components` jsonb column so no schema migration is needed.
- `src/hooks/useComplianceScore.ts` — replaced the multi-store + pure-engine call with an `api.get('/compliance/score', …)` fetch. Returns `ComplianceScoreResult & { isLoading, error }` so destructuring at call sites (`reports/(tabs)/audits`, `reports/(tabs)/executive`, `useDashboardMetrics`) keeps working unchanged. In-flight requests are deduped via a module-level `Map<string, Promise>` keyed by `{period, framework_id, department_id}`.
- `src/hooks/useDashboardHealth.ts` — same fetcher pattern against `/compliance/dashboard-health`. Business compliance is still derived client-side from the evaluation/circular/policy/department stores via `calculateComplianceReviewScore` and overlaid on the server result (the algorithm is pure and these stores remain authoritative for that hero-card metric).

## Cache-key strategy

The cache key is `(framework_id, period_filter, department_id, inputs_hash)` (existing unique constraint from migration 013). `inputs_hash` is an FNV-1a-32 of:

```
{ period, framework_id, department_id,
  counts of every source slice (audits, observations, risks, policies,
  trainings, circulars, letters, framework_configs),
  componentWeights, targetScore }
```

The hash deliberately captures *counts + setting values* rather than the full payload — it's a cheap discriminator that changes whenever new rows appear in any source table (which is also when the invalidation trigger fires, see below). For the dashboard-health endpoint we use `framework_id = 'dashboard-health'` as a synthetic discriminator (matches the Phase 4 read-only stub).

## Invalidation trigger status

**Already exists.** Migration `015_triggers.sql` (Phase 2) installs:

```sql
create or replace function public.invalidate_compliance_cache()
returns trigger language plpgsql as $$
begin
  update public.compliance_scores_cache set expires_at = now() where expires_at > now();
  return null;
end;
$$;
```

…and wires `trg_<table>_invalidate_compliance` on: `audits, audit_tasks, observations, remediation_plans, closure_requests, closure_reviews, risks, risk_mitigation_checklist, policies, policy_versions, policy_workflow_steps, circulars, circular_articles, sama_letters, training_courses, employee_course_progress, compliance_settings, frameworks, framework_config`. The handler also calls `revalidate(cacheTags.compliance())` via the existing mutation handlers, so Next 16 cacheTags and DB-level cache TTL are both kept in sync.

No new migration (e.g. `020_compliance_cache_invalidation.sql`) was required.

## TODOs

1. **Async recompute job handler stub.** The `compliance.recompute` job is enqueued on the 45s timeout path but no worker consumes it yet — `enqueueRecompute` only INSERTs into `jobs`. A future worker (Vercel cron or QStash) should pull queued jobs of that kind, call `gatherScoringInputs` + the relevant engine, and UPSERT the cache row. The polling client receives `202 { status: 'computing', jobId }` and re-mounts.
2. **Per-framework `frameworks` field on the score response.** The legacy engine returned `result.frameworks` (per-framework correspondence breakdown). The cache schema doesn't have a column for it, so the score route currently drops it. If consumers need per-framework numbers, either widen the `components` jsonb to wrap the engine's full return value, or expose them via a separate `?framework_id=<id>` query (already wired into the cache key but not surfaced).
3. **Department-scoped scoring.** `gather-inputs.ts` accepts `department_id` and passes it through the cache key, but doesn't yet filter rows by department in SQL — the engine consumes the same all-org slice. When per-department filtering is needed, add the `.eq('department_id', …)` clauses to each query (policies, risks, observations, circulars all carry department references).
4. **Trainings completionRate** is derived from `training_courses.assigned_count / completed_count`. The legacy store-shape sometimes carried a more granular `completionRate` straight from `employee_course_progress` aggregation. If trend lines drift, switch the gather to aggregate `employee_course_progress` instead.
