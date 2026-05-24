-- Wave-19.6 — circular_workflow_steps.completed_at
--
-- Adds a server-stamped completion timestamp so the rules workflow Undo
-- button can find the MOST RECENTLY completed step (ORDER BY completed_at
-- DESC) regardless of UI insertion order. A BEFORE INSERT/UPDATE trigger
-- stamps `now()` when status transitions to 'completed' and clears the
-- column when status transitions away — the column is never written
-- directly by application code.
--
-- Backfill: existing rows already marked completed receive `updated_at`
-- as a best-effort completion stamp so the new ORDER BY produces a stable
-- result on day-0.

alter table circular_workflow_steps
  add column if not exists completed_at timestamptz;

create or replace function set_completed_at_on_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  elsif new.status is distinct from 'completed' then
    new.completed_at := null;
  end if;
  return new;
end$$;

drop trigger if exists set_completed_at on circular_workflow_steps;
create trigger set_completed_at
  before insert or update of status on circular_workflow_steps
  for each row execute function set_completed_at_on_status();

-- Backfill existing completed rows.
update circular_workflow_steps
   set completed_at = updated_at
 where status = 'completed'
   and completed_at is null;

-- Partial index — the Undo route's "most recent completed step" probe.
create index if not exists circular_workflow_steps_completed_at_idx
  on circular_workflow_steps (circular_id, completed_at desc)
  where status = 'completed';
