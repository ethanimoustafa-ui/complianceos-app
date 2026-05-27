-- P2: Replace generic "Tier 1 / Tier 2 / Tier 3" approval-tier rows with the
-- five meaningful tiers requested by Hani (board, agm, managerial, sharia,
-- audit_committee). The Policy Create/Edit dropdown reads from this table
-- via `useEnumValuesStore` (domain = 'policy.approval_tier'), so this
-- migration alone fixes the UI with no code changes required.
--
-- Strategy:
--   1. DELETE the generic tier_1/tier_2/tier_3 seed rows from migration 063.
--   2. INSERT (or upsert) the five meaningful tiers idempotently.
-- The ON CONFLICT clause makes the migration safe to re-run.

delete from enum_value_definitions
where domain = 'policy.approval_tier'
  and key in ('tier_1', 'tier_2', 'tier_3');

insert into enum_value_definitions (domain, key, name_en, name_ar, sort_order, is_default)
values
  ('policy.approval_tier', 'board',           'Board',                     'مجلس الإدارة',    1, true),
  ('policy.approval_tier', 'agm',             'AGM (Annual General Meeting)', 'الجمعية العمومية', 2, false),
  ('policy.approval_tier', 'managerial',      'Managerial',                'إداري',            3, false),
  ('policy.approval_tier', 'sharia',          'Sharia',                    'الشرعية',          4, false),
  ('policy.approval_tier', 'audit_committee', 'Audit Committee',           'لجنة المراجعة',    5, false)
on conflict (domain, key) do update
  set name_en    = excluded.name_en,
      name_ar    = excluded.name_ar,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      updated_at = now();
