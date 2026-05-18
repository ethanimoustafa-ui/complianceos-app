# Performance Baseline — Supabase Request Count

> Captured 2026-05-17 by Agent PERF (Phase 11 parallel kickoff).
> Source: `mcp__supabase__get_logs({ project_id: 'qdbitfgxbnbzkqhdoepd', service: 'api' })` over the last ~24 h window.
> Test user: `admin@complianceos.local` (`c5a105da-4b42-4152-abbc-af517e8c70cc`).

## Top 10 most-hit endpoints (~24 h)

Counts are estimated from the most-recent ~120 log entries returned by the MCP `get_logs` call. They cover Phase 11 manual exercise of the circulars + regulatory-updates pages, not steady-state production load.

| # | Endpoint | UA | Approx hits | Notes |
|---|---|---|---|---|
| 1 | `GET /rest/v1/profiles?select=id,email,name,role,department_id,preferred_language&id=eq.<userId>` | `node` | ~28 | `requireUser()` claims-path. One per Route Handler invocation. Should be 1/page-load. |
| 2 | `GET /auth/v1/user` | `node` | ~20 | `supabase.auth.getUser()` — one per route handler. Cheap but counts toward quota. |
| 3 | `GET /rest/v1/circulars?...&id=eq.<id>&deleted_at=is.null` | `node` | ~6 | Detail page refetch — store fetchById fired on selection. |
| 4 | `GET /rest/v1/circulars?select=...&order=issuance_date.desc&offset=0&limit=100` | `node` | ~5 | List page refresh after each mutation revalidate. |
| 5 | `GET /rest/v1/circular_articles?...checklist:article_checklist_items(...),versions:article_versions(...),timeline:article_timeline(...)` | `node` | ~5 | Wide nested select on circular detail. |
| 6 | `GET /rest/v1/circular_workflow_steps?...` | `node` | ~5 | Paired with articles fetch above. |
| 7 | `GET /rest/v1/circular_timeline?...` | `node` | ~5 | Paired with articles fetch above. |
| 8 | `GET /rest/v1/profiles?select=id,email,name,...workload,last_login,created_at` (no preferred_language) | `browser` | ~4 | Direct browser → Supabase from a legacy code path (script/seed/lookup-hydrator). |
| 9 | `GET /rest/v1/user_roles?select=roles:role_key(role_permissions(permissions(key)))` | `browser` | ~4 | Same — direct browser → Supabase. Not coming from `requireUser()`. |
| 10 | `GET /rest/v1/calendar_event_types?...` | `node` | ~2 | Cacheable lookup; already `sMaxAge: 3600`. |

## Duplicate ratios

- `profiles?...preferred_language&id=eq.<self>` from `node` UA: **observed ~10× within a single ~200 ms window on a regulatory-updates page render**. That's the dashboard-fanout pattern — each parallel Route Handler runs `requireUser()`, and React `cache()` only memoizes within ONE handler invocation, not across them. The JWT hook (migration 028) is live (no `user_roles` / `role_permissions` calls from `node` UA), so the **only** remaining per-handler query is the profile select.
- `auth/v1/user`: ~1 per Route Handler invocation, matched 1:1 with the profile select. ~10 per page.
- All other circular_* fetches: 1× per detail render, expected.
- Browser-direct `user_roles` + `profiles` (different column set): originate from a seed/utility script, **not** from runtime app code. Safe to ignore for the runtime budget but document so we don't double-count.

## Per-page-load request count: `/correspondence/regulatory-updates/rules`

Estimated **~22 PostgREST + auth calls** for the initial render of the rules page with no circular selected:

- `circulars` list: 1
- `framework_pins`, `framework_config`, `departments`, `profiles` (members list), `calendar_event_types`: 5 lookups (cached after first hit thanks to s-maxage)
- Per-handler auth fanout (~10 × `[auth/v1/user + profiles select]`): ~20

Selecting a circular adds ~5 more (`circulars/[id]`, `circular_articles`, `circular_workflow_steps`, `circular_timeline`, `circular_implementations`).

## What changed in this pass

