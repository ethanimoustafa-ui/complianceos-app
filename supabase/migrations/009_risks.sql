-- 009_risks
-- risks (with officer workflow extension cols) + checklist + department_proposed_plan + history.
-- risk_history append-only enforcement in 012.

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text not null,
  category text not null check (category in ('operational','financial','compliance','strategic','reputational')),
  likelihood integer not null check (likelihood between 1 and 5),
  impact integer not null check (impact between 1 and 5),
  risk_score integer generated always as (likelihood * impact) stored,
  status text not null default 'identified' check (status in ('identified','mitigating','accepted','resolved')),
  owner_id uuid references public.profiles(id) on delete set null,
  mitigation_plan text,
  mitigation_progress integer not null default 0,
  monitoring_frequency text not null default 'quarterly',
  last_review_date date,
  next_review_date date,
  review_schedule jsonb,
  intended_department_id uuid references public.departments(id) on delete set null,
  mitigation_deadline date,
  mitigation_workflow_status text not null default 'not-started'
    check (mitigation_workflow_status in ('not-started','sent-to-department','plan-proposed','in-progress','resolved')),
  sent_to_department_at timestamptz,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_risks_status on public.risks(status) where deleted_at is null;
create index idx_risks_score on public.risks(risk_score desc) where deleted_at is null;
create index idx_risks_category on public.risks(category);
create index idx_risks_intended_department on public.risks(intended_department_id);
create index idx_risks_owner on public.risks(owner_id);
create index idx_risks_framework_ids on public.risks using gin(framework_ids);
create trigger trg_risks_ua before update on public.risks for each row execute function public.set_updated_at();

create table public.risk_mitigation_checklist (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  sort_order integer not null default 0
);
create index idx_risk_mitigation_checklist_risk on public.risk_mitigation_checklist(risk_id);

create table public.risk_department_proposed_plan (
  risk_id uuid primary key references public.risks(id) on delete cascade,
  plan text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now()
);

create table public.risk_history (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_value text, new_value text, notes text,
  created_at timestamptz not null default now()
);
create index idx_risk_history_risk on public.risk_history(risk_id, created_at desc);
