-- 092 — W49: user-extendable audit-task categories, scoped per correspondence
-- authority. The seeded category sets per authority live client-side
-- (bilingual code map); this table holds USER-ADDED categories only, keyed by
-- authority so additions never bleed across frameworks.

create table if not exists public.audit_task_categories (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  key text not null,
  label_en text not null,
  label_ar text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (authority, key)
);

alter table public.audit_task_categories enable row level security;

drop policy if exists audit_task_categories_select on public.audit_task_categories;
create policy audit_task_categories_select
  on public.audit_task_categories for select
  to authenticated using (true);

drop policy if exists audit_task_categories_write on public.audit_task_categories;
create policy audit_task_categories_write
  on public.audit_task_categories for all
  to authenticated
  using (public.has_permission('edit'))
  with check (public.has_permission('edit'));

drop trigger if exists trg_audit_task_categories_ua on public.audit_task_categories;
create trigger trg_audit_task_categories_ua
  before update on public.audit_task_categories
  for each row execute function public.set_updated_at();
