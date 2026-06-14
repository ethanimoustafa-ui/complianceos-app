# Dashboard KPI Rollup — Design Note

**Date:** 2026-06-14
**Status:** Design only — no code/schema changes (companion to `db-scalability-audit.md`).
**Goal:** Collapse the dashboard's 16-call fan-out into one fast read, and stop computing KPIs client-side from paginated lists (audit finding B2), without introducing O(n²) refresh cost.

---

## 0. The one decision that matters most: separate the *interface* from the *storage*

The dashboard's two real problems are (1) it makes ~16 round-trips per paint and (2) it computes totals from page-1 of each list (wrong past the page size). **Both are solved the moment the dashboard reads its KPIs from a single endpoint** — regardless of how that endpoint computes them.

So split the decision in two:

- **Interface (do this first, always):** one endpoint, e.g. `GET /api/dashboard/summary?scope=org|department:<id>|framework:<id>&period=...`, returns the entire KPI blob the widgets need. The client stops fanning out and stops counting locally.
- **Storage (optimize later, only where measured):** *how* that endpoint produces the numbers — live SQL aggregates vs. a precomputed rollup table. The client never sees the difference, so you can start simple and swap internals later.

This matters because **precomputing simple counts is often premature optimization.** Postgres counting a few thousand RLS-scoped rows with the right index is sub-millisecond. The rollup table earns its complexity only for metrics that are genuinely expensive (multi-table aggregation) or read at very high volume — and you already have one of those (`compliance_scores_cache`).

---

## 1. What goes where — decision matrix

| Metric group | Cost to compute live | Recommendation |
|---|---|---|
| Observation counts (open / critical / overdue / closed-this-quarter, by source) | Cheap — one indexed `COUNT(*) FILTER` per scope | **Live aggregate** first; rollup only if hot |
| Circular/rule, risk, policy, letter counters | Cheap — same | **Live aggregate** first |
| Training completion %, Saudization % | Medium — joins/ratios across employees/courses | Live now; **rollup** as data grows (training already has `/api/training/metrics`) |
| Compliance score + dashboard-health + top-deductions | **Expensive** — `jsonb_agg` across 7+ tables | **Precompute** (already done — `compliance_scores_cache`); fix its refresh |
| Team workload | Bounded by team size (tiny) | Live, no rollup |
| Thresholds / targets | Config, not data | Keep in config (`compliance_settings`, `saudization`), apply at render |

**Net recommendation:** build the single `summary` endpoint backed by **live SQL aggregates** for the cheap counters, and have it **read the already-cached expensive metrics** from `compliance_scores_cache`. Introduce the rollup *table* below only for metric groups that profiling shows are slow at real scale.

---

## 2. The rollup table (for when precompute is justified)

A **wide row per scope** — one indexed point lookup returns every widget number for a scope.

```sql
create table public.dashboard_rollup (
  id            uuid primary key default gen_random_uuid(),
  scope_type    text not null check (scope_type in ('org','department','framework')),
  scope_id      uuid,                       -- null for scope_type='org'

  -- observations
  obs_open            integer not null default 0,
  obs_open_critical   integer not null default 0,
  obs_open_overdue    integer not null default 0,
  obs_closed_quarter  integer not null default 0,

  -- circulars / rules
  circulars_active    integer not null default 0,
  circulars_pending   integer not null default 0,
  circulars_overdue   integer not null default 0,

  -- risks / policies
  risks_open          integer not null default 0,
  risks_high          integer not null default 0,
  policies_active     integer not null default 0,
  policies_overdue    integer not null default 0,

  -- letters
  letters_sent        integer not null default 0,
  letters_draft       integer not null default 0,
  letters_overdue     integer not null default 0,
  letters_upcoming_30 integer not null default 0,

  -- derived/expensive (mirror or reference the score cache)
  training_completion_pct numeric(5,2),

  refreshed_at  timestamptz not null default now(),

  -- PG15+: treat (org, NULL) as a single distinct key without sentinels
  constraint dashboard_rollup_scope_key unique nulls not distinct (scope_type, scope_id)
);
```

