-- Wave-20 — `observation_versions` table for per-field version history.
--
-- Mirror of `circular_versions` / `article_versions` / `policy_versions`
-- (migrations 049, 057). Dual-store `text_en` + `text_ar` populated at write
-- time via `renderBilingual`; `field_changes` jsonb carries the per-field
-- Field/From/To diff. The table is append-only (no PATCH/DELETE route) so it
-- receives NO `updated_at` or trigger (PORTING-TEMPLATE §4 note).
--
-- `insertObservationVersion` in `src/lib/api/services/observations.ts` was
-- already guarded to no-op on a "42P01 — undefined_table" error so the PATCH
-- route continued working while this table was absent. Once this migration
-- runs, the guard still works but the insert succeeds and version history is
-- now persisted.

create table if not exists public.observation_versions (
  id          uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  date        date not null default current_date,
  author      text not null default '',
  text_en     text not null,
  text_ar     text not null,
  field_changes jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_observation_versions_observation
  on public.observation_versions(observation_id, created_at desc);

-- RLS: align with the observation_timeline pattern (same entity family).
-- Authenticated users can read version history on their observations;
-- writes go through the API route (which checks observation:edit).
alter table public.observation_versions enable row level security;

drop policy if exists "observation_versions_read" on public.observation_versions;
create policy "observation_versions_read" on public.observation_versions
  for select using (auth.role() = 'authenticated');

drop policy if exists "observation_versions_insert" on public.observation_versions;
create policy "observation_versions_insert" on public.observation_versions
  for insert with check (auth.role() = 'authenticated');
