-- 004_organization_config
-- compliance_settings (singleton), frameworks, framework_pins, framework_config.

create table public.compliance_settings (
  id                       uuid primary key default gen_random_uuid(),
  weights                  jsonb not null default '{"auditCompletion":25,"observationClosure":25,"riskPosture":20,"policyCurrency":15,"trainingCompletion":15}'::jsonb,
  target_score             integer not null default 85,
  audit_retention_years    integer not null default 7,
  singleton                boolean not null default true unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_compliance_settings_ua before update on public.compliance_settings for each row execute function public.set_updated_at();

create table public.frameworks (
  id                       text primary key,
  name_en                  text not null,
  name_ar                  text,
  description_en           text,
  description_ar           text,
  icon                     text,
  icon_color               text,
  enabled                  boolean not null default true,
  threshold                text not null default 'standard',
  custom_threshold_value   integer,
  alert_on_non_compliance  boolean not null default true,
  correspondence_based     boolean not null default false,
  weights                  jsonb not null default '{"audits":15,"observations":15,"letters":10,"policies":15,"circulars":15,"riskPosture":15,"training":15}'::jsonb,
  custom_field_values      jsonb not null default '{}'::jsonb,
  departments              text[] not null default '{}',
  scale_labels             jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_frameworks_enabled on public.frameworks(enabled);
create index idx_frameworks_correspondence_based on public.frameworks(correspondence_based);
create trigger trg_frameworks_ua before update on public.frameworks for each row execute function public.set_updated_at();

create table public.framework_pins (
  framework_id text primary key references public.frameworks(id) on delete cascade,
  position     integer not null check (position between 1 and 3),
  unique (position)
);

create table public.framework_config (
  framework_id   text primary key references public.frameworks(id) on delete cascade,
  enabled        boolean not null default true,
  pinned         boolean not null default false,
  weight         integer not null default 50 check (weight between 0 and 100),
  threshold      integer not null default 80 check (threshold between 0 and 100),
  department_id  uuid references public.departments(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_framework_config_ua before update on public.framework_config for each row execute function public.set_updated_at();

alter table public.framework_sub_categories
  add constraint framework_sub_categories_framework_fkey
  foreign key (framework_id) references public.frameworks(id) on delete cascade;
