-- 113_profile_avatar_url_and_avatars_bucket
--
-- Lets a user persist a custom uploaded profile photo. Previously "Upload Photo"
-- only set a base64 data URL in local React state, which was lost on reload
-- (there was nowhere to store it).
--
-- 1. profiles.avatar_url — the public Storage URL of the uploaded photo. NULL
--    means "render the DiceBear avatar derived from avatar_seed".
-- 2. A public `avatars` Storage bucket (image-only, 5 MB) + RLS: anyone may read
--    (avatars are public), authenticated users may manage objects ONLY inside
--    their own `{user_id}/` folder. Mirrors the existing public letter_signatures
--    bucket pattern.
-- Idempotent.

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
