-- 119_settings_config_split
--
-- Splits the single `settings:edit` config superuser key into TWO independent,
-- grant-able capabilities so the Settings page sections can be delegated
-- separately to officers (via the Access Matrix / user_permissions), WITHOUT
-- granting blanket config access:
--
--   • frameworks:config — the FRAMEWORKS section: enabling/pinning/configuring
--       regulatory frameworks + the company-wide compliance threshold.
--   • lists:config      — the CONFIGURABLES hub: lists, categories,
--       enums/approval-tiers, departments, business units, framework
--       sub-categories, authority-departments, training courses, AND the
--       letter/policy/audit TEMPLATE managers.
--
-- `settings:edit` REMAINS the manager/admin superuser key. Every config route
-- now accepts `requireAnyPerm(['<group>', 'settings:edit'])`, and every write
-- RLS policy below OR's the group key alongside the EXISTING `settings:edit`
-- predicate — so managers/admins (who hold settings:edit by role) keep full
-- access, while an officer granted ONLY frameworks:config (or ONLY lists:config)
-- can write exactly that section's tables.
--
-- Officers get NEITHER key by default (grant-only via the Access Matrix); only
-- admin + manager are seeded with both.
--
-- Classification (matches the route sweep):
--   frameworks:config → compliance_settings, framework_config, framework_pins,
--                       frameworks
--   lists:config      → everything else that currently gates on settings:edit
--                       (per pg_policies): audit_categories, audit_templates,
--                       authority_departments, business_units,
--                       calendar_event_types, correspondence_types, departments,
--                       entity_templates, enum_value_definitions,
--                       framework_sub_categories, letter_templates,
--                       letter_types, onboarding_headcount_buckets,
--                       onboarding_industries, onboarding_regions,
--                       policy_categories, policy_templates, risk_categories,
--                       scale_label_overrides, training_categories.
--
-- DELIBERATELY NOT WIDENED (stay settings:edit-only): the RBAC tables
-- `permissions`, `role_permissions`, `roles` — widening them to lists:config
-- would let a Configurables-granted officer write the permission model itself
-- (privilege escalation). `help_articles` is also left out (not a Configurables
-- surface). These keep their existing settings:edit RLS untouched.
--
-- Every policy widened below currently gates purely on
-- `public.has_permission('settings:edit')` (verified against live pg_policies —
-- no owner/other predicates), so each is re-created as
-- `has_permission('settings:edit') OR has_permission('<group>')`, preserving the
-- existing predicate and only ADDING the group key. entity_templates keeps its
-- three command-split policies (INSERT/UPDATE/DELETE) intact.
--
-- The custom_access_token_hook (028) + has_permission() (038) derive from the
-- permissions/role_permissions/user_permissions tables generically, so they pick
-- the new keys up automatically — no hook edits. (Existing sessions must refresh
-- their token to receive a newly-granted key in app_metadata.)
--
-- Idempotent.

-- ── 1. Permission keys ────────────────────────────────────────────────────────
insert into public.permissions (key, name) values
  ('frameworks:config', 'Configure Frameworks'),
  ('lists:config',      'Configure Configurables')
on conflict (key) do nothing;

-- ── 2. Role seeding — admin + manager get BOTH keys (officers get NEITHER) ─────
insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
  where key in ('frameworks:config', 'lists:config')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
  select 'manager', key from public.permissions
  where key in ('frameworks:config', 'lists:config')
on conflict do nothing;