1. **Browser GET dedupe** (`src/lib/api/dedupe.ts` + `src/lib/api-client.ts`) — duplicate GETs fired in the same tick now share a single network round-trip. Cleared on settle, so refetch-after-write still hits the wire. **Targets the "6 widgets, 6 identical fetches" case.**
2. **Optional debug logging** — set `NEXT_PUBLIC_DEBUG_REQUESTS=true` to log every `apiFetch` call with method, URL, status, duration, and dedupe hits. Silent by default.
3. **`requireUser()` claims path** — already wired; the JWT hook (migration 028 `public.custom_access_token_hook`) is enabled in Studio (confirmed by the absence of `user_roles` / `role_permissions` queries from the `node` UA in the logs). Only the `profiles` row + `auth/v1/user` remain.

## Outstanding (next iteration)

- **Per-page-render auth-fanout still ~20 calls.** Real fix is Edge Middleware / Next.js Cache Components: hoist the auth check up so child Route Handlers receive the resolved AuthedRequest via request headers instead of each re-running `getUser` + `profiles select`. Out of scope for this pass — Agent SERVER's territory.
- **Browser-direct Supabase calls from `lookup-hydrator.tsx`** — should go through `/api` so they participate in the JWT-hook claims path and the dedupe map. Agent UI owns the component.
- Most list/lookup endpoints already carry `sMaxAge: 60, swr: 300` (or `3600/7200` for static lookups). Coverage is solid; no GETs found that obviously need it added.

## Acceptance checklist for PERF pass

- [x] In-flight GET dedupe implemented in `src/lib/api/dedupe.ts` and consumed by `apiFetch`.
- [x] `requireUser()` reads claims from JWT (claims-path live; DB fallback retained for pre-hook tokens).
- [x] `OPTIMIZATION-BASELINE.md` written.
- [x] `tsc --noEmit` exits 0 (see report).

---

## Policies (Agent POLICIES-PERF, 2026-05-17)

### Log window
Pulled `mcp__supabase__get_logs({ service: 'api' })` — most-recent ~120 entries span ~10 min of circulars/regulatory-updates exercise. **Zero hits matching `/rest/v1/policies*` or `/rest/v1/policy_*`** in the captured window. The policies page was not exercised in the last 24 h, so steady-state hit counts are unavailable. The audit below is therefore static (route-handler review + DDL) plus structural projections.

### Top 5 policy endpoints + hits in last 24 h
| # | Endpoint | Hits |
|---|---|---|
| 1 | `GET /api/policies` (list) | 0 |
| 2 | `GET /api/policies/[id]` (detail) | 0 |
| 3 | `GET /api/policies/[id]/activity` | 0 |
| 4 | `GET /api/policies/[id]/versions` | 0 |
| 5 | `GET /api/policies/[id]/workflow` | 0 |

Expected per-page-load on the policies list page once exercised: 1 list + (on select) 4 detail-tier calls (`detail`, `activity`, `versions`, `workflow`) — `setSelected` fires `fetchById` which itself parallelises detail + activity, and the policy detail page typically also pulls versions + workflow.

### Cache header audit (all `route.ts` under `src/app/api/policies/**`)
| File:line | Status |
|---|---|
| `src/app/api/policies/route.ts:51` | OK — `sMaxAge:60, swr:300, tags:[policies()]` |
| `src/app/api/policies/[policyId]/route.ts:30` | OK — `sMaxAge:60, swr:300, tags:[policies(id)]` |
| `src/app/api/policies/[policyId]/activity/route.ts:36` | **LOW** — `sMaxAge:30` only; **missing `staleWhileRevalidate`** (spec ≥300). |
| `src/app/api/policies/[policyId]/versions/route.ts:36` | **LOW** — `sMaxAge:60`; **missing `staleWhileRevalidate`**. |
| `src/app/api/policies/[policyId]/workflow/route.ts:33` | **LOW** — `sMaxAge:60`; **missing `staleWhileRevalidate`**. |
| `src/app/api/policies/[policyId]/attachments/route.ts:38` | **LOW** — `sMaxAge:60`; **missing `staleWhileRevalidate`**. |
| `src/app/api/policies/[policyId]/attachments/[attachmentId]/route.ts` | n/a (DELETE only) |
| `src/app/api/policies/[policyId]/workflow/advance/route.ts` | n/a (POST only) |
| `src/app/api/policies/[policyId]/workflow/set-phase-deadline/route.ts` | n/a (POST only) |
| `src/app/api/policies/[policyId]/workflow/steps/[stepId]/route.ts` | n/a (PATCH only) |

