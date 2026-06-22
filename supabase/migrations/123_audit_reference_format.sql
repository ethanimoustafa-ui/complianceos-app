-- 123_audit_reference_format.sql
-- Add human-readable AUD-YYYY-00001 reference codes to audits, mirroring the
-- observations OBS-YYYY-00001 scheme (migration 075). Audits previously had only
-- a UUID id, which surfaced as a sliced "#a6079037" in the Team Score findings.
--
-- 1. add `reference` column
-- 2. backfill live + soft-deleted rows (ranked by created_at within each year)
-- 3. enforce NOT NULL + UNIQUE
--
-- No sequence object — the Node POST route (api/audits) computes the next value
-- via SELECT max(reference) LIKE 'AUD-YYYY-%' with a retry-on-23505 loop.

begin;

alter table public.audits add column if not exists reference text;

-- Backfill live audits: AUD-<year>-<5-digit seq>, earliest in each year = 00001.
update public.audits a
set reference = 'AUD-' || year_seq.year || '-' || year_seq.seq
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
  from public.audits
  where deleted_at is null
) as year_seq
where a.id = year_seq.id;

-- Soft-deleted rows get a 'D'-prefixed sequence so the unique index never
-- collides with a live reference (mirrors migration 075).
update public.audits a
set reference = 'AUD-' || year_seq.year || '-D' || year_seq.seq
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
  from public.audits
  where deleted_at is not null
) as year_seq
where a.id = year_seq.id;

-- Enforce after backfill.
alter table public.audits alter column reference set not null;
create unique index if not exists audits_reference_key on public.audits(reference);

commit;

notify pgrst, 'reload schema';