-- ── 3a. RLS widening — frameworks:config tables ───────────────────────────────
-- compliance_settings (the company compliance threshold).
drop policy if exists compliance_settings_modify on public.compliance_settings;
create policy compliance_settings_modify on public.compliance_settings for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('frameworks:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('frameworks:config'));

-- framework_config (per-framework enable/weight/threshold/pinned).
drop policy if exists framework_config_modify on public.framework_config;
create policy framework_config_modify on public.framework_config for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('frameworks:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('frameworks:config'));

-- framework_pins (pinned framework slots).
drop policy if exists framework_pins_modify on public.framework_pins;
create policy framework_pins_modify on public.framework_pins for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('frameworks:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('frameworks:config'));

-- frameworks (the regulatory framework catalog).
drop policy if exists frameworks_modify on public.frameworks;
create policy frameworks_modify on public.frameworks for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('frameworks:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('frameworks:config'));

-- ── 3b. RLS widening — lists:config tables ────────────────────────────────────
-- audit_categories
drop policy if exists audit_categories_mod on public.audit_categories;
create policy audit_categories_mod on public.audit_categories for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- audit_templates
drop policy if exists audit_templates_modify on public.audit_templates;
create policy audit_templates_modify on public.audit_templates for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- authority_departments
drop policy if exists authority_departments_mod on public.authority_departments;
create policy authority_departments_mod on public.authority_departments for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- business_units
drop policy if exists business_units_mod on public.business_units;
create policy business_units_mod on public.business_units for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- calendar_event_types
drop policy if exists calendar_event_types_mod on public.calendar_event_types;
create policy calendar_event_types_mod on public.calendar_event_types for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- correspondence_types
drop policy if exists correspondence_types_mod on public.correspondence_types;
create policy correspondence_types_mod on public.correspondence_types for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- departments
drop policy if exists departments_mod on public.departments;
create policy departments_mod on public.departments for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- entity_templates — KEEP the three command-split policies (INSERT/UPDATE/DELETE)
-- exactly as they exist in the live schema; only OR-in lists:config.
drop policy if exists entity_templates_insert on public.entity_templates;
create policy entity_templates_insert on public.entity_templates for insert to authenticated
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

drop policy if exists entity_templates_update on public.entity_templates;
create policy entity_templates_update on public.entity_templates for update to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

drop policy if exists entity_templates_delete on public.entity_templates;
create policy entity_templates_delete on public.entity_templates for delete to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- enum_value_definitions
drop policy if exists enum_value_definitions_modify on public.enum_value_definitions;
create policy enum_value_definitions_modify on public.enum_value_definitions for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- framework_sub_categories (the per-framework letter sub-category lists)
drop policy if exists framework_sub_categories_mod on public.framework_sub_categories;
create policy framework_sub_categories_mod on public.framework_sub_categories for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- letter_templates
drop policy if exists letter_templates_modify on public.letter_templates;
create policy letter_templates_modify on public.letter_templates for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- letter_types
drop policy if exists letter_types_mod on public.letter_types;
create policy letter_types_mod on public.letter_types for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- onboarding_headcount_buckets
drop policy if exists onboarding_headcount_buckets_mod on public.onboarding_headcount_buckets;
create policy onboarding_headcount_buckets_mod on public.onboarding_headcount_buckets for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- onboarding_industries
drop policy if exists onboarding_industries_mod on public.onboarding_industries;
create policy onboarding_industries_mod on public.onboarding_industries for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- onboarding_regions
drop policy if exists onboarding_regions_mod on public.onboarding_regions;
create policy onboarding_regions_mod on public.onboarding_regions for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- policy_categories
drop policy if exists policy_categories_mod on public.policy_categories;
create policy policy_categories_mod on public.policy_categories for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- policy_templates
drop policy if exists policy_templates_modify on public.policy_templates;
create policy policy_templates_modify on public.policy_templates for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- risk_categories
drop policy if exists risk_categories_mod on public.risk_categories;
create policy risk_categories_mod on public.risk_categories for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- scale_label_overrides
drop policy if exists scale_label_overrides_mod on public.scale_label_overrides;
create policy scale_label_overrides_mod on public.scale_label_overrides for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

-- training_categories
drop policy if exists training_categories_mod on public.training_categories;
create policy training_categories_mod on public.training_categories for all to authenticated
  using (public.has_permission('settings:edit') or public.has_permission('lists:config'))
  with check (public.has_permission('settings:edit') or public.has_permission('lists:config'));

notify pgrst, 'reload schema';
