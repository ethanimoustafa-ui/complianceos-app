-- 013_compliance_scoring
-- compliance_scores_cache keyed by (framework_id, period_filter, department_id, inputs_hash).

create table public.compliance_scores_cache (
  id             uuid primary key default gen_random_uuid(),
  framework_id   text not null default 'overall',
  period_filter  text not null check (period_filter in ('3months','6months','12months','fiscal')),
  department_id  uuid references public.departments(id) on delete cascade,
  inputs_hash    text not null,
  overall        numeric not null,
  change_pct     numeric not null default 0,
  confidence     text not null,
  components     jsonb not null,
  deductions     jsonb not null default '[]'::jsonb,
  trend          jsonb not null default '[]'::jsonb,
  calculated_at  timestamptz not null default now(),
  expires_at     timestamptz not null,
  unique (framework_id, period_filter, department_id, inputs_hash)
);
create index idx_compliance_scores_lookup on public.compliance_scores_cache(framework_id, period_filter, department_id, calculated_at desc);
create index idx_compliance_scores_expires on public.compliance_scores_cache(expires_at);
