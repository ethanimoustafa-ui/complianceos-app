-- 026_compliance_cache_write
-- Adds an INSERT/UPDATE/DELETE RLS policy on `public.compliance_scores_cache`
-- so authenticated users (the server, operating with the user's bound client)
-- can populate the score cache.
--
-- Per HANDOFF.md §4 item 2: the scoring engine attempts to write to
-- compliance_scores_cache via the RLS-bound client and gets blocked, causing
-- every dashboard load to recompute from scratch (7+ source-table reads).
-- We pick Option (b) from §4: open writes to authenticated. The table is a
-- cache, not a security surface — its dedup key is the inputs hash, and SELECT
-- is already public-authenticated via the existing `compliance_scores_cache_select`
-- policy. No PII or per-user data lives here.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

drop policy if exists compliance_scores_cache_authenticated_write on public.compliance_scores_cache;
drop policy if exists compliance_scores_cache_authenticated_update on public.compliance_scores_cache;
drop policy if exists compliance_scores_cache_authenticated_delete on public.compliance_scores_cache;

-- INSERT: any authenticated may add cache rows
create policy compliance_scores_cache_authenticated_write on public.compliance_scores_cache
  for insert to authenticated
  with check (true);

-- UPDATE: any authenticated may refresh existing cache rows
create policy compliance_scores_cache_authenticated_update on public.compliance_scores_cache
  for update to authenticated
  using (true)
  with check (true);

-- DELETE: any authenticated may evict stale cache rows
create policy compliance_scores_cache_authenticated_delete on public.compliance_scores_cache
  for delete to authenticated
  using (true);

-- PostgREST schema cache reload (HANDOFF §5 gotcha #5)
notify pgrst, 'reload schema';
