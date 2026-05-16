-- 007_policies_circulars
-- Policies + workflow + versions + templates + evidence + attachments + review cycles.
-- Circulars + articles + checklist/attachments/versions/timeline + workflow + pending edits
--   + CAP/remediation attachments.
-- Append-only timelines (policy_activity_log, circular_timeline, article_timeline)
-- have their UPDATE/DELETE locked down in migration 012 + 016.

-- =================== POLICIES ===================
create table public.policies (
  id                          uuid primary key default gen_random_uuid(),
  ref_code                    text not null unique,
  name                        text not null,
  description                 text not null,
  status                      text not null default 'draft' check (status in (
                                'draft','under-review','approved','expired','overdue','requires-review'
                              )),
  category                    text not null check (category in ('compliance','it','operations','risk','hr','finance')),
  version                     text not null default 'v1.0',
  approval_tier               text not null check (approval_tier in ('board','management','sharia','agm')),
  owner_id                    uuid references public.profiles(id) on delete set null,
  owner_name                  text,
  owner_department            text,
  business_owner_department_id uuid references public.departments(id) on delete set null,
  last_review_date            date,
  next_review_date            date,
  review_cycle_days           integer not null default 365,
  approved_date               date,
  overdue_count               integer not null default 0,
  last_overdue_date           date,
  current_review_cycle_id     text,
  current_review_cycle_label  text,
  current_review_cycle_date   timestamptz,
  review_schedule             jsonb,
  framework_ids               text[] not null default '{}',
  affected_departments        text[] not null default '{}',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);
create index idx_policies_status on public.policies(status) where deleted_at is null;
create index idx_policies_next_review on public.policies(next_review_date) where deleted_at is null;
create index idx_policies_business_owner on public.policies(business_owner_department_id);
create index idx_policies_category on public.policies(category);
create index idx_policies_approval_tier on public.policies(approval_tier);
create index idx_policies_framework_ids on public.policies using gin(framework_ids);
create index idx_policies_affected_departments on public.policies using gin(affected_departments);
create trigger trg_policies_ua before update on public.policies for each row execute function public.set_updated_at();

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version text not null, date date not null, author text not null, changes text not null
);
create index idx_policy_versions_policy on public.policy_versions(policy_id, date desc);

create table public.policy_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  step text not null, date date, user_name text,
  status text not null check (status in ('completed','current','pending')),
  description text, action_type text, note text,
  step_state text check (step_state in ('pending-approval','awaiting-response','awaiting-manager')),
  sort_order integer not null default 0
);
create index idx_policy_workflow_steps_policy on public.policy_workflow_steps(policy_id, sort_order);

create table public.policy_activity_log (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  timestamp timestamptz not null default now(),
  date date not null,
  type text not null,
  text_en text not null, text_ar text not null,
  user_name text, note text
);
create index idx_policy_activity_log_policy on public.policy_activity_log(policy_id, timestamp desc);

create table public.policy_attachments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  name text not null, storage_path text not null, size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_policy_attachments_policy on public.policy_attachments(policy_id);

create table public.policy_evidence (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  name text not null, storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null,
  review_cycle_id text not null, review_cycle_label text not null,
  notes text
);
create index idx_policy_evidence_policy on public.policy_evidence(policy_id, review_cycle_id);

create table public.policy_review_cycles (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  label text not null,
  initiated_at timestamptz not null default now()
);
create index idx_policy_review_cycles_policy on public.policy_review_cycles(policy_id, initiated_at desc);

create table public.policy_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_ar text,
  category text not null, approval_tier text not null,
  frequency text, frequency_schedule jsonb,
  default_description text not null, default_description_ar text,
  default_workflow_steps jsonb not null default '[]'::jsonb,
  version_pattern text not null default 'v{major}.{minor}',
  framework text, status text not null default 'active',
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_policy_templates_category on public.policy_templates(category);
create index idx_policy_templates_framework on public.policy_templates(framework);
create index idx_policy_templates_status on public.policy_templates(status);
create trigger trg_policy_templates_ua before update on public.policy_templates for each row execute function public.set_updated_at();

