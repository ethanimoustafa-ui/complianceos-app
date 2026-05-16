-- 002_auth_and_rbac
-- profiles, roles, permissions, role_permissions, user_roles, user_permissions
-- plus auth.has_permission() SECURITY DEFINER helper for RLS.

-- ---- profiles -----------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  name                  text not null,
  role                  text not null default 'viewer'
                          check (role in ('viewer','auditor','compliance_officer','org_admin')),
  department_id         uuid,                            -- FK added in 003
  phone                 text,
  avatar_seed           text,
  workload              integer default 0 check (workload between 0 and 100),
  nationality           text,
  status                text not null default 'active'
                          check (status in ('active','inactive','pending')),
  joined_at             timestamptz default now(),
  invited_by            uuid references public.profiles(id) on delete set null,
  burnout_since         timestamptz,
  last_login            timestamptz,
  preferred_language    char(2) not null default 'en' check (preferred_language in ('en','ar')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index idx_profiles_role on public.profiles(role) where deleted_at is null;
create index idx_profiles_department on public.profiles(department_id) where deleted_at is null;
create index idx_profiles_status on public.profiles(status) where deleted_at is null;

-- ---- user_preferences ---------------------------------------------------
create table public.user_preferences (
  user_id                   uuid primary key references public.profiles(id) on delete cascade,
  dashboard_view            text not null default 'executive',
  timezone                  text not null default 'Asia/Riyadh',
  date_format               text not null default 'DD/MM/YYYY',
  notification_preferences  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---- roles --------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique
                check (key in ('viewer','auditor','compliance_officer','org_admin')),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- permissions --------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- role_permissions (lookup) ------------------------------------------
create table public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create index idx_role_permissions_perm on public.role_permissions(permission_key);

-- ---- user_roles (many-to-many; in addition to profile.role single-role) --
create table public.user_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_key    text not null references public.roles(key) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles(id) on delete set null,
  primary key (user_id, role_key)
);

create index idx_user_roles_role on public.user_roles(role_key);

-- ---- user_permissions (per-user overrides) ------------------------------
create table public.user_permissions (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted        boolean not null default true,
  granted_at     timestamptz not null default now(),
  granted_by     uuid references public.profiles(id) on delete set null,
  primary key (user_id, permission_key)
);

-- ---- team_member_assignments --------------------------------------------
create table public.team_member_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  due_date    date,
  progress    integer default 0 check (progress between 0 and 100),
  created_at  timestamptz not null default now()
);

create index idx_team_assignments_user on public.team_member_assignments(user_id);
create index idx_team_assignments_due on public.team_member_assignments(due_date);

-- ---- team_member_access_controls ----------------------------------------
create table public.team_member_access_controls (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  label     text not null,
  enabled   boolean not null default false,
  unique (user_id, label)
);

create index idx_team_access_user on public.team_member_access_controls(user_id);

-- ---- auth.has_permission() helper ---------------------------------------
-- Returns true if the calling auth.uid() has the permission via:
--   (a) explicit row in user_permissions (granted = true), OR
--   (b) any of their assigned roles in user_roles grants it in role_permissions, OR
--   (c) their primary role on profiles grants it.
-- NB: function lives in public schema (Supabase forbids creating functions in auth).
-- Callers should use public.has_permission('xxx').
create or replace function public.has_permission(perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission_key = perm_key
        and up.granted = true
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
        and rp.permission_key = perm_key
    )
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_key = p.role
      where p.id = auth.uid()
        and rp.permission_key = perm_key
    )
  ), false);
$$;

grant execute on function public.has_permission(text) to authenticated, anon;

-- updated_at triggers
create trigger trg_profiles_updated_at         before update on public.profiles         for each row execute function public.set_updated_at();
create trigger trg_user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
create trigger trg_roles_updated_at            before update on public.roles            for each row execute function public.set_updated_at();
create trigger trg_permissions_updated_at      before update on public.permissions      for each row execute function public.set_updated_at();
