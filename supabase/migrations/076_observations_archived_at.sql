-- 075_observations_archived_at.sql
-- O7: Add archived_at column to observations table.
-- Observations marked as "remediated" get status='closed' AND archived_at=NOW().
-- The default list query excludes archived_at IS NOT NULL rows; an "Archived"
-- filter option surfaces them.
--
-- PAUSE: requires user sign-off before applying via MCP.

alter table public.observations
  add column if not exists archived_at timestamptz null;

create index if not exists idx_observations_archived_at
  on public.observations(archived_at)
  where deleted_at is null;

comment on column public.observations.archived_at is
  'Set when "Mark as Remediated" is clicked: status → closed, archived_at → NOW(). '
  'Rows with archived_at set are hidden from the default Observations Tracker list '
  'and visible only when the "Archived" filter is active.';
