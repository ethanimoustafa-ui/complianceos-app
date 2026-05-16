-- 010_training
-- training_courses, training_employees, employee_course_progress, saudization_metrics (singleton).

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null,
  due_date date, description text,
  assigned_count integer not null default 0,
  completed_count integer not null default 0,
  overdue_count integer not null default 0,
  in_progress_count integer not null default 0,
  framework_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_training_courses_category on public.training_courses(category) where deleted_at is null;
create index idx_training_courses_due on public.training_courses(due_date) where deleted_at is null;
create index idx_training_courses_framework_ids on public.training_courses using gin(framework_ids);
create trigger trg_training_courses_ua before update on public.training_courses for each row execute function public.set_updated_at();

create table public.training_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null, email text not null,
  department text,
  is_saudi boolean not null default false,
  overall_progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_training_employees_department on public.training_employees(department);
create index idx_training_employees_is_saudi on public.training_employees(is_saudi);
create index idx_training_employees_email on public.training_employees(email);
create trigger trg_training_employees_ua before update on public.training_employees for each row execute function public.set_updated_at();

create table public.employee_course_progress (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.training_employees(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  status text not null default 'not_started' check (status in ('completed','in_progress','not_started','overdue')),
  progress integer not null default 0,
  score integer,
  completed_date date, due_date date,
  unique (employee_id, course_id)
);
create index idx_employee_course_progress_course on public.employee_course_progress(course_id);
create index idx_employee_course_progress_status on public.employee_course_progress(status);
create index idx_employee_course_progress_due on public.employee_course_progress(due_date);

create table public.saudization_metrics (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  target numeric not null default 0,
  actual numeric not null default 0,
  total_employees integer not null default 0,
  saudi_employees integer not null default 0,
  by_department jsonb not null default '[]'::jsonb,
  last_data_source text,
  last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_saudization_metrics_ua before update on public.saudization_metrics for each row execute function public.set_updated_at();
