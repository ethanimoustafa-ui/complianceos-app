-- 011_calendar_messages_notifications
-- calendar_events, message_threads + participants + messages, notifications, reports,
-- user_activity_logs (append-only), help_articles + user_help_views, compliance_evaluations.

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('deadline','meeting','submission','review')),
  date date not null,
  start_time time, end_time time,
  attendees text[] not null default '{}',
  related_entity_id uuid,
  related_entity_type text,
  reminders jsonb not null default '[]'::jsonb,
  description text, location text,
  completed boolean not null default false,
  completed_at timestamptz,
  agency text, severity text,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_calendar_events_date on public.calendar_events(date) where deleted_at is null;
create index idx_calendar_events_related on public.calendar_events(related_entity_id, related_entity_type);
create index idx_calendar_events_framework_ids on public.calendar_events using gin(framework_ids);
create index idx_calendar_events_attendees on public.calendar_events using gin(attendees);
create trigger trg_calendar_events_ua before update on public.calendar_events for each row execute function public.set_updated_at();

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  subject text,
  is_group boolean not null default false,
  avatar_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_message_threads_last_message on public.message_threads(last_message_at desc);
create trigger trg_message_threads_ua before update on public.message_threads for each row execute function public.set_updated_at();

create table public.message_thread_participants (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  unread_count integer not null default 0,
  primary key (thread_id, user_id)
);
create index idx_message_participants_user on public.message_thread_participants(user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_messages_thread on public.messages(thread_id, created_at);
create index idx_messages_sender on public.messages(sender_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, message text not null,
  type text not null default 'info' check (type in ('info','warning','success','error')),
  source_type text, route text,
  entity_id uuid,
  dedupe_key text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_unread on public.notifications(user_id, created_at desc) where read = false;
create unique index idx_notifications_user_dedupe on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('compliance','audit','risk','observation','sama','custom')),
  format text not null default 'pdf' check (format in ('pdf','excel','word','csv')),
  period text not null default 'monthly',
  status text not null default 'draft' check (status in ('draft','generating','ready','scheduled')),
  generated_at timestamptz,
  scheduled_for timestamptz,
  recipients text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb,
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_reports_status on public.reports(status) where deleted_at is null;
create index idx_reports_scheduled_for on public.reports(scheduled_for) where deleted_at is null;
create index idx_reports_type on public.reports(type);
create index idx_reports_created_at on public.reports(created_at desc);
create trigger trg_reports_ua before update on public.reports for each row execute function public.set_updated_at();

create table public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null,
  action text not null,
  module text not null,
  details text, ip_address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_user_activity_logs_user on public.user_activity_logs(user_id, created_at desc);
create index idx_user_activity_logs_action on public.user_activity_logs(action, created_at desc);
create index idx_user_activity_logs_module on public.user_activity_logs(module, created_at desc);

create table public.help_articles (
  id text primary key,
  title text not null,
  summary text,
  category text not null,
  content text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_help_articles_category on public.help_articles(category);
create trigger trg_help_articles_ua before update on public.help_articles for each row execute function public.set_updated_at();

create table public.user_help_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  article_id text not null references public.help_articles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index idx_user_help_views_user on public.user_help_views(user_id, viewed_at desc);

create table public.compliance_evaluations (
  id text primary key,
  kind text not null check (kind in ('rule','policy')),
  item_id uuid not null,
  department_id uuid not null references public.departments(id) on delete cascade,
  verdict text not null check (verdict in ('compliant','non-compliant','na','unknown')),
  notes text,
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_compliance_evaluations_item on public.compliance_evaluations(kind, item_id);
create index idx_compliance_evaluations_department on public.compliance_evaluations(department_id);
create trigger trg_compliance_evaluations_ua before update on public.compliance_evaluations for each row execute function public.set_updated_at();
