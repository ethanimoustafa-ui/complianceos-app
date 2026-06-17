-- 108_role_reshuffle
-- Reshuffle the role model to a clean, aligned 4-tier set: auditor / officer /
-- manager / admin. The DB role keys now MATCH the client role values (the app's
-- role-translation layer is removed in the same change set), and a dedicated
-- `manager` role is introduced as the escalation target for the email/escalation
-- engine.
--
-- Existing-data mapping:
--   compliance_officer -> officer   (today's "Manager" tier becomes the worker tier)
--   org_admin          -> admin
--   viewer             -> auditor   (viewer is retired)
--   auditor            -> auditor   (unchanged)
--   NEW: manager       = all 25 permissions (admin-level; hand-assigned)
--
-- Enforcement is unchanged: has_permission() (RLS) + role_permissions, and the
-- custom_access_token_hook derive from profiles.role, so they need no edits.

-- 1. Drop the role-value CHECK constraints so the new keys/values are accepted.
alter table public.roles    drop constraint if exists roles_key_check;
alter table public.profiles drop constraint if exists profiles_role_check;

-- 2. New role rows (auditor already exists; refresh its label).
insert into public.roles (key, name, description) values
  ('officer','Officer','Compliance officer — create, edit, comment, export.'),
  ('manager','Compliance Manager','Oversees officers; admin-level access; receives escalations.'),
  ('admin','Administrator','Full access.')
on conflict (key) do nothing;
update public.roles
  set name = 'Auditor', description = 'View, comment, and full observation access.'
  where key = 'auditor';

-- 3. role_permissions for the new roles.
--    officer = exactly today's compliance_officer set (copied, not hard-coded).
insert into public.role_permissions (role_key, permission_key)
  select 'officer', permission_key from public.role_permissions where role_key = 'compliance_officer'
on conflict do nothing;
--    manager + admin = all 25 permissions.
insert into public.role_permissions (role_key, permission_key)
  select 'manager', key from public.permissions
on conflict do nothing;
insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
on conflict do nothing;

-- 4. Repoint existing rows from old keys to new.
update public.profiles set role = case role
    when 'compliance_officer' then 'officer'
    when 'org_admin'          then 'admin'
    when 'viewer'             then 'auditor'
    else role end
  where role in ('compliance_officer','org_admin','viewer');

insert into public.user_roles (user_id, role_key, granted_by)
  select user_id,
    case role_key
      when 'compliance_officer' then 'officer'
      when 'org_admin'          then 'admin'
      when 'viewer'             then 'auditor' end,
    granted_by
  from public.user_roles
  where role_key in ('compliance_officer','org_admin','viewer')
on conflict (user_id, role_key) do nothing;
delete from public.user_roles where role_key in ('compliance_officer','org_admin','viewer');

-- 5. Drop the retired roles (cascades their role_permissions).
delete from public.roles where key in ('compliance_officer','org_admin','viewer');

-- 6. Re-add CHECK constraints with the new set.
alter table public.roles
  add constraint roles_key_check check (key in ('auditor','officer','manager','admin'));
alter table public.profiles
  add constraint profiles_role_check check (role in ('auditor','officer','manager','admin'));

-- 7. handle_new_user: validate against the new set, default to 'auditor'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  derived_name text;
  derived_role text;
begin
  derived_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  derived_role := coalesce(new.raw_app_meta_data->>'role', 'auditor');
  if derived_role not in ('auditor','officer','manager','admin') then
    derived_role := 'auditor';
  end if;
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, derived_name, derived_role)
  on conflict (id) do nothing;
  return new;
end;
$$;
