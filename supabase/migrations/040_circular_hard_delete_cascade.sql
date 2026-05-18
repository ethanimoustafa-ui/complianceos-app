-- 040_circular_hard_delete_cascade
--
-- Switch circulars from soft-delete (`deleted_at = now()`) to hard-delete
-- (`DELETE FROM circulars WHERE id = …`). Audit:
--   * All 7 child FKs already specify ON DELETE CASCADE (circular_articles,
--     circular_cap_attachments, circular_pending_edits,
--     circular_remediation_attachments, circular_timeline, circular_versions,
--     circular_workflow_steps).
--   * Grand-children of circular_articles (article_attachments,
--     article_checklist_items, article_timeline, article_versions) also
--     already specify ON DELETE CASCADE on their parent. So a single
--     DELETE on circulars cascades all the way down.
--   * audit_logs.target_id is NOT a FK — it's a polymorphic text/uuid pointer
--     by design (see HANDOFF §5 gotcha #7 — append-only). Audit trail survives.
--   * notifications.entity_id is NOT a FK either — polymorphic. Survives.
-- So this migration does NOT alter any FK definitions; the cascade plumbing
-- is already correct. It only:
--   1. Hard-deletes any rows currently flagged as soft-deleted (the 12 ghost
--      rows from the user's recent UI deletes — cascade clears children too).
--   2. Reverts the circulars SELECT policy to `USING (true)` since rows are
--      now physically gone — the broadened policy added in migration 039 was
--      a workaround for the soft-delete UPDATE round-trip that we no longer
--      need.
-- The `deleted_at` column itself stays on the table as a no-op (dropping it
-- would be load-bearing on the route handlers we're updating in the same
-- commit — easier to keep the column and just stop writing to it).
-- See HANDOFF §11 for the Phase 11 context; this is Phase 12 cleanup.

-- Purge soft-deleted circulars and their children (CASCADE on the FK chain
-- handles every child table — circular_articles → article_*; plus the direct
-- children listed above). This is intentionally a one-shot DELETE on the
-- soft-deleted set; ongoing deletes will go through the route handler's
-- DELETE statement and never touch deleted_at again.
delete from public.circulars where deleted_at is not null;

-- Revert the SELECT-policy broadening from migration 039. Rows are now
-- physically gone after a delete, so there's no need to special-case
-- visibility for privileged users — they'll never need to see a tombstone.
drop policy if exists circulars_select on public.circulars;
create policy circulars_select on public.circulars
  for select to authenticated
  using (true);

-- Document the dead column so future readers don't wire it up again.
comment on column public.circulars.deleted_at is
  'No-op as of migration 040. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/circulars/[circularId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
