-- 025_circular_workflow
-- Extends circular_workflow_steps with assigned_to + deadline columns, and
-- relaxes the original `phase in (0,1,2)` check so default-seeded steps can
-- be added/reordered freely (the UI still groups by phase 0/1/2 but other
-- values are allowed for backwards compatibility).

alter table public.circular_workflow_steps
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.circular_workflow_steps
  add column if not exists deadline date;

create index if not exists idx_circular_workflow_steps_assigned_to
  on public.circular_workflow_steps(assigned_to);

-- Drop the old narrow phase check so the column can hold any phase index.
alter table public.circular_workflow_steps drop constraint if exists circular_workflow_steps_phase_check;
alter table public.circular_workflow_steps
  add constraint circular_workflow_steps_phase_check check (phase >= 0);

-- Allow authenticated users to read steps assigned to them across departments
-- (existing select policy is already `using (true)`, so no change needed).

notify pgrst, 'reload schema';
