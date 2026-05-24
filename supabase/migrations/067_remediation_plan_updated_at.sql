-- Wave-24 W24-6a — add `updated_at` column and auto-update trigger to
-- `remediation_plans` so the PATCH route can use the own row token for
-- optimistic-concurrency (If-Match / ETag) instead of proxying through the
-- parent observation's `updated_at`.

alter table public.remediation_plans
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.remediation_plans;
create trigger set_updated_at
  before update on public.remediation_plans
  for each row execute function public.set_updated_at();
