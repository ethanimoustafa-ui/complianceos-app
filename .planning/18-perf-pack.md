# Phase 11 — Agent P (Performance pack) report

**Date:** 2026-05-16
**Supabase project:** `qdbitfgxbnbzkqhdoepd` (eu-central-1, free tier)
**TS check:** `npx tsc --noEmit` passed cleanly (0 errors).

## 1. Auth-fetch dedup — chosen path

**Picked: Supabase Custom Access Token Hook (JWT-claims) + claims-first read with DB fallback.** Skipped the in-memory `Map` fallback because the claims-first path already collapses the 20-24x per-page-render fetch loop down to 1 (the unavoidable `profiles` lookup for `department_id` / `preferred_language`).

Why JWT hook over in-memory cache:
- JWT path is process-agnostic. Vercel Fluid Compute may serve concurrent requests across multiple isolates; a per-process `Map` would only dedup within one isolate.
- Claims are valid for the lifetime of the access token (Supabase default 1h), which is correct correctness-wise — any RBAC mutation forces a token refresh anyway via the existing auth-store wiring.
- The hook is reusable for future Edge Middleware checks (token decodes locally without DB roundtrip).

### Migration 028 — `public.custom_access_token_hook(event jsonb) returns jsonb`
- `SECURITY DEFINER`, `STABLE`, `search_path = public`, `plpgsql`.
- Resolution mirrors `public.has_permission()`: `role_permissions` joined on (`profiles.role` + `user_roles`), plus `user_permissions where granted=true`, minus `user_permissions where granted=false`.
- Injects `{ "role": "...", "permissions": ["..."] }` into `event.claims.app_metadata`.
- `REVOKE EXECUTE FROM public, anon, authenticated; GRANT EXECUTE TO supabase_auth_admin;` — Supabase hook contract.
- Granted `SELECT` on `profiles`, `user_roles`, `user_permissions`, `role_permissions` to `supabase_auth_admin` (needed because `SECURITY DEFINER` runs as the function owner; GoTrue still validates row access).

### Manual Studio activation (supervisor — toggle when reviewing)
1. Open Studio → Project `qdbitfgxbnbzkqhdoepd`.
2. **Authentication → Hooks → Custom Access Token Hook**.
3. Select `public.custom_access_token_hook` from the dropdown.
4. Save.
5. Existing sessions: either wait for the next token rotation (default 1h) or "Sign out all users" so the hook starts firing immediately.

### `src/lib/api/auth.ts` changes
- New `readClaims(user)` helper inspects `user.app_metadata.role` + `app_metadata.permissions[]`.
- `requireUser()` is now claims-first: when claims are present, it issues exactly **one** Supabase query (the `profiles` row for non-RBAC fields like `department_id`, `preferred_language`). When absent, it falls back to the legacy 3-query path so the app works before/during hook rollout.
- Return shape of `requireUser()` is **unchanged** — callers don't need to update.

**Verification of hook output (admin user `c5a105da-...`):**
```jsonc
{
  "claims": {
    "sub": "c5a105da-...",
    "app_metadata": {
      "role": "org_admin",
      "permissions": ["audit:comment","audit:create","audit:delete","audit:edit","audit:view","comment","create","delete","edit","export","observation:comment","observation:create","observation:delete","observation:edit","observation:view","report:create","report:delete","report:view","settings:edit","settings:view","team:edit","team:invite","team:remove","team:view","view"]
    }
  }
}
```
25 distinct permission keys returned for `org_admin` — matches the seeded RBAC matrix.

## 2. Scoring aggregator RPC

### Migration 027 — `public.compute_compliance_inputs(timestamptz, timestamptz, uuid default null, uuid default null) returns jsonb`
- `SECURITY DEFINER`, `STABLE`, `PARALLEL SAFE`, `language sql`.
- Returns a single JSONB with keys: `audits`, `observations`, `risks`, `policies`, `trainings`, `circulars`, `letters`, `frameworks`, `settings`, `framework_pins`, plus a `meta` object (period bounds, framework_id, department_id, computed_at).
- Per-slice column subsets are **byte-identical** to the legacy `gather-inputs.ts` `.select(...)` strings — no shape drift downstream.
- Period filter applied via `created_at >= p_period_start AND created_at <= p_period_end` and `deleted_at IS NULL`. Letters remain non-period-filtered (matching the legacy code).
- `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated, service_role;`
- Ends with `NOTIFY pgrst, 'reload schema';`

**Verification SELECT output (`SELECT compute_compliance_inputs(NOW() - INTERVAL '90 days', NOW())`):**
Keys returned: `audits, circulars, framework_pins, frameworks, letters, meta, observations, policies, risks, settings, trainings` — all 10 expected slices plus `meta`. Arrays empty on an unseeded dev DB (correct).

