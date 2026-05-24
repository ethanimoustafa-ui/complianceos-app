-- 066_advisory_pattern_stack
--
-- W23 — Advisory pattern-stack migration.
--
-- 1. `set_updated_at` trigger on `advisory_requests` (idempotent).
-- 2. `advisory_timeline` table: dual-store text_en + text_ar.
-- 3. `advisory_versions` table: dual-store + field_changes jsonb.
-- 4. Fix: advisory_requests SELECT policy broadened to allow soft-delete
--    UPDATE (mirrors migration 039 fix for circulars/policies/calendar_events).
--    Root cause: Postgres applies the SELECT USING expression as an implicit
--    WITH CHECK on the post-UPDATE row. `deleted_at IS NULL` blocks the
--    soft-delete the moment it sets `deleted_at = now()`.

-- -----------------------------------------------------------------------
-- 1. advisory_requests — updated_at trigger (idempotent)
-- -----------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_advisory_requests_ua on public.advisory_requests;
create trigger trg_advisory_requests_ua
  before update on public.advisory_requests
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------
-- 2. advisory_timeline
-- -----------------------------------------------------------------------

create table if not exists public.advisory_timeline (
  id          uuid primary key default gen_random_uuid(),
  advisory_id uuid not null references public.advisory_requests(id) on delete cascade,
  text_en     text not null,
  text_ar     text not null,
  user_name   text not null default '',
  status      text not null default 'completed',
  created_at  timestamptz not null default now()
);

alter table public.advisory_timeline enable row level security;

drop policy if exists advisory_timeline_select on public.advisory_timeline;
create policy advisory_timeline_select on public.advisory_timeline
  for select to authenticated using (true);

drop policy if exists advisory_timeline_insert on public.advisory_timeline;
create policy advisory_timeline_insert on public.advisory_timeline
  for insert to authenticated with check (has_permission('edit') or has_permission('create'));

-- -----------------------------------------------------------------------
-- 3. advisory_versions
-- -----------------------------------------------------------------------

create table if not exists public.advisory_versions (
  id             uuid primary key default gen_random_uuid(),
  advisory_id    uuid not null references public.advisory_requests(id) on delete cascade,
  date           date not null default current_date,
  author         text not null default '',
  text_en        text not null,
  text_ar        text not null,
  field_changes  jsonb,
  created_at     timestamptz not null default now()
);

alter table public.advisory_versions enable row level security;

drop policy if exists advisory_versions_select on public.advisory_versions;
create policy advisory_versions_select on public.advisory_versions
  for select to authenticated using (true);

drop policy if exists advisory_versions_insert on public.advisory_versions;
create policy advisory_versions_insert on public.advisory_versions
  for insert to authenticated with check (has_permission('edit'));

-- -----------------------------------------------------------------------
-- 4. Fix advisory_requests SELECT policy for soft-delete compatibility
--    (mirrors migration 039 for circulars/policies/calendar_events)
-- -----------------------------------------------------------------------

drop policy if exists advisory_requests_select on public.advisory_requests;
create policy advisory_requests_select on public.advisory_requests
  for select to authenticated
  using (deleted_at is null or has_permission('edit') or has_permission('delete'));

notify pgrst, 'reload schema';
