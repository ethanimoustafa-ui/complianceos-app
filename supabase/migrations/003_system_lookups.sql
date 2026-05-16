-- 003_system_lookups
-- Small reference tables the rest of the schema FKs into.

-- ---- departments --------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index idx_departments_is_default on public.departments(is_default) where deleted_at is null;

-- Add the FK from profiles.department_id deferred from 002
alter table public.profiles
  add constraint profiles_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete set null;

-- ---- business_units -----------------------------------------------------
create table public.business_units (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_business_units_is_default on public.business_units(is_default);

-- ---- onboarding_regions / industries / headcount_buckets ----------------
create table public.onboarding_regions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.onboarding_industries (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.onboarding_headcount_buckets (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- authority_departments (used by frameworks/letters/circulars) -------
create table public.authority_departments (
  id            uuid primary key default gen_random_uuid(),
  authority_id  text not null,                   -- references frameworks.id (created in 004); validated app-side
  name_en       text not null,
  name_ar       text not null,
  email         text,
  is_seed       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_authority_departments_authority on public.authority_departments(authority_id);

-- ---- category lookups ---------------------------------------------------
create table public.policy_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.audit_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.risk_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  color       text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.training_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.calendar_event_types (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.correspondence_types (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.letter_types (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- framework_sub_categories (per-framework) ---------------------------
create table public.framework_sub_categories (
  id            uuid primary key default gen_random_uuid(),
  framework_id  text not null,                  -- FK to frameworks(id) added in 004
  key           text not null,
  name_en       text not null,
  name_ar       text not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (framework_id, key)
);
create index idx_framework_sub_categories_framework on public.framework_sub_categories(framework_id);

-- ---- scale_label_overrides ---------------------------------------------
create table public.scale_label_overrides (
  scale text not null,
  key   text not null,
  lang  char(2) not null check (lang in ('en','ar')),
  value text not null,
  primary key (scale, key, lang)
);

-- updated_at triggers
create trigger trg_departments_ua             before update on public.departments             for each row execute function public.set_updated_at();
create trigger trg_business_units_ua          before update on public.business_units          for each row execute function public.set_updated_at();
create trigger trg_onboarding_regions_ua      before update on public.onboarding_regions      for each row execute function public.set_updated_at();
create trigger trg_onboarding_industries_ua   before update on public.onboarding_industries   for each row execute function public.set_updated_at();
create trigger trg_onboarding_headcount_ua    before update on public.onboarding_headcount_buckets for each row execute function public.set_updated_at();
create trigger trg_authority_departments_ua   before update on public.authority_departments   for each row execute function public.set_updated_at();
create trigger trg_policy_categories_ua       before update on public.policy_categories       for each row execute function public.set_updated_at();
create trigger trg_audit_categories_ua        before update on public.audit_categories        for each row execute function public.set_updated_at();
create trigger trg_risk_categories_ua         before update on public.risk_categories         for each row execute function public.set_updated_at();
create trigger trg_training_categories_ua     before update on public.training_categories     for each row execute function public.set_updated_at();
create trigger trg_calendar_event_types_ua    before update on public.calendar_event_types    for each row execute function public.set_updated_at();
create trigger trg_correspondence_types_ua    before update on public.correspondence_types    for each row execute function public.set_updated_at();
create trigger trg_letter_types_ua            before update on public.letter_types            for each row execute function public.set_updated_at();
create trigger trg_framework_sub_categories_ua before update on public.framework_sub_categories for each row execute function public.set_updated_at();
