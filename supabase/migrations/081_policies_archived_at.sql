-- 081_policies_archived_at.sql
-- P6 (W29): Add archived_at column to policies table.
-- Mirrors the pattern from migration 076 (observations archived_at).
--
-- Decision: use archived_at timestamptz (nullable) rather than a new status enum
-- value for consistency with observations (076) and to avoid widening the Zod
-- PolicyStatus enum which is strict. The Archive button sets archived_at=NOW();
-- the default list query filters to archived_at IS NULL (active policies);
-- the "Archived" filter shows archived_at IS NOT NULL rows.
--
-- The existing "Archive" button in the UI sets status='expired' which is a hack.
-- After this migration, the PATCH /api/policies/:id route will accept
-- archived_at in the body. The UI is updated to PATCH {archived_at: now()} and
-- filter using the new column. Existing rows with status='expired' that were
-- archived via the old path are NOT automatically back-filled (they keep their
-- status); only rows archived after this migration will have archived_at set.

alter table public.policies
  add column if not exists archived_at timestamptz null;

create index if not exists idx_policies_archived_at
  on public.policies(archived_at)
  where deleted_at is null;

comment on column public.policies.archived_at is
  'Set when "Archive Policy" is clicked: archived_at → NOW(). '
  'Rows with archived_at IS NOT NULL are hidden from the default Policies list '
  'and visible only when the "Archived" filter is active. '
  'This column does NOT change policies.status — a policy can be archived at any status.';
