-- 045_training_hard_delete_cascade
--
-- Switch training_courses from soft-delete (`deleted_at = now()`) to
-- hard-delete (`DELETE FROM training_courses WHERE id = …`). Mirrors
-- migrations 040 (circulars), 041 (policies), 042 (audits), 043 (observations).
--
-- Also augments the list shape for the training UI by adding an optional
-- `required_for` text[] column on `training_courses` (department names that
-- the course is mandatory for). Empty array means "no required departments".
--
-- Cascade audit (verified via pg_constraint on 2026-05-17):
--   All child FKs already specify ON DELETE CASCADE:
--     * employee_course_progress.course_id    → training_courses(id) ON DELETE CASCADE
--     * employee_course_progress.employee_id  → training_employees(id) ON DELETE CASCADE
--   `training_categories` is a lookup table — `training_courses.category`
--   is a free-form TEXT label (not a FK), so deleting a category never
--   orphans courses.
--   `audit_logs.target_id` and `notifications.entity_id` are polymorphic
--   text/uuid pointers (NOT FKs) so the append-only compliance trail
--   survives the hard-delete (see HANDOFF §5 gotcha #7).
--   There is no separate `training_certifications` table — certifications
--   are a filtered view of `employee_course_progress` (status='completed'
--   AND score IS NOT NULL), already cascaded by the course/employee FKs.
-- End-to-end cascade was tested live before this migration shipped:
--   course → enrollment cascade OK; employee → enrollment cascade OK.
-- So this migration does NOT alter any FK definitions; cascade plumbing is
-- already correct. It:
--   1. Adds the `required_for text[] not null default '{}'` column.
--   2. Hard-deletes any rows currently flagged as soft-deleted (cascade
--      clears children automatically). Idempotent and safe.
--   3. Drops the `deleted_at IS NULL` guard from the training_courses
--      SELECT policy since rows are now physically gone after a delete.
-- The `deleted_at` column itself stays on the table as a no-op (dropping
-- it would be load-bearing on multiple route handlers updated in the same
-- commit — easier to keep the column and just stop writing to it).

-- 1. Add the required_for column. Default empty array keeps existing rows valid.
alter table public.training_courses
  add column if not exists required_for text[] not null default '{}'::text[];

comment on column public.training_courses.required_for is
  'Department names (free-form TEXT, matches training_employees.department) for which this course is mandatory. Empty array means "no required departments". Used by the team-training list to surface required-for chips per row.';

-- 2. Purge any soft-deleted courses and their children (CASCADE handles
--    every child table). One-shot DELETE on the soft-deleted set; ongoing
--    deletes go through the route handler's DELETE statement and never
--    touch deleted_at again.
delete from public.training_courses where deleted_at is not null;

-- 3. Drop the deleted_at filter from the SELECT policy.
drop policy if exists training_courses_select on public.training_courses;
create policy training_courses_select on public.training_courses
  for select to authenticated
  using (true);

-- Document the dead column so future readers don't wire it up again.
comment on column public.training_courses.deleted_at is
  'No-op as of migration 045. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/training/courses/[courseId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
