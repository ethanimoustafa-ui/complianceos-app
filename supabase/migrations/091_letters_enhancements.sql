-- 091 — letters enhancements (W41)
--
-- 1) Dedicated PUBLIC bucket for signature images. Signatures were uploaded
--    into the private sama_letter_attachments bucket and persisted as 1-YEAR
--    SIGNED urls — which break on expiry/re-mint and made uploads fragile.
--    Signatures are embedded in outbound letters anyway; a public bucket with
--    an image whitelist + 5MB cap gives stable URLs for <img> and the PDF.
-- 2) letter_approval_chains — per-authority configurable approval chain
--    (steps jsonb [{step,role}]). Consulted when submit-for-approval seeds a
--    letter's chain; manageable from the approval-card Configure modal.
-- 3) Widen letter_approval_steps.step CHECK from (1,2,3) to 1..10 so
--    configurable chains can exceed three steps.
-- 4) letter_templates: `pinned` (the letters-page quick-strip shows pinned
--    templates) + `default_sub_category` (template carries a sub-category).

-- ── 1. signatures bucket ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letter_signatures', 'letter_signatures', true, 5242880,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "letter_signatures_select" on storage.objects;
create policy "letter_signatures_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'letter_signatures');

drop policy if exists "letter_signatures_insert" on storage.objects;
create policy "letter_signatures_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'letter_signatures' and owner = auth.uid());

drop policy if exists "letter_signatures_delete" on storage.objects;
create policy "letter_signatures_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'letter_signatures' and owner = auth.uid());

-- ── 2. per-authority approval chains ─────────────────────────────────────────
create table if not exists public.letter_approval_chains (
  id uuid primary key default gen_random_uuid(),
  authority text not null unique,
  steps jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.letter_approval_chains enable row level security;

drop policy if exists letter_approval_chains_select on public.letter_approval_chains;
create policy letter_approval_chains_select
  on public.letter_approval_chains for select
  to authenticated using (true);

drop policy if exists letter_approval_chains_write on public.letter_approval_chains;
create policy letter_approval_chains_write
  on public.letter_approval_chains for all
  to authenticated
  using (public.has_permission('edit'))
  with check (public.has_permission('edit'));

drop trigger if exists trg_letter_approval_chains_ua on public.letter_approval_chains;
create trigger trg_letter_approval_chains_ua
  before update on public.letter_approval_chains
  for each row execute function public.set_updated_at();

-- ── 3. widen the step check ──────────────────────────────────────────────────
alter table public.letter_approval_steps
  drop constraint if exists sama_letter_approval_steps_step_check;
alter table public.letter_approval_steps
  add constraint sama_letter_approval_steps_step_check
  check (step >= 1 and step <= 10);

-- ── 4. template pinning + default sub-category ───────────────────────────────
alter table public.letter_templates
  add column if not exists pinned boolean not null default false,
  add column if not exists default_sub_category text null;
