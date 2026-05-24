-- Wave-18 — port of W17-1 / PR-5 to the Policies page. Extend
-- optimistic-concurrency coverage to every Policy child table that has a
-- PATCH or DELETE route.
alter table policy_workflow_steps add column if not exists updated_at timestamptz not null default now();
alter table policy_attachments    add column if not exists updated_at timestamptz not null default now();
alter table policy_evidence       add column if not exists updated_at timestamptz not null default now();
alter table policy_review_cycles  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on policy_workflow_steps;
create trigger set_updated_at before update on policy_workflow_steps for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on policy_attachments;
create trigger set_updated_at before update on policy_attachments for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on policy_evidence;
create trigger set_updated_at before update on policy_evidence for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on policy_review_cycles;
create trigger set_updated_at before update on policy_review_cycles for each row execute function public.set_updated_at();
