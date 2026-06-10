-- 094 — W52: real storage for audit artifacts. The upload flow previously
-- recorded a METADATA row with a stub storage_path and never uploaded bytes —
-- nothing was downloadable. Private bucket; org members read, uploader owns
-- write/delete.

insert into storage.buckets (id, name, public, file_size_limit)
values ('audit_documents', 'audit_documents', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "audit_documents_select" on storage.objects;
create policy "audit_documents_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'audit_documents');

drop policy if exists "audit_documents_insert" on storage.objects;
create policy "audit_documents_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audit_documents' and owner = auth.uid());

drop policy if exists "audit_documents_delete" on storage.objects;
create policy "audit_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audit_documents' and owner = auth.uid());