-- =================== CIRCULARS ===================
create table public.circulars (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  authority text not null check (authority in ('sama','cma','ia','zatca','misa','safiu')),
  title text not null,
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  status text not null default 'pending' check (status in ('pending','in-progress','completed','overdue')),
  applicability text not null default 'pending' check (applicability in ('applicable','not-applicable','pending')),
  departments text[] not null default '{}',
  business_owner_department text,
  business_owner_department_id uuid references public.departments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  progress integer not null default 0,
  issuance_date date not null, due_date date not null,
  cap_status text not null default 'not-started',
  cap_due_date date, cap_deadline date, cap_response_deadline date,
  remediation_deadline date,
  description text, pdf_url text, reference_url text,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_circulars_authority_status on public.circulars(authority, status) where deleted_at is null;
create index idx_circulars_due on public.circulars(due_date) where deleted_at is null;
create index idx_circulars_status_due on public.circulars(status, due_date) where deleted_at is null;
create index idx_circulars_assigned_to on public.circulars(assigned_to);
create index idx_circulars_framework_ids on public.circulars using gin(framework_ids);
create index idx_circulars_departments on public.circulars using gin(departments);
create trigger trg_circulars_ua before update on public.circulars for each row execute function public.set_updated_at();

create table public.circular_articles (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  article_number text not null,
  title text not null, description text,
  risk_level text not null default 'medium',
  responsible_department text,
  compliance_status text not null default 'not-started',
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text, sort_order integer not null default 0
);
create index idx_circular_articles_circular on public.circular_articles(circular_id);

create table public.article_checklist_items (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.circular_articles(id) on delete cascade,
  text text not null, completed boolean not null default false,
  sort_order integer not null default 0
);
create index idx_article_checklist_article on public.article_checklist_items(article_id);

create table public.article_attachments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.circular_articles(id) on delete cascade,
  name text not null, storage_path text not null, size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_article_attachments_article on public.article_attachments(article_id);

create table public.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.circular_articles(id) on delete cascade,
  version_no integer not null, date date not null,
  author text not null, changes text not null
);
create index idx_article_versions_article on public.article_versions(article_id, version_no desc);

create table public.article_timeline (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.circular_articles(id) on delete cascade,
  title text not null,
  date timestamptz not null default now(),
  user_name text,
  status text not null default 'pending'
);
create index idx_article_timeline_article on public.article_timeline(article_id, date desc);

create table public.circular_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  phase integer not null check (phase in (0,1,2)),
  label text not null, label_ar text not null,
  status text not null default 'pending',
  date date, user_name text, notes text,
  action_label text not null, action_label_ar text not null,
  requires_notes boolean not null default false,
  action_type text not null,
  sort_order integer not null default 0
);
create index idx_circular_workflow_circular on public.circular_workflow_steps(circular_id, sort_order);

create table public.circular_timeline (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  title text not null, title_ar text,
  date timestamptz not null default now(),
  user_name text,
  status text not null default 'pending'
);
create index idx_circular_timeline_circular on public.circular_timeline(circular_id, date desc);

create table public.circular_versions (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  version integer not null, date date not null,
  author text not null, changes text not null,
  field_changes jsonb not null default '{}'::jsonb,
  approved boolean not null default false
);
create index idx_circular_versions_circular on public.circular_versions(circular_id, version desc);

create table public.circular_pending_edits (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  data jsonb not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending',
  field_changes jsonb not null default '{}'::jsonb,
  approvals jsonb not null default '[]'::jsonb
);
create index idx_circular_pending_edits_circular on public.circular_pending_edits(circular_id);

create table public.circular_cap_attachments (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  name text not null, storage_path text not null, type text, size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_circular_cap_attachments_circular on public.circular_cap_attachments(circular_id);

create table public.circular_remediation_attachments (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  name text not null, storage_path text not null, type text, size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_circular_remediation_attachments_circular on public.circular_remediation_attachments(circular_id);
