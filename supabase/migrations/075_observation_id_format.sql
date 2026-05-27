-- 074_observation_id_format.sql
-- O3: Change observation reference format from title-derived slug (HAN-2026-0001)
-- to fixed OBS prefix with 5-digit zero-padded sequence (OBS-2026-00001).
--
-- PAUSE: requires user sign-off before applying via MCP.
--
-- Steps:
--   1. Backfill existing rows with new OBS-YYYY-00000 references, ordered by
--      created_at to preserve logical creation order within each year.
--   2. No sequence object is needed — the Node-side insertWithRefCode helper
--      uses SELECT max(reference) LIKE 'OBS-YYYY-%' to compute the next value.
--      After backfill, that max() will correctly reflect the new scheme.

-- Safety: wrap in a transaction so the backfill is all-or-nothing.
begin;

-- Step 1: backfill existing observations.
-- Assign OBS-<year>-<seq> where seq is the row rank within each calendar year,
-- ordered by created_at ascending (earliest observation gets 00001).
update public.observations o
set reference = 'OBS-' || year_seq.year || '-' || year_seq.seq
from (
  select
    id,
    extract(year from created_at)::int as year,
    lpad(
      row_number() over (
        partition by extract(year from created_at)
        order by created_at asc
      )::text,
      5,
      '0'
    ) as seq
  from public.observations
  where deleted_at is null
) as year_seq
where o.id = year_seq.id;

-- Also update deleted rows so the unique constraint never fires on a re-insert.
update public.observations o
set reference = 'OBS-' || year_seq.year || '-D' || year_seq.seq
from (
  select
    id,
    extract(year from created_at)::int as year,
    lpad(
      row_number() over (
        partition by extract(year from created_at), deleted_at is not null
        order by created_at asc
      )::text,
      5,
      '0'
    ) as seq
  from public.observations
  where deleted_at is not null
) as year_seq
where o.id = year_seq.id;

commit;