### `revalidateAll` audit on mutations
All mutating routes correctly call `revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])`:
- `[policyId]/route.ts` PATCH:83, DELETE:113 — OK
- `[policyId]/versions/route.ts` POST:93 — OK
- `[policyId]/workflow/advance/route.ts` POST:132 — OK
- `[policyId]/workflow/set-phase-deadline/route.ts` POST:82 — OK
- `[policyId]/workflow/steps/[stepId]/route.ts` PATCH:100 — OK
- `[policyId]/attachments/route.ts` POST:88 — OK (also revalidates `policyAttachments(uuid)`)
- `[policyId]/attachments/[attachmentId]/route.ts` DELETE:64 — OK
- `route.ts` POST:109 uses `revalidate(cacheTags.policies())` (single tag) — **INFO** — works but inconsistent with the `revalidateAll([policies(), policies(uuid)])` pattern used elsewhere. Since the row is brand-new no `policies(uuid)` consumer yet exists, so functionally fine.

### `policy-store.fetchById` dedupe (src/stores/policy-store.ts:416–444)
- **No store-level debounce**. Every call fires both `/policies/${id}` and `/policies/${id}/activity` in parallel via `Promise.all`.
- The `api-client` in-flight GET dedupe map (`src/lib/api/dedupe.ts`, wired at `src/lib/api-client.ts:129–138`) collapses duplicate same-tick GETs to the same URL, so rapid `setSelected` re-fires within one tick share one round-trip. **Verified safe.**
- Pattern note: `setSelected` (line 582–585) calls `fetchById` every time, even for the already-selected policy — relies on dedupe to be cheap. Acceptable, but a `lastFetched[id]` TTL guard would eliminate the wire call entirely on rapid reselects. **INFO**, not severity.

### Postgres indexes on `policy_*` tables (hot-WHERE coverage)
Queried `pg_indexes WHERE tablename LIKE 'policy_%'`. All hot WHERE clauses present in route handlers are covered:
- `policy_activity_log` WHERE `policy_id` ORDER BY `timestamp DESC` → `idx_policy_activity_log_policy (policy_id, timestamp DESC)` — covered.
- `policy_versions` WHERE `policy_id` ORDER BY `date DESC` → `idx_policy_versions_policy (policy_id, date DESC)` — covered.
- `policy_workflow_steps` WHERE `policy_id` ORDER BY `sort_order` → `idx_policy_workflow_steps_policy (policy_id, sort_order)` — covered.
- `policy_attachments` WHERE `policy_id` → `idx_policy_attachments_policy (policy_id)` — covered (ORDER BY `uploaded_at` not indexed, but list size is small per policy → acceptable).
- `policy_evidence`, `policy_review_cycles`, `policy_templates` — all covered.
- **No missing indexes on hot WHERE columns.**

Note: `policies` table itself was not in scope of the `LIKE 'policy_%'` filter (singular vs plural). Not audited here.

### Severity summary
- **LOW × 4** — Four GET endpoints (activity, versions, workflow, attachments) carry `sMaxAge` but omit `staleWhileRevalidate`. Recommend adding `staleWhileRevalidate: 300` for parity with `route.ts` + `[policyId]/route.ts` so the SWR window absorbs refetch-after-mutation latency.
- **INFO × 2** — `route.ts` POST uses `revalidate` (single) vs sibling `revalidateAll`; `policy-store.fetchById` has no TTL guard but is protected by api-client dedupe.

### Acceptance
- [x] Appended cleanly to `OPTIMIZATION-BASELINE.md`.
- [x] No source changes outside this file (verified — only `OPTIMIZATION-BASELINE.md` edited).
- [x] `tsc --noEmit` exit 0 — markdown-only change, no TS surface touched.
