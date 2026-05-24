-- Wave-19 / Q3 — Derived state at the SQL layer + daily cron resync.
--
-- Time-dependent derived state (`policies.is_expired`, `circulars.is_overdue`)
-- now lives as a real column populated by a BEFORE INSERT/UPDATE trigger, with
-- a partial index for cheap StatCard queries. A nightly pg_cron job catches
-- rows that no UPDATE touches (an idle expiry where time alone made the row
-- expire). FORENSIC §5: closes the "recomputeCircularProgress is mutation-
-- triggered only" gap so idle rows can no longer drift.
--
-- This file is a textual record of the DDL already applied to project
-- qdbitfgxbnbzkqhdoepd — running it again is idempotent.

create extension if not exists pg_cron;

-- ---- policies.is_expired ---------------------------------------------------

alter table policies add column if not exists is_expired bool not null default false;

create or replace function policies_set_is_expired() returns trigger language plpgsql as $$
begin
  new.is_expired := new.next_review_date is not null and new.next_review_date < current_date;
  return new;
end$$;

drop trigger if exists policies_derived on policies;
create trigger policies_derived
  before insert or update of next_review_date on policies
  for each row execute function policies_set_is_expired();

update policies
   set is_expired = (next_review_date is not null and next_review_date < current_date)
 where deleted_at is null
   and (next_review_date is not null and next_review_date < current_date)
       is distinct from is_expired;

create index if not exists policies_is_expired_idx on policies(is_expired) where deleted_at is null;

-- ---- circulars.is_overdue --------------------------------------------------

alter table circulars add column if not exists is_overdue bool not null default false;

create or replace function circulars_set_is_overdue() returns trigger language plpgsql as $$
begin
  new.is_overdue := new.due_date is not null
                    and new.due_date < current_date
                    and new.status is distinct from 'completed';
  return new;
end$$;

drop trigger if exists circulars_derived on circulars;
create trigger circulars_derived
  before insert or update of due_date, status on circulars
  for each row execute function circulars_set_is_overdue();

update circulars
   set is_overdue = (due_date is not null and due_date < current_date and status is distinct from 'completed')
 where deleted_at is null
   and (due_date is not null and due_date < current_date and status is distinct from 'completed')
       is distinct from is_overdue;

create index if not exists circulars_is_overdue_idx on circulars(is_overdue) where deleted_at is null;

-- ---- daily cron resync -----------------------------------------------------
-- Catches rows whose derived state should flip purely because the date
-- advanced — the BEFORE UPDATE trigger never fires on an idle row.

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'regdocs_derived_state_daily';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end$$;

select cron.schedule('regdocs_derived_state_daily', '30 0 * * *', $job$
  update policies
     set is_expired = (next_review_date is not null and next_review_date < current_date)
   where deleted_at is null
     and (next_review_date is not null and next_review_date < current_date)
         is distinct from is_expired;
  update circulars
     set is_overdue = (due_date is not null and due_date < current_date and status is distinct from 'completed')
   where deleted_at is null
     and (due_date is not null and due_date < current_date and status is distinct from 'completed')
         is distinct from is_overdue;
$job$);
