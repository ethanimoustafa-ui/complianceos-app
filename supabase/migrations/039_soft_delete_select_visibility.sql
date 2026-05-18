-- 039_soft_delete_select_visibility
--
-- Fix: soft-delete UPDATE on `circulars` / `policies` / `calendar_events`
-- fails with "new row violates row-level security policy" even for org_admin.
--
-- Root cause: Postgres applies the SELECT policy's USING expression as an
-- implicit WITH CHECK on the new row of an UPDATE statement (so an UPDATE
-- can't make a row invisible to the same user mid-statement). The existing
-- SELECT policies are `USING (deleted_at IS NULL)`, so the moment the
-- soft-delete UPDATE sets `deleted_at = now()`, the new row fails the SELECT
-- predicate and the whole statement aborts — even though the UPDATE policy's
-- WITH CHECK (`has_permission('edit')`) passes.
--
-- Fix: broaden each SELECT policy so users with the relevant write/delete
-- permission can also see soft-deleted rows. Non-privileged users are still
-- shielded from soft-deleted rows. The route handlers continue to filter
-- `.is('deleted_at', null)` so list/detail GETs hide soft-deleted rows from
-- everyone by default — this RLS change is purely about UPDATE visibility.
--
-- See: https://www.postgresql.org/docs/current/sql-createpolicy.html
--   "Per-Command Policies … UPDATE policies include both a USING expression
--   to determine which records the command can operate on, and a WITH CHECK
--   expression to define which modified rows are allowed to be stored back."
--   Combined with the SELECT-as-implicit-WITH-CHECK enforcement when a row
--   is read back during the same statement.

-- circulars ----------------------------------------------------------------
drop policy if exists circulars_select on public.circulars;
create policy circulars_select on public.circulars
  for select to authenticated
  using (deleted_at is null or has_permission('edit') or has_permission('delete'));

-- policies -----------------------------------------------------------------
drop policy if exists policies_select on public.policies;
create policy policies_select on public.policies
  for select to authenticated
  using (deleted_at is null or has_permission('edit') or has_permission('delete'));

-- calendar_events ----------------------------------------------------------
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (deleted_at is null or has_permission('edit') or has_permission('delete'));

notify pgrst, 'reload schema';
