-- 006_correspondence_generic
-- General correspondence registry + advisory requests/notes.

create table public.correspondence (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  subject     text not null,
  from_party  text not null,
  to_parties  text[] not null default '{}',
  date        timestamptz not null,
  type        text not null,
  status      text not null default 'draft' check (status in ('draft','sent','received')),
  body        text,
  thread_id   text,
  archived    boolean not null default false,
  assignee_id uuid references public.profiles(id) on delete set null,
  framework_ids text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index idx_correspondence_date on public.correspondence(date desc) where deleted_at is null;
create index idx_correspondence_status_type on public.correspondence(status, type) where deleted_at is null;
create index idx_correspondence_thread on public.correspondence(thread_id);
create index idx_correspondence_assignee on public.correspondence(assignee_id);
create trigger trg_correspondence_ua before update on public.correspondence for each row execute function public.set_updated_at();

create table public.correspondence_attachments (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondence(id) on delete cascade,
  name              text not null,
  storage_path      text not null,
  type              text,
  size              bigint,
  uploaded_at       timestamptz not null default now(),
  uploaded_by       uuid references public.profiles(id) on delete set null
);
create index idx_correspondence_attachments_correspondence on public.correspondence_attachments(correspondence_id);

create table public.advisory_requests (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,
  subject         text not null,
  description     text not null,
  business_unit   text not null,
  status          text not null default 'pending' check (status in ('pending','in_progress','completed')),
  priority        text not null default 'medium' check (priority in ('low','medium','high')),
  requested_by    text not null,
  requested_date  date not null,
  assigned_to     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_advisory_requests_status_priority on public.advisory_requests(status, priority) where deleted_at is null;
create index idx_advisory_requests_business_unit on public.advisory_requests(business_unit) where deleted_at is null;
create index idx_advisory_requests_date on public.advisory_requests(requested_date desc) where deleted_at is null;
create index idx_advisory_requests_assigned on public.advisory_requests(assigned_to);
create trigger trg_advisory_requests_ua before update on public.advisory_requests for each row execute function public.set_updated_at();

create table public.advisory_notes (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.advisory_requests(id) on delete cascade,
  author      text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index idx_advisory_notes_request on public.advisory_notes(request_id, created_at desc);
