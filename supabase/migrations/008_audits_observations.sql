-- 008_audits_observations
-- Audits + tasks + team + comments + documents + per-audit activity log + templates.
-- Observations + assignees + team + checklist + updates + documents + timeline
--   + remediation_plans + closure_requests + closure_reviews.
-- Append-only enforcement (audit_activity_logs, observation_timeline) in 012.

-- =================== AUDITS ===================
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('internal','sama','sharia')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','overdue')),
  due_date date not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  progress integer not null default 0 check (progress between 0 and 100),
  description text, category text, frequency text,
  priority text not null default 'medium',
  closed_overdue boolean not null default false,
  completed_at timestamptz,
  review_schedule jsonb,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_audits_status_due on public.audits(status, due_date) where deleted_at is null;
create index idx_audits_assignee on public.audits(assignee_id);
create index idx_audits_type on public.audits(type) where deleted_at is null;
create index idx_audits_category on public.audits(category);
create index idx_audits_framework_ids on public.audits using gin(framework_ids);
create trigger trg_audits_ua before update on public.audits for each row execute function public.set_updated_at();

create table public.audit_documents (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  name text not null,
  type text not null check (type in ('pdf','image','doc')),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_audit_documents_audit on public.audit_documents(audit_id);

create table public.audit_team_members (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  is_owner boolean not null default false,
  added_at timestamptz not null default now(),
  unique (audit_id, user_id)
);
create index idx_audit_team_audit on public.audit_team_members(audit_id);

create table public.audit_comments (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_audit_comments_audit on public.audit_comments(audit_id, created_at desc);
create trigger trg_audit_comments_ua before update on public.audit_comments for each row execute function public.set_updated_at();

create table public.audit_tasks (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  title text not null, description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','overdue')),
  priority text not null default 'medium',
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  severity text,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_audit_tasks_audit on public.audit_tasks(audit_id);
create index idx_audit_tasks_assignee_due on public.audit_tasks(assignee_id, due_date);
create index idx_audit_tasks_status on public.audit_tasks(status) where deleted_at is null;
create trigger trg_audit_tasks_ua before update on public.audit_tasks for each row execute function public.set_updated_at();

create table public.audit_activity_logs (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  action text not null, description text,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_activity_logs_audit on public.audit_activity_logs(audit_id, created_at desc);

create table public.audit_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_ar text,
  audit_type text not null check (audit_type in ('internal','sama','sharia')),
  category text not null,
  priority text not null default 'medium',
  frequency text not null default 'annual',
  frequency_schedule jsonb,
  default_title text not null, default_title_ar text,
  default_description text not null, default_description_ar text,
  default_checklist_items text[] not null default '{}',
  default_team_roles text[] not null default '{}',
  framework text, status text not null default 'active',
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_audit_templates_category on public.audit_templates(category);
create index idx_audit_templates_framework on public.audit_templates(framework);
create index idx_audit_templates_status on public.audit_templates(status);
create trigger trg_audit_templates_ua before update on public.audit_templates for each row execute function public.set_updated_at();

-- =================== OBSERVATIONS ===================
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  title text not null, sub_title text,
  description text not null,
  source text not null check (source in ('sama','internal','sharia')),
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  due_date date not null,
  remediation_submission_due date,
  department text,
  reference text not null unique,
  progress integer not null default 0,
  creator_id uuid references public.profiles(id) on delete set null,
  leader_id uuid references public.profiles(id) on delete set null,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_observations_status_due on public.observations(status, due_date) where deleted_at is null;
create index idx_observations_severity on public.observations(severity);
create index idx_observations_source on public.observations(source);
create index idx_observations_leader on public.observations(leader_id);
create index idx_observations_creator on public.observations(creator_id);
create index idx_observations_department on public.observations(department);
create index idx_observations_framework_ids on public.observations using gin(framework_ids);
create trigger trg_observations_ua before update on public.observations for each row execute function public.set_updated_at();

-- Back-fill FK from sama_letter_observations (created earlier without observations table)
alter table public.sama_letter_observations
  add constraint sama_letter_observations_observation_fkey
  foreign key (observation_id) references public.observations(id) on delete cascade;

create table public.observation_assignees (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null, role text,
  unique (observation_id, user_id)
);
create index idx_observation_assignees_observation on public.observation_assignees(observation_id);

create table public.observation_team (
  observation_id uuid not null references public.observations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  added_at timestamptz not null default now(),
  primary key (observation_id, user_id)
);

create table public.observation_checklist (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  text text not null, completed boolean not null default false,
  sort_order integer not null default 0
);
create index idx_observation_checklist_observation on public.observation_checklist(observation_id);

create table public.observation_updates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  is_edited boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_observation_updates_observation on public.observation_updates(observation_id, created_at desc);

create table public.observation_documents (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('pdf','image','doc')),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_observation_documents_observation on public.observation_documents(observation_id);

create table public.observation_timeline (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  date timestamptz not null default now(),
  description text not null, description_ar text,
  action_type text,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb
);
create index idx_observation_timeline_observation on public.observation_timeline(observation_id, date desc);

create table public.remediation_plans (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations(id) on delete cascade,
  title text not null, description text not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now()
);
create index idx_remediation_plans_observation on public.remediation_plans(observation_id);

create table public.closure_requests (
  observation_id uuid primary key references public.observations(id) on delete cascade,
  requested_at timestamptz not null default now(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  notes text
);

create table public.closure_reviews (
  observation_id uuid primary key references public.observations(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid not null references public.profiles(id) on delete cascade,
  approved boolean not null,
  notes text
);
