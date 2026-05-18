-- 043_observation_hard_delete_cascade
--
-- Switch observations from soft-delete (`deleted_at = now()`) to hard-delete
-- (`DELETE FROM observations WHERE id = …`). Mirrors migration 040 (circulars),
-- 041 (policies), and 042 (audits).
--
-- Cascade audit (verified via pg_constraint on 2026-05-17):
--   All 10 child FKs already specify ON DELETE CASCADE:
--     * closure_requests.observation_id      → observations(id) ON DELETE CASCADE
--     * closure_reviews.observation_id       → observations(id) ON DELETE CASCADE
--     * letter_observations.observation_id   → observations(id) ON DELETE CASCADE
--     * observation_assignees.observation_id → observations(id) ON DELETE CASCADE
--     * observation_checklist.observation_id → observations(id) ON DELETE CASCADE
--     * observation_documents.observation_id → observations(id) ON DELETE CASCADE
--     * observation_team.observation_id      → observations(id) ON DELETE CASCADE
--     * observation_timeline.observation_id  → observations(id) ON DELETE CASCADE
--     * observation_updates.observation_id   → observations(id) ON DELETE CASCADE
--     * remediation_plans.observation_id     → observations(id) ON DELETE CASCADE
--   audit_logs.target_id and notifications.entity_id are polymorphic
--   text/uuid pointers (NOT FKs) so the append-only compliance trail
--   survives the hard-delete (see HANDOFF §5 gotcha #7).
--   There is no separate `observation_activity` table — activity is recorded
--   on `observation_timeline` (already CASCADE'd above) and the global
--   `audit_logs` (polymorphic, preserved).
--   `remediation_plans` is a single-level table; it has no per-plan checklist
--   sub-table to cascade. The toggle endpoint reuses `observation_checklist`
--   which is itself cascaded.
-- So this migration does NOT alter any FK definitions; cascade plumbing is
-- already correct. It only:
--   1. Hard-deletes any rows currently flagged as soft-deleted (cascade
--      clears children automatically). Idempotent and safe — at time of
--      writing the table has 0 such rows.
--   2. Drops the `deleted_at IS NULL` guard from the observations SELECT
--      policy since rows are now physically gone after a delete.
-- The `deleted_at` column itself stays on the table as a no-op (dropping it
-- would be load-bearing on multiple route handlers updated in the same
-- commit — easier to keep the column and just stop writing to it).

-- Purge any soft-deleted observations and their children (CASCADE on the FK
-- chain handles every child table). One-shot DELETE on the soft-deleted set;
-- ongoing deletes go through the route handler's DELETE statement and never
-- touch deleted_at again.
delete from public.observations where deleted_at is not null;

-- Drop the deleted_at filter from the SELECT policy. Rows are now physically
-- gone after a delete, so there's no need to special-case visibility.
drop policy if exists observations_select on public.observations;
create policy observations_select on public.observations
  for select to authenticated
  using (has_permission('observation:view'::text));

-- Document the dead column so future readers don't wire it up again.
comment on column public.observations.deleted_at is
  'No-op as of migration 043. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/observations/[observationId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
