-- W17-1 / PR-5: extend optimistic-concurrency coverage to every Rules-page
-- child table that has a PATCH or DELETE route.
alter table circular_articles                add column if not exists updated_at timestamptz not null default now();
alter table article_checklist_items          add column if not exists updated_at timestamptz not null default now();
alter table circular_workflow_steps          add column if not exists updated_at timestamptz not null default now();
alter table circular_cap_attachments         add column if not exists updated_at timestamptz not null default now();
alter table circular_remediation_attachments add column if not exists updated_at timestamptz not null default now();
alter table circular_pdf_attachments         add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on circular_articles;
create trigger set_updated_at before update on circular_articles for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on article_checklist_items;
create trigger set_updated_at before update on article_checklist_items for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on circular_workflow_steps;
create trigger set_updated_at before update on circular_workflow_steps for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on circular_cap_attachments;
create trigger set_updated_at before update on circular_cap_attachments for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on circular_remediation_attachments;
create trigger set_updated_at before update on circular_remediation_attachments for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on circular_pdf_attachments;
create trigger set_updated_at before update on circular_pdf_attachments for each row execute function public.set_updated_at();
