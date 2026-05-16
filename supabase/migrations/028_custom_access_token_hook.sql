-- 028_custom_access_token_hook
--
-- Supabase Custom Access Token Hook: injects the user's profile.role and the
-- effective permission keys into the JWT under `app_metadata.role` and
-- `app_metadata.permissions[]`. Mirrors public.has_permission() resolution
-- order:
--   (a) user_permissions (granted = true)
--   (b) user_roles -> role_permissions
--   (c) profiles.role -> role_permissions
--   minus user_permissions where granted = false
--
-- This kills the 20-24x duplicate `profiles`, `user_roles`, `role_permissions`
-- queries observed in Phase 9 logs: the Next.js requireUser() reads claims
-- first and only falls back to the 3 queries when claims are missing (first
-- session after enabling the hook, or hook disabled).
--
-- Activation (manual, after deploying this migration):
--   Studio -> Auth -> Hooks -> "Custom Access Token Hook"
--     -> select `public.custom_access_token_hook` -> Save.
-- Existing sessions need to refresh (Auth -> Sign out users, or wait for the
-- next token rotation) before their access tokens carry the new claims.
--
-- Idempotent.
--
-- Author: Agent P — Performance pack (2026-05-16)

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_role      text;
  v_perms     text[];
  v_claims    jsonb;
  v_app_meta  jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  -- profile.role (single source of truth for the user's primary role)
  select p.role into v_role from public.profiles p where p.id = v_user_id;

  -- Effective permissions resolution mirrors has_permission():
  --   role_permissions for (profile.role + any user_roles)
  --   plus user_permissions where granted = true
  --   minus user_permissions where granted = false
  with role_keys as (
    select v_role as role_key where v_role is not null
    union
    select ur.role_key from public.user_roles ur where ur.user_id = v_user_id
  ),
  role_perms as (
    select distinct rp.permission_key
    from public.role_permissions rp
    join role_keys rk on rk.role_key = rp.role_key
  ),
  grants as (
    select up.permission_key
    from public.user_permissions up
    where up.user_id = v_user_id and up.granted = true
  ),
  revokes as (
    select up.permission_key
    from public.user_permissions up
    where up.user_id = v_user_id and up.granted = false
  ),
  effective as (
    select permission_key from role_perms
    union
    select permission_key from grants
    except
    select permission_key from revokes
  )
  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
    into v_perms
    from effective;

  v_app_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
              || jsonb_build_object(
                   'role',        v_role,
                   'permissions', to_jsonb(v_perms)
                 );

  v_claims := v_claims || jsonb_build_object('app_metadata', v_app_meta);

  return jsonb_build_object('claims', v_claims);
end;
$$;

-- Lock the function down per Supabase's auth-hooks contract: only the GoTrue
-- service role (`supabase_auth_admin`) may call it, and the GoTrue role needs
-- read access to the source tables.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant  execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;
grant select on
  public.profiles,
  public.user_roles,
  public.user_permissions,
  public.role_permissions
to supabase_auth_admin;

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Custom Access Token Hook. Injects profiles.role + effective permission_keys[] into JWT app_metadata. Enable in Studio -> Auth -> Hooks -> Custom Access Token Hook.';

notify pgrst, 'reload schema';
