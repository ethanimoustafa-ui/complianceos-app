-- 093 — W50: audit cycle snapshots. "Schedule next" no longer creates a new
-- audit row — it archives the finished cycle (full frozen snapshot: audit
-- fields, checklist, documents, comments, team, activity) into this table,
-- then resets the SAME audit for the next period (checklist carries forward
-- uncompleted; files/comments/logs start fresh). Snapshots are immutable —
-- editing the live audit can never touch them.

create table if not exists public.audit_cycles (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  cycle_number int not null,
  closed_at timestamptz not null default now(),
  due_date date,
  status text,
  progress int,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (audit_id, cycle_number)
);

create index if not exists idx_audit_cycles_audit on public.audit_cycles (audit_id, cycle_number desc);

alter table public.audit_cycles enable row level security;

drop policy if exists audit_cycles_select on public.audit_cycles;
create policy audit_cycles_select
  on public.audit_cycles for select
  to authenticated using (true);

drop policy if exists audit_cycles_write on public.audit_cycles;
create policy audit_cycles_write
  on public.audit_cycles for all
  to authenticated
  using (public.has_permission('edit'))
  with check (public.has_permission('edit'));
