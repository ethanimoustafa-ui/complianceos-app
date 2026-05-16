-- 005_correspondence_letters
-- sama_letters (generalized via authority -> frameworks), templates, approval steps,
-- timeline (append-only via migration 012), attachments, junction.

create table public.sama_letters (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  authority               text not null default 'sama' references public.frameworks(id) on delete restrict,
  type                    text not null,
  sub_category            text,
  sama_department         text,
  subject                 text not null,
  subject_ar              text,
  body                    text not null,
  body_ar                 text,
  status                  text not null default 'draft' check (status in (
                            'draft','pending-approval','approved','sent','response-received','overdue'
                          )),
  priority                text not null default 'standard' check (priority in ('standard','urgent')),
  created_by              uuid references public.profiles(id) on delete set null,
  assigned_to             uuid references public.profiles(id) on delete set null,
  sent_date               timestamptz,
  response_deadline       timestamptz,
  response_received_date  timestamptz,
  recipient_name          text, recipient_org text, recipient_city text,
  recipient_name_ar       text, recipient_org_ar text, recipient_city_ar text,
  signer_name             text, signer_title text,
  signer_name_ar          text, signer_title_ar text,
  signature_image_url     text,
  framework_ids           text[] not null default '{}',
  placeholder_defs        jsonb not null default '[]'::jsonb,
  placeholder_values      jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);
create index idx_sama_letters_authority_status on public.sama_letters(authority, status) where deleted_at is null;
create index idx_sama_letters_type on public.sama_letters(type) where deleted_at is null;
create index idx_sama_letters_deadline on public.sama_letters(response_deadline) where deleted_at is null;
create index idx_sama_letters_created_by on public.sama_letters(created_by);
create index idx_sama_letters_assigned_to on public.sama_letters(assigned_to);
create trigger trg_sama_letters_ua before update on public.sama_letters for each row execute function public.set_updated_at();

create table public.sama_letter_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, type text not null,
  icon text, color text, description text,
  status text not null default 'active',
  default_subject_en text, default_subject_ar text,
  default_body_en text, default_body_ar text,
  default_signer_name text, default_signer_title text,
  default_signer_name_ar text, default_signer_title_ar text,
  default_signature_image_url text, default_sama_department text,
  default_recipient_name text, default_recipient_org text, default_recipient_city text,
  default_recipient_name_ar text, default_recipient_org_ar text, default_recipient_city_ar text,
  placeholder_defs jsonb not null default '[]'::jsonb,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sama_letter_templates_type on public.sama_letter_templates(type);
create index idx_sama_letter_templates_status on public.sama_letter_templates(status);
create trigger trg_sama_letter_templates_ua before update on public.sama_letter_templates for each row execute function public.set_updated_at();

create table public.sama_letter_approval_steps (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.sama_letters(id) on delete cascade,
  step integer not null check (step in (1,2,3)),
  role text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  assigned_to uuid references public.profiles(id) on delete set null,
  approved_at timestamptz, rejected_at timestamptz,
  notes text,
  unique (letter_id, step)
);
create index idx_sama_letter_steps_letter on public.sama_letter_approval_steps(letter_id);

create table public.sama_letter_timeline (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.sama_letters(id) on delete cascade,
  title text not null,
  date timestamptz not null default now(),
  user_name text,
  status text not null default 'pending'
);
create index idx_sama_letter_timeline_letter on public.sama_letter_timeline(letter_id, date desc);

create table public.sama_letter_attachments (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.sama_letters(id) on delete cascade,
  name text not null, storage_path text not null, type text, size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);
create index idx_sama_letter_attachments_letter on public.sama_letter_attachments(letter_id);

create table public.sama_letter_observations (
  letter_id uuid not null references public.sama_letters(id) on delete cascade,
  observation_id uuid not null,
  primary key (letter_id, observation_id)
);
