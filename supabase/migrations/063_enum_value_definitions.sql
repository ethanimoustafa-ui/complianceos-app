-- Wave-19.7 — enum_value_definitions
--
-- Generic table of user-configurable named values keyed by (domain, key).
-- First consumer: `domain='policy.approval_tier'` — the Policy Create/Edit
-- modal dropdown reads from this list. The raw enum string stays open per
-- Wave-19 Q5; the list is the source of truth for human-readable labels.
--
-- Defaults shipped pre-seeded so existing tier_1/tier_2/tier_3 rows keep
-- rendering with proper labels on day-0 (no migration of policy.approval_tier
-- column needed).

create table if not exists enum_value_definitions (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null,
  key         text not null,
  name_en     text not null,
  name_ar     text not null,
  sort_order  integer not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (domain, key)
);

create index if not exists enum_value_definitions_domain_sort_idx
  on enum_value_definitions (domain, sort_order);

drop trigger if exists set_updated_at on enum_value_definitions;
create trigger set_updated_at
  before update on enum_value_definitions
  for each row execute function set_updated_at();

alter table enum_value_definitions enable row level security;

drop policy if exists enum_value_definitions_select on enum_value_definitions;
create policy enum_value_definitions_select
  on enum_value_definitions
  for select
  using (true);

drop policy if exists enum_value_definitions_modify on enum_value_definitions;
create policy enum_value_definitions_modify
  on enum_value_definitions
  for all
  using (has_permission('settings:edit'))
  with check (has_permission('settings:edit'));

-- Seed: policy.approval_tier defaults (tier_1 / tier_2 / tier_3).
insert into enum_value_definitions (domain, key, name_en, name_ar, sort_order, is_default)
values
  ('policy.approval_tier', 'tier_1', 'Tier 1', 'المستوى 1', 1, true),
  ('policy.approval_tier', 'tier_2', 'Tier 2', 'المستوى 2', 2, true),
  ('policy.approval_tier', 'tier_3', 'Tier 3', 'المستوى 3', 3, true)
on conflict (domain, key) do nothing;
