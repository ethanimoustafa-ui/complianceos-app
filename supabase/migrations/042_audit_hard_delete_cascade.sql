-- 042_audit_hard_delete_cascade
--
-- Switch audits from soft-delete (`deleted_at = now()`) to hard-delete
-- (`DELETE FROM audits WHERE id = …`). Mirrors migration 040 (circulars)
-- and 041 (policies).
--
-- Cascade audit (verified via pg_constraint on 2026-05-17):
--   All 5 child FKs already specify ON DELETE CASCADE:
--     * audit_activity_logs.audit_id   → audits(id) ON DELETE CASCADE
--     * audit_comments.audit_id        → audits(id) ON DELETE CASCADE
--     * audit_documents.audit_id       → audits(id) ON DELETE CASCADE
--     * audit_tasks.audit_id           → audits(id) ON DELETE CASCADE
--     * audit_team_members.audit_id    → audits(id) ON DELETE CASCADE
--   audit_logs.target_id and notifications.entity_id are polymorphic
--   text/uuid pointers (NOT FKs) so the append-only compliance trail
--   survives the hard-delete (see HANDOFF §5 gotcha #7).
--   There is no `audit_findings` table in the current schema; observations
--   link to audits via letters / observation_team and have no direct FK.
-- So this migration does NOT alter any FK definitions; cascade plumbing
-- is already correct. It only:
--   1. Hard-deletes any rows currently flagged as soft-deleted (cascade
--      clears children automatically). Idempotent and safe.
--   2. Reverts the audits SELECT policy to drop the `deleted_at IS NULL`
--      guard since rows are now physically gone after a delete; that guard
--      was a workaround for the soft-delete UPDATE round-trip that no
--      longer happens.
-- The `deleted_at` column itself stays on the table as a no-op (dropping
-- it would be load-bearing on multiple route handlers updated in the same
-- commit — easier to keep the column and just stop writing to it). Same
-- applies to `audit_tasks.deleted_at`.

-- Purge soft-deleted audits and their children (CASCADE on the FK chain
-- handles every child table). One-shot DELETE on the soft-deleted set;
-- ongoing deletes go through the route handler's DELETE statement and
-- never touch deleted_at again.
delete from public.audits where deleted_at is not null;

-- Drop the deleted_at filter from the SELECT policy. Rows are now
-- physically gone after a delete, so there's no need to special-case
-- visibility.
drop policy if exists audits_select on public.audits;
create policy audits_select on public.audits
  for select to authenticated
  using (has_permission('audit:view'::text));

-- Document the dead column so future readers don't wire it up again.
comment on column public.audits.deleted_at is
  'No-op as of migration 042. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/audits/[auditId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
