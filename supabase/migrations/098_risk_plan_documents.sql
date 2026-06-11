-- 098_risk_plan_documents
--
-- Attachments for the department-submitted ("received") mitigation plan. The
-- department sends a document or outline; the officer records it and attaches
-- the file. Mirrors the audit_documents storage pattern (migration 094):
-- a private bucket for the bytes + a metadata table pointing at the path.

-- ---- storage bucket -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('risk_plan_documents', 'risk_plan_documents', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "risk_plan_documents_select" on storage.objects;
create policy "risk_plan_documents_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'risk_plan_documents');

drop policy if exists "risk_plan_documents_insert" on storage.objects;
create policy "risk_plan_documents_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'risk_plan_documents' and owner = auth.uid());

drop policy if exists "risk_plan_documents_delete" on storage.objects;
create policy "risk_plan_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'risk_plan_documents' and owner = auth.uid());

-- ---- metadata table -------------------------------------------------------
create table if not exists public.risk_plan_documents (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  name text not null,
  type text not null default 'doc',
  storage_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_risk_plan_documents_risk on public.risk_plan_documents(risk_id);

alter table public.risk_plan_documents enable row level security;

drop policy if exists risk_plan_documents_select on public.risk_plan_documents;
create policy risk_plan_documents_select on public.risk_plan_documents
  for select to authenticated using (true);

drop policy if exists risk_plan_documents_modify on public.risk_plan_documents;
create policy risk_plan_documents_modify on public.risk_plan_documents
  for all to authenticated
  using (public.has_permission('edit')) with check (public.has_permission('edit'));

notify pgrst, 'reload schema';