Notes that bite if ignored:
- **The read path is the unique index** `(scope_type, scope_id)` → an index scan returning exactly one row. This is the O(1)-read property; it holds at any table size. *(This is precisely why your `compliance_scores_cache` reads are already fast — its `idx_compliance_scores_lookup (framework_id, period_filter, department_id, …)` matches its filter exactly.)*
- **`UNIQUE NULLS NOT DISTINCT`** (Postgres 15+, you're on 17) lets the org-scope `(‘org’, NULL)` row be a real unique key. Alternative: a sentinel UUID for org so trigger `WHERE` clauses never deal with NULL.
- **Wide vs tall (EAV):** wide wins for "give me everything for this scope" (one row, one lookup). Cost: adding a KPI = `ALTER TABLE ADD COLUMN` — fine, and explicit, for a young product.
- **Key by dimension, never by user.** Per-user rows explode and most KPIs are department/framework/role-scoped. Your Executive/Managerial/Employee toggle maps to scope + RLS, not to per-user rows.

---

## 3. Refresh strategy — where O(n²) actually hides, and how to avoid it

Two tiers, by cost:

### Tier 1 — cheap counters: incremental deltas (O(1) per change)
Maintain counters with `AFTER` row triggers that adjust only the affected buckets. The pattern for an UPDATE is **diff the old bucket vs the new bucket** (a status/severity/department change moves a row between buckets; a soft-delete is a removal):

```sql
-- illustration only (observations); real version handles severity + scope changes
create or replace function public.rollup_observations() returns trigger
language plpgsql as $$
declare d int;
begin
  -- treat soft-deleted / archived as "not present"
  if (tg_op = 'INSERT') then
    if NEW.deleted_at is null and NEW.archived_at is null then
      perform rollup_bump('org', null, 'obs_open', +1,
              case when NEW.severity='critical' then +1 else 0 end);
    end if;
  elsif (tg_op = 'DELETE') then
    ... -- mirror with -1
  elsif (tg_op = 'UPDATE') then
    -- only do work if a categorizing column changed
    d := (case when present(NEW) then 1 else 0 end) - (case when present(OLD) then 1 else 0 end);
    ... -- decrement OLD bucket, increment NEW bucket
  end if;
  return null;
end $$;
```

**The two traps to design around:**

1. **Full recompute on every write = O(N×M).** This is exactly what `compliance_scores_cache` does today (a statement trigger on 19 tables expires the whole cache; the next read re-aggregates from cold). A bulk op touching N rows triggers N full recomputes. Incremental deltas avoid this — each change is O(1), so a bulk insert is O(N) total, not O(N²).

2. **Hot-row lock contention.** `FOR EACH ROW` triggers all `UPDATE` the *same* rollup row, so heavy concurrent writes serialize on it. Two production-grade fixes:
   - **Statement-level triggers with transition tables** — one net UPDATE per statement instead of per row:
     ```sql
     create trigger trg after insert on observations
       referencing new table as new_rows
       for each statement execute function rollup_observations_stmt();
     -- inside: UPDATE rollup SET obs_open = obs_open + (select count(*) from new_rows where ...)
     ```
     This handles bulk inserts in a single UPDATE — the right default at scale.
   - **Delta-log + fold:** triggers append `(+1/-1, bucket)` rows to an append-only `rollup_deltas` table (no contention), and a frequent `pg_cron` job folds them into the rollup. Highest write throughput; slightly more moving parts.

### Tier 2 — expensive/derived: scheduled recompute + TTL + single-flight
For the compliance score / health / training %, keep the precompute model but fix what the audit flagged:
- **Targeted invalidation**, not "expire all rows on any write to 19 tables."
- **`pg_cron` precompute** on a schedule (e.g. every 5–15 min) so reads are never cold.
- **Single-flight lock** (e.g. `pg_advisory_xact_lock` on the scope key) so N concurrent cold misses don't all run the full aggregate — the current cache has no single-flight, which is a thundering-herd at scale.
- **Period-filter the `letters` CTE** in `compute_compliance_inputs` (currently unbounded — full table scan that grows with history).

### Tier 3 — reconciliation (do not skip)
**Incremental counters drift** — missed edge cases, out-of-band SQL, restores. Run a **nightly `pg_cron` full recompute** that overwrites the Tier-1 counters with ground truth, plus a **drift-check** that compares incremental vs. recomputed and logs/alerts on mismatch. Real-time triggers keep it *fresh*; the nightly job keeps it *correct*.

---

## 4. Indexing checklist

- **Rollup table:** the `unique (scope_type, scope_id)` *is* the read index — nothing else needed for the dashboard read.
- **Base tables (for the recompute/live-aggregate path):** index the `(… ) WHERE deleted_at IS NULL` predicate plus the GROUP BY / FILTER columns — `status`, `severity`, `source`, `due_date`, `framework_ids` (GIN), `department`. You already have `created_at DESC WHERE deleted_at IS NULL` partials on the parent entities; extend that thinking to the columns the dashboard slices by so a cold recompute is an index scan, not a seq scan.
- **Confirm "fetched by index":** `EXPLAIN` the summary endpoint's queries and verify `Index Scan` / `Index Only Scan`, not `Seq Scan`, before declaring victory.

---

## 5. RLS

The rollup holds aggregates, but aggregates still leak information — gate it. Mirror base-table visibility: `dashboard:view` for the read, and for `scope_type='department'` rows restrict to the caller's `department_id` unless they hold an org-wide view permission. Org/framework scopes → org-wide viewers only.

---

## 6. Anti-patterns (all currently present in `compliance_scores_cache` — don't repeat in the general rollup)
- ❌ Expire-everything on any write to many tables → write amplification + cold reads.
- ❌ Synchronous cold compute on read with no single-flight → stampede.
- ❌ Unbounded aggregation CTEs (no period filter) → cost grows with all history.
- ❌ Per-user rollup rows → row explosion.
- ❌ Baking thresholds into snapshots → unless you *want* breach history (which is a nice compliance feature — then do it deliberately).

---

## 7. Phased rollout (lowest risk → highest payoff first)

1. **Summary endpoint, live aggregates.** Build `GET /api/dashboard/summary` running the cheap `COUNT(*) FILTER`/`GROUP BY` aggregates server-side (one round-trip, or a few in `Promise.all`) and reading the existing score cache. **This alone kills the 16-call fan-out and the wrong-KPI bug** with no new table, no triggers, no staleness. Verify with `EXPLAIN`.
2. **Measure.** If step 1 is fast enough at projected scale (it usually is with indexes), **stop here.**
3. **Add the rollup table + Tier-2 fixes** for the metrics that profile as slow (start with score/health — generalize `compliance_scores_cache`). Endpoint internals change; client untouched.
4. **Add Tier-1 incremental triggers** (statement-level) only if live counters become a bottleneck. Add the Tier-3 reconciliation job at the same time.
5. **Backfill, dual-read, verify, cut over.** Keep old endpoints until the summary endpoint is verified against them; add the drift-check.

---

## 8. Open decisions for you
1. **Staleness contract:** are real-time counters required, or is "as of N minutes ago" acceptable for the dashboard? (Drives Tier-1 triggers vs. scheduled refresh.)
2. **Breach history:** snapshot threshold/breach state over time, or compute against live config at render?
3. **Scope set:** is `org / department / framework` enough, or do Executive/Managerial/Employee views need distinct scope rows beyond what RLS already gives you?
4. **Where to start:** I recommend Phase 1 (summary endpoint, live aggregates) — smallest change, biggest immediate win. Confirm before any rollup-table work.
