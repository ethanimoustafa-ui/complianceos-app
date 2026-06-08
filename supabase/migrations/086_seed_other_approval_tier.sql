-- 086_seed_other_approval_tier.sql
--
-- Adds a built-in "Other" policy approval tier. Unlike the five seeded tiers
-- (board / agm / managerial / sharia / audit_committee), "Other" intentionally
-- has NO rows in policy_workflow_step_templates, so a policy created under it
-- seeds zero workflow steps — the author builds the workflow themselves on the
-- policy (Workflow tab → Add Workflow Step).
--
-- Idempotent: safe to re-run. The client also lets users add further custom
-- tiers at runtime (enum_value_definitions row + paired policy_template), which
-- need no migration.

INSERT INTO enum_value_definitions (domain, key, name_en, name_ar, sort_order, is_default)
SELECT 'policy.approval_tier', 'other', 'Other', 'أخرى',
       COALESCE((SELECT MAX(sort_order) FROM enum_value_definitions WHERE domain = 'policy.approval_tier'), 0) + 1,
       false
WHERE NOT EXISTS (
  SELECT 1 FROM enum_value_definitions
  WHERE domain = 'policy.approval_tier' AND key = 'other'
);
