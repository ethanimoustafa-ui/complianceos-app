-- 041_policy_hard_delete_cascade
--
-- Switch policies from soft-delete (`deleted_at = now()`) to hard-delete
-- (`DELETE FROM policies WHERE id = …`). Mirrors migration 040 for circulars.
--
-- Cascade audit (verified via pg_constraint on 2026-05-17):
--   All 6 child FKs already specify ON DELETE CASCADE:
--     * policy_activity_log.policy_id      → policies(id) ON DELETE CASCADE
--     * policy_attachments.policy_id       → policies(id) ON DELETE CASCADE
--     * policy_evidence.policy_id          → policies(id) ON DELETE CASCADE
--     * policy_review_cycles.policy_id     → policies(id) ON DELETE CASCADE
--     * policy_versions.policy_id          → policies(id) ON DELETE CASCADE
--     * policy_workflow_steps.policy_id    → policies(id) ON DELETE CASCADE
--   audit_logs.target_id and notifications.entity_id are polymorphic
--   text/uuid pointers (NOT FKs) so the append-only compliance trail
--   survives the hard-delete (see HANDOFF §5 gotcha #7).
-- So this migration does NOT alter any FK definitions; the cascade plumbing
-- is already correct. It only:
--   1. Hard-deletes any rows currently flagged as soft-deleted (cascade
--      clears children automatically — at time of writing the table has
--      0 such rows but the statement is idempotent and safe).
--   2. Reverts the policies SELECT policy to `USING (true)` since rows are
--      now physically gone — the broadened policy added in migration 039 was
--      a workaround for the soft-delete UPDATE round-trip that we no longer
--      need.
-- The `deleted_at` column itself stays on the table as a no-op (dropping it
-- would be load-bearing on the route handlers we're updating in the same
-- commit — easier to keep the column and just stop writing to it).
-- See HANDOFF §11 for the Phase 11 context; this is Phase 12 cleanup
-- (policy parity with circular migration 040).

-- Purge any soft-deleted policies and their children (CASCADE on the FK chain
-- handles every child table). One-shot DELETE on the soft-deleted set; ongoing
-- deletes go through the route handler's DELETE statement and never touch
-- deleted_at again.
delete from public.policies where deleted_at is not null;

-- Revert the SELECT-policy broadening from migration 039. Rows are now
-- physically gone after a delete, so there's no need to special-case
-- visibility for privileged users — they'll never need to see a tombstone.
drop policy if exists policies_select on public.policies;
create policy policies_select on public.policies
  for select to authenticated
  using (true);

-- Document the dead column so future readers don't wire it up again.
comment on column public.policies.deleted_at is
  'No-op as of migration 041. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/policies/[policyId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
