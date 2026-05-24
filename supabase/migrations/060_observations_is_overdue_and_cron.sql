-- Wave-20 — `observations.is_overdue` derived state + cron resync.
--
-- Mirrors migration 055 (policies.is_expired + circulars.is_overdue):
--   - persisted `is_overdue` bool column on `observations`
--   - BEFORE INSERT OR UPDATE OF (due_date, status) trigger
--   - one-time backfill
--   - partial index for cheap StatCard queries
--   - the platform `regdocs_derived_state_daily` pg_cron job is RE-SCHEDULED
--     here to ALSO sync observations.is_overdue alongside policies + circulars
--
-- Observation terminal-state values are `closed` and `resolved`. We also
-- exclude `'completed'` defensively in case a future status is added; it's
-- a no-op today since observations don't use that value.
--
-- FORENSIC §5: closes the "mutation-triggered only" gap for the Observations
-- entity. Time-dependent derived state no longer drifts on idle rows.

alter table observations add column if not exists is_overdue bool not null default false;

create or replace function observations_set_is_overdue() returns trigger language plpgsql as $$
begin
  new.is_overdue := new.due_date is not null
                    and new.due_date < current_date
                    and new.status not in ('closed','resolved','completed');
  return new;
end$$;

drop trigger if exists observations_derived on observations;
create trigger observations_derived
  before insert or update of due_date, status on observations
  for each row execute function observations_set_is_overdue();

update observations
   set is_overdue = (
         due_date is not null
         and due_date < current_date
         and status not in ('closed','resolved','completed')
       )
 where deleted_at is null
   and (
         due_date is not null
         and due_date < current_date
         and status not in ('closed','resolved','completed')
       ) is distinct from is_overdue;

create index if not exists observations_is_overdue_idx on observations(is_overdue) where deleted_at is null;

-- Re-schedule the platform cron job to ALSO touch observations.
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'regdocs_derived_state_daily';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end$$;

select cron.schedule('regdocs_derived_state_daily', '30 0 * * *', $job$
    update policies set is_expired = (next_review_date is not null and next_review_date < current_date)
      where deleted_at is null and (next_review_date is not null and next_review_date < current_date) is distinct from is_expired;
    update circulars set is_overdue = (due_date is not null and due_date < current_date and status is distinct from 'completed')
      where deleted_at is null and (due_date is not null and due_date < current_date and status is distinct from 'completed') is distinct from is_overdue;
    update observations set is_overdue = (due_date is not null and due_date < current_date and status not in ('closed','resolved','completed'))
      where deleted_at is null and (due_date is not null and due_date < current_date and status not in ('closed','resolved','completed')) is distinct from is_overdue;
$job$);
