-- 025_storage_buckets
-- Creates 10 private storage buckets with MIME whitelists + size limits, and
-- attaches per-bucket RLS policies (authenticated SELECT/INSERT/DELETE scoped
-- by ownership). Pattern follows the existing `pdf-renders` bucket-scoped
-- policy form (see storage.objects policy `authenticated_read_pdfs`).
--
-- Buckets created:
--   audit_documents                  (50 MB, office+pdf+images)
--   observation_documents            (50 MB, office+pdf+images)
--   sama_letter_attachments          (50 MB, office+pdf+images)
--   policy_attachments               (20 MB, office+pdf+images)
--   policy_evidence                  (50 MB, office+pdf+images)
--   correspondence_attachments       (20 MB, office+pdf+images)
--   circular_remediation_attachments (20 MB, office+pdf+images)
--   circular_cap_attachments         (20 MB, office+pdf+images)
--   article_attachments              (20 MB, office+pdf+images)
--   reports                          (50 MB, pdf-only)
--
-- Per-bucket policies (3 each, 30 total added):
--   <bucket>_select  : authenticated, bucket-scoped + owner = auth.uid()
--   <bucket>_insert  : authenticated, bucket-scoped + owner = auth.uid()
--   <bucket>_delete  : authenticated, bucket-scoped + owner = auth.uid()
--
-- Idempotent: uses INSERT ... ON CONFLICT DO UPDATE on storage.buckets and
-- DROP POLICY IF EXISTS before each CREATE POLICY.

-- ---------------------------------------------------------------------------
-- 1. Create / upsert buckets
-- ---------------------------------------------------------------------------

-- Shared MIME set: PDFs, common images, Office formats, csv/txt.
-- The `reports` bucket is restricted to application/pdf only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audit_documents', 'audit_documents', false, 52428800,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('observation_documents', 'observation_documents', false, 52428800,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('sama_letter_attachments', 'sama_letter_attachments', false, 52428800,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('policy_attachments', 'policy_attachments', false, 20971520,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('policy_evidence', 'policy_evidence', false, 52428800,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('correspondence_attachments', 'correspondence_attachments', false, 20971520,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('circular_remediation_attachments', 'circular_remediation_attachments', false, 20971520,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('circular_cap_attachments', 'circular_cap_attachments', false, 20971520,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('article_attachments', 'article_attachments', false, 20971520,
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]),
  ('reports', 'reports', false, 52428800,
    array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Per-bucket RLS policies on storage.objects (3 per bucket, owner-scoped)
-- ---------------------------------------------------------------------------
-- Each block:
--   - DROP POLICY IF EXISTS to keep migration idempotent
--   - SELECT: authenticated user can read own files in that bucket
--   - INSERT: authenticated user must own the file they insert
--   - DELETE: authenticated user can only delete own files in that bucket
-- Pattern mirrors the existing `authenticated_read_pdfs` policy on the
-- `pdf-renders` bucket, but adds owner-scoping per supervisor spec.

-- audit_documents -----------------------------------------------------------
drop policy if exists "audit_documents_select" on storage.objects;
drop policy if exists "audit_documents_insert" on storage.objects;
drop policy if exists "audit_documents_delete" on storage.objects;
create policy "audit_documents_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'audit_documents' and owner = auth.uid());
create policy "audit_documents_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audit_documents' and auth.uid() is not null and owner = auth.uid());
create policy "audit_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audit_documents' and owner = auth.uid());

-- observation_documents -----------------------------------------------------
drop policy if exists "observation_documents_select" on storage.objects;
drop policy if exists "observation_documents_insert" on storage.objects;
drop policy if exists "observation_documents_delete" on storage.objects;
create policy "observation_documents_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'observation_documents' and owner = auth.uid());
create policy "observation_documents_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'observation_documents' and auth.uid() is not null and owner = auth.uid());
create policy "observation_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'observation_documents' and owner = auth.uid());

-- sama_letter_attachments ---------------------------------------------------
drop policy if exists "sama_letter_attachments_select" on storage.objects;
drop policy if exists "sama_letter_attachments_insert" on storage.objects;
drop policy if exists "sama_letter_attachments_delete" on storage.objects;
create policy "sama_letter_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'sama_letter_attachments' and owner = auth.uid());
create policy "sama_letter_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sama_letter_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "sama_letter_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sama_letter_attachments' and owner = auth.uid());

-- policy_attachments --------------------------------------------------------
drop policy if exists "policy_attachments_select" on storage.objects;
drop policy if exists "policy_attachments_insert" on storage.objects;
drop policy if exists "policy_attachments_delete" on storage.objects;
create policy "policy_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'policy_attachments' and owner = auth.uid());
create policy "policy_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'policy_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "policy_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'policy_attachments' and owner = auth.uid());

-- policy_evidence -----------------------------------------------------------
drop policy if exists "policy_evidence_select" on storage.objects;
drop policy if exists "policy_evidence_insert" on storage.objects;
drop policy if exists "policy_evidence_delete" on storage.objects;
create policy "policy_evidence_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'policy_evidence' and owner = auth.uid());
create policy "policy_evidence_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'policy_evidence' and auth.uid() is not null and owner = auth.uid());
create policy "policy_evidence_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'policy_evidence' and owner = auth.uid());

-- correspondence_attachments ------------------------------------------------
drop policy if exists "correspondence_attachments_select" on storage.objects;
drop policy if exists "correspondence_attachments_insert" on storage.objects;
drop policy if exists "correspondence_attachments_delete" on storage.objects;
create policy "correspondence_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'correspondence_attachments' and owner = auth.uid());
create policy "correspondence_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'correspondence_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "correspondence_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'correspondence_attachments' and owner = auth.uid());

-- circular_remediation_attachments ------------------------------------------
drop policy if exists "circular_remediation_attachments_select" on storage.objects;
drop policy if exists "circular_remediation_attachments_insert" on storage.objects;
drop policy if exists "circular_remediation_attachments_delete" on storage.objects;
create policy "circular_remediation_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'circular_remediation_attachments' and owner = auth.uid());
create policy "circular_remediation_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'circular_remediation_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "circular_remediation_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'circular_remediation_attachments' and owner = auth.uid());

-- circular_cap_attachments --------------------------------------------------
drop policy if exists "circular_cap_attachments_select" on storage.objects;
drop policy if exists "circular_cap_attachments_insert" on storage.objects;
drop policy if exists "circular_cap_attachments_delete" on storage.objects;
create policy "circular_cap_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'circular_cap_attachments' and owner = auth.uid());
create policy "circular_cap_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'circular_cap_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "circular_cap_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'circular_cap_attachments' and owner = auth.uid());

-- article_attachments -------------------------------------------------------
drop policy if exists "article_attachments_select" on storage.objects;
drop policy if exists "article_attachments_insert" on storage.objects;
drop policy if exists "article_attachments_delete" on storage.objects;
create policy "article_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'article_attachments' and owner = auth.uid());
create policy "article_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'article_attachments' and auth.uid() is not null and owner = auth.uid());
create policy "article_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'article_attachments' and owner = auth.uid());

-- reports -------------------------------------------------------------------
drop policy if exists "reports_select" on storage.objects;
drop policy if exists "reports_insert" on storage.objects;
drop policy if exists "reports_delete" on storage.objects;
create policy "reports_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and owner = auth.uid());
create policy "reports_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and auth.uid() is not null and owner = auth.uid());
create policy "reports_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. PostgREST schema cache reload (per HANDOFF §5 gotcha #5)
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
