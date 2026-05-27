-- 077_seed_policy_reviews.sql
-- F3: Seed next_review_date on existing approved policies, or insert sample
-- policies if none exist, so the Feed "Policy Review" card has data.
-- NOTE: applied via Supabase MCP (W28). Schema columns confirmed via
-- information_schema before write; do not edit names without re-confirming.

with target_policies as (
  select id
  from public.policies
  where status = 'approved'
    and deleted_at is null
  order by created_at asc
  limit 3
),
dated as (
  select
    id,
    row_number() over (order by id) as rn
  from target_policies
)
update public.policies p
set
  next_review_date = (now() + (dated.rn * interval '10 days'))::date,
  updated_at = now()
from dated
where p.id = dated.id;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.policies
  where status = 'approved' and deleted_at is null;

  if v_count = 0 then
    insert into public.policies
      (ref_code, name, description, status, category, version, approval_tier,
       owner_name, owner_department, framework_ids, affected_departments,
       review_cycle_days, next_review_date, overdue_count, is_expired,
       created_at, updated_at)
    values
      ('POL-2026-0001', 'AML Policy',
       'Anti-Money Laundering policy per SAMA guidelines.',
       'approved', 'compliance', '1.0', 'board',
       'Compliance Officer', 'Compliance',
       array['sama']::text[], array['Compliance']::text[],
       365, (now() + interval '7 days')::date, 0, false,
       now(), now()),
      ('POL-2026-0002', 'Data Governance Policy',
       'Policy governing data classification, handling, and retention.',
       'approved', 'it', '1.0', 'managerial',
       'CISO', 'Information Technology',
       array['citc']::text[], array['Information Technology']::text[],
       365, (now() + interval '15 days')::date, 0, false,
       now(), now()),
      ('POL-2026-0003', 'Risk Management Policy',
       'Enterprise risk management framework and procedures.',
       'approved', 'risk', '1.0', 'audit_committee',
       'CRO', 'Risk Management',
       array['sama']::text[], array['Risk Management']::text[],
       365, (now() + interval '28 days')::date, 0, false,
       now(), now());
  end if;
end $$;
