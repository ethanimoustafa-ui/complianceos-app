-- 038_has_permission_jwt_fallback
--
-- Make `has_permission(text)` consult the JWT's `app_metadata.permissions[]`
-- claim in addition to the three DB-lookup paths. The custom access token
-- hook (migration 028) already injects the user's effective permissions into
-- the JWT on every token mint; this lets RLS policies trust those claims so
-- soft-delete UPDATEs etc. don't fail mysteriously when the DB-lookup races
-- a recently-revoked role or when the route handler's supabase client is
-- evaluating policies in a slightly different transactional context.
--
-- The fallback is OR'd into the existing 3-source check; nothing else changes.

create or replace function public.has_permission(perm_key text)
returns boolean
language sql
stable security definer
set search_path = public, auth
as $$
  select coalesce((
    -- 1) per-user grant
    select exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission_key = perm_key
        and up.granted = true
    )
    -- 2) user_roles → role_permissions
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
        and rp.permission_key = perm_key
    )
    -- 3) profiles.role → role_permissions
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_key = p.role
      where p.id = auth.uid()
        and rp.permission_key = perm_key
    )
    -- 4) JWT app_metadata.permissions[] (injected by custom_access_token_hook)
    or coalesce(
      (auth.jwt() -> 'app_metadata' -> 'permissions') @> to_jsonb(perm_key),
      false
    )
  ), false);
$$;

notify pgrst, 'reload schema';
