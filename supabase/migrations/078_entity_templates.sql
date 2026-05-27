-- 078_entity_templates.sql
-- M2: Generic entity templates table for "Save as template" / "Select template"
-- in create modals. Initially wired for Rules (circulars); Policy and Audit
-- extend the same table in future waves.
--
-- NOTE: applied via Supabase MCP (W28). This project is single-tenant — no
-- organizations table exists, so org_id is intentionally omitted.

create table if not exists public.entity_templates (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,          -- 'circular' | 'policy' | 'audit' | …
  name text not null,                 -- display name chosen by the user
  name_ar text,                       -- optional Arabic display name
  fields jsonb not null default '{}', -- key→value map of pre-filled fields
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_entity_templates_type
  on public.entity_templates(entity_type)
  where deleted_at is null;

create trigger trg_entity_templates_ua
  before update on public.entity_templates
  for each row execute function public.set_updated_at();

comment on table public.entity_templates is
  'Generic save-as-template store for create modals. '
  'entity_type identifies the entity (circular, policy, audit). '
  'fields is a JSONB object of pre-filled defaults. '
  'M2: initially wired for circular (Rules) only; '
  'Policy and Audit extend the same table in future waves.';
