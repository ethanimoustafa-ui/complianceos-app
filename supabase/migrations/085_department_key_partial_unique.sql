-- M1 (W34): departments.key uniqueness must ignore soft-deleted rows.
--
-- The original constraint `departments_key_key UNIQUE (key)` (migration 003) is
-- a plain, non-partial unique constraint. Because DELETE soft-deletes rows
-- (sets deleted_at) without freeing the `key`, every deleted department kept its
-- key reserved forever. Re-adding a department whose slugified key matched a
-- soft-deleted row raised a Postgres unique_violation (23505), which fell
-- through to a generic HTTP 500 ("internal server error") in the Add-department
-- flow. Same class of bug as W33 (a soft-delete-blind constraint colliding with
-- soft-deleted rows).
--
-- Fix: replace the constraint with a PARTIAL unique index scoped to live rows,
-- so a previously soft-deleted key can be reused while two LIVE departments
-- still cannot share a key. Mirrors the house pattern (idx_notifications_user_dedupe).

alter table public.departments drop constraint if exists departments_key_key;

create unique index if not exists departments_key_unique_active
  on public.departments (key)
  where deleted_at is null;
