-- Wave-20 — observation child-table optimistic-locking coverage.
--
-- Mirror of 052 (Rules) + 053 (Policy). Every observation child table that
-- has a PATCH or DELETE route needs `updated_at` + the `set_updated_at`
-- trigger so the route can implement the W17.2 atomic-update-conditional-
-- on-If-Match pattern. PORTING-TEMPLATE §2.12.
alter table observation_assignees add column if not exists updated_at timestamptz not null default now();
alter table observation_checklist add column if not exists updated_at timestamptz not null default now();
alter table observation_documents add column if not exists updated_at timestamptz not null default now();
alter table observation_team     add column if not exists updated_at timestamptz not null default now();
alter table observation_updates  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on observation_assignees;
create trigger set_updated_at before update on observation_assignees for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on observation_checklist;
create trigger set_updated_at before update on observation_checklist for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on observation_documents;
create trigger set_updated_at before update on observation_documents for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on observation_team;
create trigger set_updated_at before update on observation_team for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on observation_updates;
create trigger set_updated_at before update on observation_updates for each row execute function public.set_updated_at();
