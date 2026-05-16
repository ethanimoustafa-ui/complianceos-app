# Phase 17 — Agent S: Security & Storage pack

**Status:** ✅ Migrations applied. Two manual follow-ups remain (Studio toggle + CORS lockdown).
**Date:** 2026-05-16
**Owner:** Agent S (parallel fan-out under HANDOFF §6)
**Project ref:** `qdbitfgxbnbzkqhdoepd`

---

## 1. What landed

### Migrations (both applied via `mcp__supabase__apply_migration`)

| File | Purpose |
|---|---|
| `supabase/migrations/025_storage_buckets.sql` | Creates 10 private buckets with MIME whitelists + size limits + 3 RLS policies each on `storage.objects` (30 policies total). |
| `supabase/migrations/026_compliance_cache_write.sql` | Adds INSERT/UPDATE/DELETE RLS policies on `public.compliance_scores_cache` for `authenticated` (Option b from HANDOFF §4 item 2). |

### Buckets created (all `public=false`)

| Bucket | Size limit | MIME count |
|---|---|---|
| `audit_documents` | 50 MB | 12 |
| `observation_documents` | 50 MB | 12 |
| `sama_letter_attachments` | 50 MB | 12 |
| `policy_evidence` | 50 MB | 12 |
| `reports` | 50 MB | 1 (PDF only) |
| `policy_attachments` | 20 MB | 12 |
| `correspondence_attachments` | 20 MB | 12 |
| `circular_remediation_attachments` | 20 MB | 12 |
| `circular_cap_attachments` | 20 MB | 12 |
| `article_attachments` | 20 MB | 12 |

MIME set for 12-MIME buckets: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `text/plain`, `text/csv`.

### RLS policies on `storage.objects`

Three per new bucket (30 added), pattern:
- `<bucket>_select` — `using (bucket_id = '<bucket>' and owner = auth.uid())`
- `<bucket>_insert` — `with check (bucket_id = '<bucket>' and auth.uid() is not null and owner = auth.uid())`
- `<bucket>_delete` — `using (bucket_id = '<bucket>' and owner = auth.uid())`

Plus the pre-existing `authenticated_read_pdfs` SELECT on `pdf-renders`. Verified: 11 SELECT + 10 INSERT + 10 DELETE policies on `storage.objects` after apply.

### `compliance_scores_cache` write fix

Added 3 policies (`authenticated_write` for INSERT, `authenticated_update` for UPDATE, `authenticated_delete` for DELETE), all `WITH CHECK (true)` / `USING (true)`. Cache table — dedup is by inputs hash, not RLS.

---

## 2. Advisor delta

| Metric | Before | After | Δ |
|---|---|---|---|
| ERROR-level lints | 0 | 0 | 0 |
| WARN-level lints | 15 | 20 | +5 |

The +5 WARN breakdown:
- **+3** on `compliance_scores_cache` (intentional — Option b from §4). These are `rls_policy_always_true` lints, same pattern as the 11 pre-existing append-only-timeline warnings that HANDOFF §3.4 + §5 gotcha #7 already document as intentional.
- **+2** from Agent P's `compute_compliance_inputs(...)` SECURITY DEFINER function (`anon_security_definer_function_executable` + `authenticated_security_definer_function_executable`). **Not my work** — Agent P landed this in parallel. Their territory; flagging it for supervisor review (likely intentional per Agent P's RPC plan, but `EXECUTE` should probably be revoked from `anon`).

No new ERRORs introduced. No bucket-related advisor lints (Supabase advisor does not lint per-bucket).

---

## 3. MIME-collision check

Query: `SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN (...10 new buckets...)` → **0 rows**. No collision risk — buckets were empty before MIME whitelist applied.

---

## 4. Manual follow-ups (supervisor decision needed)

### 4a. Leaked-password protection
`auth.config` is not reachable via SQL on Supabase managed projects (only `auth.flow_state` is exposed; the auth GoTrue config lives outside the schema-info view). **User must toggle manually:**
- Studio → Authentication → Policies → "Leaked password protection" → enable.
- Once enabled, the advisor lint `auth_leaked_password_protection` will drop off.

### 4b. CORS lockdown (deferred — documented only)
Default Supabase CORS is `*`. Pre-production, restrict to the Vercel production domain. Recommended allowlist:
- `https://complianceos-app.vercel.app` (placeholder — supervisor to confirm the real prod hostname)
- Optionally a wildcard for Vercel preview deploys: `https://complianceos-app-*-hani-s-projects3.vercel.app`
- Localhost dev origin should remain (`http://localhost:3000`) during development, removed at prod cutover.

**Action path:** Studio → Project Settings → API → CORS Configuration. Not changed via SQL — Supabase does not expose CORS config via the DB.

---

## 5. Verification queries (run after apply, all passed)

```sql
-- 10 buckets exist, all private, correct limits + MIME counts
SELECT id, public, file_size_limit, array_length(allowed_mime_types, 1) AS mime_count
FROM storage.buckets
WHERE id IN ('audit_documents','observation_documents','sama_letter_attachments',
             'policy_attachments','policy_evidence','correspondence_attachments',
             'circular_remediation_attachments','circular_cap_attachments',
             'article_attachments','reports')
ORDER BY id;
-- → 10 rows, all public=false

-- Policy count by command on storage.objects
SELECT cmd, COUNT(*) FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' GROUP BY cmd;
-- → DELETE 10, INSERT 10, SELECT 11 (10 new + pdf-renders)

-- compliance_scores_cache write policies present
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='compliance_scores_cache' ORDER BY policyname;
-- → compliance_scores_cache_authenticated_delete (DELETE)
--   compliance_scores_cache_authenticated_update (UPDATE)
--   compliance_scores_cache_authenticated_write  (INSERT)
--   compliance_scores_cache_select               (SELECT, pre-existing)
```

---

## 6. Blockers / handoff notes

- **None blocking.** Both migrations applied cleanly; advisor delta is within expected bounds.
- **Out of scope, flagged for supervisor:** Agent P's `compute_compliance_inputs` SECURITY DEFINER function is callable by `anon` — likely a missing `REVOKE EXECUTE ... FROM anon` in their migration. Not mine to fix.
- **Out of scope, flagged for supervisor:** `MEMORY.md` still references the old project ref `pamfhghrjfizlbhdfycu`; HANDOFF.md §2 has the correct ref `qdbitfgxbnbzkqhdoepd`. The user (or supervisor) should update MEMORY.md when convenient.
