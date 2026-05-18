-- 047_calendar_hard_delete_cascade
--
-- Phase-12 cleanup for the calendar resource family. Mirrors migrations
-- 040..046 (circulars, policies, audits, observations, risks, training,
-- letters/correspondence). Switches calendar_events from soft-delete
-- (`deleted_at = now()`) to hard-delete and reverts the SELECT visibility
-- guard from `(deleted_at IS NULL OR has_permission(...))` to
-- `USING (true)`.
--
-- Cascade audit (verified live via pg_constraint on 2026-05-18):
--   calendar_events has ZERO child FK references. There are no child tables
--   (no calendar_event_attendees / calendar_event_reminders /
--   calendar_event_attachments — `attendees` is a `text[]` column on the
--   event row itself, and `reminders` is `jsonb` on the same row). The
--   sibling lookup `calendar_event_types` is referenced by `calendar_events.type`
--   as a *free-form text label*, not a FK, so deleting a type never orphans
--   events and deleting an event never touches types.
--   `audit_logs.entity_id` and `notifications.entity_id` are polymorphic
--   text/uuid pointers (NOT FKs — HANDOFF §5 gotcha #7), so the append-only
--   compliance trail survives the physical row removal.
-- Verification query (run at migration-time, returned 0 rows):
--   SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE confrelid = 'public.calendar_events'::regclass;
--
-- This migration therefore touches no FK definitions. It:
--   1. Hard-deletes any rows currently flagged as soft-deleted.
--   2. Reverts the calendar_events SELECT policy from the soft-delete
--      visibility shape to `USING (true)`, because rows are now physically
--      gone after a delete — there's no tombstone left to hide.
--   3. Documents the dead `deleted_at` column so future readers don't wire
--      it back up. The column itself stays on the table to avoid
--      destabilising any route handler that still references it in a
--      filter — those filters become harmless no-ops, since no row ever
--      has a non-null `deleted_at` again.
--
-- See OPTIMIZATION-PATTERNS.md §4 and migration 040 for the canonical
-- pattern.

-- =========================================================================
-- 1. Purge soft-deleted calendar_events.
-- =========================================================================
delete from public.calendar_events where deleted_at is not null;

-- =========================================================================
-- 2. Revert calendar_events SELECT policy → using (true).
-- =========================================================================
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (true);

-- =========================================================================
-- 3. Document the dead column so future readers don't wire it back up.
-- =========================================================================
comment on column public.calendar_events.deleted_at is
  'No-op as of migration 047. Kept on the table to avoid destabilising downstream code paths. Hard-delete is now the only delete path — see app/api/calendar/events/[eventId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