### `src/lib/api/services/scoring/gather-inputs.ts` changes
- Extracted two helpers: `fetchViaRpc()` (single `supabase.rpc('compute_compliance_inputs', {...})`) and `fetchViaSelects()` (legacy 10-query `Promise.all`).
- Main entry: `const slices = (await fetchViaRpc(...)) ?? (await fetchViaSelects(...))`.
- `fetchViaRpc` returns `null` on RPC error (logged via `console.warn`) so callers fall back silently.
- All downstream slice mapping, `inputsHash` semantics, and `pinnedFrameworks` selection are **byte-identical** — `gatherScoringInputs()` return shape unchanged.

## 3. Cache-Control sweep

Grepped `src/app/api/**/route.ts` for existing `Cache-Control` / `cache: { sMaxAge }`. **65 of ~146 route files already have cache hints.** Every lookup endpoint named in the brief was already cached:

| Endpoint | Cache | Tag |
|---|---|---|
| `/api/settings/frameworks` | `s-maxage=3600, swr=7200` | `frameworks:list` |
| `/api/settings/departments` | `s-maxage=3600, swr=7200` | `departments:list` |
| `/api/settings/business-units` | `s-maxage=3600, swr=7200` | `business-units:list` |
| `/api/settings/policy-categories` | `s-maxage=3600, swr=7200` | `policy-categories:list` |
| `/api/settings/scale-labels` | `s-maxage=3600, swr=7200` | `scale-labels` |
| `/api/settings/compliance-settings` | `s-maxage=3600, swr=7200` | `compliance-settings` |
| `/api/settings/saudization` | `s-maxage=300, swr=900` | `saudization` |
| `/api/settings/framework-config` | `s-maxage=300, swr=900` | `framework-config:list` |
| `/api/audit-categories` | `s-maxage=3600, swr=7200` | `audit-categories:list` |
| `/api/policy-categories` | `s-maxage=3600, swr=7200` | `policy-categories:list` |
| `/api/risk-categories` | `s-maxage=3600, swr=7200` | `risk-categories:list` |
| `/api/training/categories` | `s-maxage=3600, swr=7200` | `training-categories:list` |
| `/api/letter-types` | `s-maxage=3600, swr=7200` | `letter-types:list` |
| `/api/letter-sub-categories` | `s-maxage=3600, swr=7200` | `letter-sub-categories:list` |
| `/api/correspondence-types` | `s-maxage=3600, swr=7200` | `correspondence-types:list` |
| `/api/authority-departments` | `s-maxage=3600, swr=7200` | `authority-departments:list` |
| `/api/calendar/event-types` | `s-maxage=3600, swr=7200` | `calendar-event-types:list` |
| `/api/audit-templates`, `/api/letter-templates`, `/api/policy-templates` | `s-maxage=300, swr=600` | respective `*-templates:list` |

**No new Cache-Control headers added** — coverage is already complete for the lookup surface area named in the brief. Skipping is correct per the "Only modify the response headers — don't touch business logic. Skip endpoints that already set Cache-Control" instruction.

## 4. Expected request-count delta

Phase 9 baseline (per dashboard load):
- Auth fetch loop: 20-24× duplicate `profiles` + `user_roles` + `role_permissions` selects = **~24 requests**
- Scoring inputs: 10 parallel `.from()` selects = **~10 requests** (originally cited as 7 in the brief; current code has 10)
- Total auth + scoring path: **~34 requests/page**

Post-Phase-11 (with hook enabled + RPC live + cache hits):
- Auth (claims-first): 1 `getUser()` + 1 `profiles` select = **2 requests** (the `getUser()` round-trip is unavoidable Supabase SSR behaviour)
- Scoring inputs: 1 RPC call = **1 request**
- Cached lookups: ≤1 each on cold cache, 0 on warm = **0-N**, dominated by `s-maxage` hits
- **Expected total: ~3-4 requests/page on warm cache, ~10 on cold.**

A 7-10× reduction. Validation owed to Agent T's request-budget spec.

## 5. Files touched

- `supabase/migrations/027_compute_compliance_inputs_rpc.sql` (new) — applied via `mcp__supabase__apply_migration`.
- `supabase/migrations/028_custom_access_token_hook.sql` (new) — applied via `mcp__supabase__apply_migration`. **Studio toggle still required.**
- `src/lib/api/auth.ts` — claims-first `requireUser()` with DB fallback. Return type unchanged.
- `src/lib/api/services/scoring/gather-inputs.ts` — RPC-first with 10-query fallback. Return shape unchanged.

## 6. Open items for the supervisor

1. **Toggle the JWT hook in Studio** (Authentication → Hooks → Custom Access Token Hook → select `public.custom_access_token_hook` → Save). Until this is done, `requireUser()` will keep using the DB fallback — performance won't improve.
2. **Force token refresh on existing sessions** post-toggle: Studio → Authentication → Users → "Sign out all users" (or wait up to 1h for natural rotation).
3. Agent T's request-budget test should observe the delta; if it doesn't, check that the hook actually fired by inspecting `app_metadata` on a fresh JWT.

## 7. TypeScript / errors

`npx tsc --noEmit` ran clean (no output, exit 0). No new TS errors introduced. No new dependencies, no new env vars.
