-- Wave-21 — Letters pattern-stack migration.
--
-- 1. Dual-store bilingual columns on `letter_timeline` (kills raw-title write).
-- 2. `updated_at` + trigger on `letter_approval_steps` (enables If-Match on
--    per-step mutations when those routes are built).
-- 3. `letter_versions` table — dual-store text_en/text_ar + field_changes jsonb.
--    Mirrors `observation_versions` (migration 064).

-- -----------------------------------------------------------------------
-- 1. letter_timeline — add text_en + text_ar dual-store columns
-- -----------------------------------------------------------------------
alter table public.letter_timeline
  add column if not exists text_en text not null default '',
  add column if not exists text_ar text not null default '';

-- Back-fill existing rows: copy the existing English `title` into text_en;
-- leave text_ar as '' (we have no Arabic for legacy rows — acceptable, the
-- reader will fall back to text_en via the store mapper).
update public.letter_timeline
  set text_en = coalesce(title, ''),
      text_ar = coalesce(title, '')
  where text_en = '';

-- Drop the defaults so writers MUST supply both columns going forward.
alter table public.letter_timeline
  alter column text_en drop default,
  alter column text_ar drop default;

-- -----------------------------------------------------------------------
-- 2. letter_approval_steps — add updated_at + trigger
-- -----------------------------------------------------------------------
alter table public.letter_approval_steps
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.letter_approval_steps;
create trigger set_updated_at
  before update on public.letter_approval_steps
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------
-- 3. letter_versions — new table (dual-store, append-only)
-- -----------------------------------------------------------------------
create table if not exists public.letter_versions (
  id           uuid primary key default gen_random_uuid(),
  letter_id    uuid not null references public.letters(id) on delete cascade,
  date         date not null default current_date,
  author       text not null default '',
  text_en      text not null,
  text_ar      text not null,
  field_changes jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_letter_versions_letter
  on public.letter_versions(letter_id, created_at desc);

alter table public.letter_versions enable row level security;

drop policy if exists "letter_versions_read" on public.letter_versions;
create policy "letter_versions_read" on public.letter_versions
  for select using (auth.role() = 'authenticated');

drop policy if exists "letter_versions_insert" on public.letter_versions;
create policy "letter_versions_insert" on public.letter_versions
  for insert with check (auth.role() = 'authenticated');
