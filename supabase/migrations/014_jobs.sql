-- 014_jobs
-- jobs table (pg-boss substitute) + claim_jobs() function using FOR UPDATE SKIP LOCKED.

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  scheduled_for   timestamptz not null default now(),
  run_at          timestamptz,
  claimed_at      timestamptz,
  claimed_by      text,
  started_at      timestamptz,
  completed_at    timestamptz,
  error           text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (kind, idempotency_key)
);
create index idx_jobs_active on public.jobs(status, scheduled_for) where status in ('queued','running');
create index idx_jobs_kind_status on public.jobs(kind, status);
create trigger trg_jobs_ua before update on public.jobs for each row execute function public.set_updated_at();

create or replace function public.claim_jobs(batch_size integer)
returns setof public.jobs
language plpgsql security definer set search_path = public
as $$
declare
  worker text := coalesce(current_setting('app.worker_id', true), 'unknown');
begin
  return query
    update public.jobs j
    set status = 'running',
        attempts = j.attempts + 1,
        claimed_at = now(),
        claimed_by = worker,
        started_at = now(),
        updated_at = now()
    where j.id in (
      select id from public.jobs
      where status = 'queued' and scheduled_for <= now()
      order by scheduled_for asc, created_at asc
      for update skip locked
      limit batch_size
    )
    returning j.*;
end;
$$;

grant execute on function public.claim_jobs(integer) to authenticated;
