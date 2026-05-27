-- 083_backfill_policy_workflow_steps.sql
-- W29.1-P1: Backfill existing policies with workflow_steps drawn from the
-- per-tier templates seeded in 080. Targets policies on the new tier names
-- (board, agm, managerial, sharia, audit_committee) that have ZERO steps.
-- Idempotent — the NOT EXISTS guard skips any policy that already has steps.
--
-- Step status policy on backfill:
--   approved policy        → all steps 'completed' (date=approved_date, user=owner_name)
--   under-review policy    → first step 'current', rest 'pending'
--   anything else (draft)  → first step 'current', rest 'pending'
--
-- Legacy tier_1 / tier_2 rows are intentionally NOT touched — they already
-- have hand-rolled steps; rewriting them would destroy work in progress.

insert into public.policy_workflow_steps
  (policy_id, step, sort_order, action_type, description, status, date, user_name, updated_at)
select
  p.id,
  t.step,
  t.sort_order,
  t.action_type,
  t.description,
  case
    when p.status = 'approved' then 'completed'
    when t.sort_order = 1 then 'current'
    else 'pending'
  end as status,
  case when p.status = 'approved' then coalesce(p.approved_date, current_date) else null end as date,
  case when p.status = 'approved' then p.owner_name else null end as user_name,
  now() as updated_at
from public.policies p
join public.policy_workflow_step_templates t on t.tier = p.approval_tier
where p.deleted_at is null
  and p.approval_tier in ('board', 'agm', 'managerial', 'sharia', 'audit_committee')
  and not exists (
    select 1 from public.policy_workflow_steps s where s.policy_id = p.id
  );
