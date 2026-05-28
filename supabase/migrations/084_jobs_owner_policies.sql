-- 084_jobs_owner_policies.sql
-- W29.5: /api/pdf/generate was 500ing because the only RLS policy on
-- public.jobs was `jobs_select_admin` (SELECT gated on settings:view) — no
-- INSERT policy existed, so authenticated users could not enqueue jobs.
-- The route uses the user-scoped client (via requireUser()), so RLS blocks
-- the insert. PG logs: "new row violates row-level security policy for
-- table jobs".
--
-- Fix: two additive policies scoped to the job's owner.
--   1. jobs_insert_own  — authenticated users may INSERT jobs they own.
--   2. jobs_select_own  — authenticated users may SELECT jobs they own
--      (additive to the existing admin policy; the poll route at
--      /api/jobs/[jobId] uses the same user-scoped client and would
--      otherwise return NotFound for non-admin users).
--
-- Ownership is encoded in payload.requested_by (the route stores user.id
-- there at enqueue time). Compared to auth.uid()::text to allow regular
-- authenticated users to drive their own background jobs (PDF, compliance
-- recompute, etc.) without granting blanket job-table access.

drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs
  for insert
  to authenticated
  with check (payload->>'requested_by' = auth.uid()::text);

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"
  on public.jobs
  for select
  to authenticated
  using (payload->>'requested_by' = auth.uid()::text);
