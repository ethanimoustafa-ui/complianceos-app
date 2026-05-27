-- 080_seed_policy_workflow_step_templates.sql
-- P1 (W29): Create a per-tier workflow step template table and seed default
-- workflow steps for each of the five approval tiers introduced in migration 074.
--
-- Decision: created a new table `policy_workflow_step_templates` rather than
-- reusing `policy_templates.default_workflow_steps` (JSONB) because:
--   1. The JSONB column on policy_templates is per-policy-template, not per-tier.
--   2. A relational table allows direct queries like "give me steps for tier=board"
--      without client-side JSON unpacking.
--   3. It mirrors the existing `policy_workflow_steps` column shape so the UI
--      can copy rows verbatim when creating a new policy.
--
-- NOTE: steps live per-policy (created on policy creation from these templates).
-- This table is the source-of-truth for defaults; it does not replace
-- policy_workflow_steps (the actual per-policy rows).

create table if not exists public.policy_workflow_step_templates (
  id           uuid primary key default gen_random_uuid(),
  tier         text not null,           -- matches enum_value_definitions domain='policy.approval_tier' key
  sort_order   integer not null default 0,
  step         text not null,           -- display name of the step
  action_type  text,                    -- 'review_complete' | 'vote_approve' | 'approve' | 'publish'
  description  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_policy_workflow_step_templates_tier
  on public.policy_workflow_step_templates(tier, sort_order);

comment on table public.policy_workflow_step_templates is
  'Default workflow step templates seeded per approval tier. '
  'When a new policy is created the CREATE route copies rows for the matching tier '
  'into policy_workflow_steps.';

-- Idempotent seed — delete existing seeds then reinsert.
delete from public.policy_workflow_step_templates
where tier in ('board', 'agm', 'managerial', 'sharia', 'audit_committee');

insert into public.policy_workflow_step_templates
  (tier, sort_order, step, action_type, description)
values
  -- Board approval workflow
  ('board', 1, 'Initial Review',   'review_complete', 'Initial policy review and quality check'),
  ('board', 2, 'Board Discussion', 'review_complete', 'Presentation and discussion at Board meeting'),
  ('board', 3, 'Board Vote',       'vote_approve',    'Formal Board vote to approve or reject'),
  ('board', 4, 'Publish',          'publish',         'Publish and communicate the approved policy'),

  -- AGM approval workflow
  ('agm', 1, 'Initial Review', 'review_complete', 'Initial policy review and quality check'),
  ('agm', 2, 'AGM Tabling',    'review_complete', 'Table policy at Annual General Meeting'),
  ('agm', 3, 'AGM Vote',       'vote_approve',    'Formal AGM vote to approve or reject'),
  ('agm', 4, 'Publish',        'publish',         'Publish and communicate the approved policy'),

  -- Managerial approval workflow
  ('managerial', 1, 'Initial Review',     'review_complete', 'Initial policy review and quality check'),
  ('managerial', 2, 'Manager Approval',   'approve',         'Approval by responsible manager'),
  ('managerial', 3, 'Publish',            'publish',         'Publish and communicate the approved policy'),

  -- Sharia approval workflow
  ('sharia', 1, 'Initial Review',   'review_complete', 'Initial policy review and quality check'),
  ('sharia', 2, 'Sharia Review',    'review_complete', 'Review by Sharia Supervisory Board'),
  ('sharia', 3, 'Sharia Approval',  'approve',         'Formal Sharia Supervisory Board approval'),
  ('sharia', 4, 'Publish',          'publish',         'Publish and communicate the approved policy'),

  -- Audit Committee approval workflow
  ('audit_committee', 1, 'Initial Review',             'review_complete', 'Initial policy review and quality check'),
  ('audit_committee', 2, 'Audit Committee Review',     'review_complete', 'Review by Audit Committee'),
  ('audit_committee', 3, 'Audit Committee Approval',   'approve',         'Formal Audit Committee approval'),
  ('audit_committee', 4, 'Publish',                    'publish',         'Publish and communicate the approved policy');
