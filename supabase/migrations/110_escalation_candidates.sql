-- 110_escalation_candidates
-- One UNION-ALL view of every open checklist item with a deadline, across the
-- six checklist/step tables, normalised to a uniform shape. The escalation scan
-- (/api/cron/daily) reads this, computes the reminder/overdue rung in app code,
-- and writes in-app notifications. Heterogeneous joins (item- vs parent-level
-- assignee, parent severity, parent title + ref for routing) live here so the
-- TS stays simple. Only items due within the next 7 days OR overdue are returned.
--
-- "officer in charge" per domain:
--   observation → observations.leader_id      audit → audit_tasks.assignee_id
--   risk        → risks.owner_id              circular → step.assigned_to
--   article     → circular_articles.assigned_to   policy → policies.owner_id

create or replace function public.get_escalation_candidates()
returns table (
  source      text,
  item_id     uuid,
  parent_id   uuid,
  title       text,
  deadline    date,
  assignee_id uuid,
  severity    text,
  ref         text
)
language sql
security definer
set search_path = public
stable
as $$
  -- Observations (deep-link uses the human reference)
  select 'observation', oc.id, o.id, o.title, oc.deadline, o.leader_id, o.severity, o.reference
  from observation_checklist oc
  join observations o on o.id = oc.observation_id
  where oc.completed = false and oc.deadline is not null
    and o.deleted_at is null and o.archived_at is null and o.status <> 'closed'
    and oc.deadline <= current_date + 7

  union all
  -- Risk mitigation (severity banded from the 5x5 risk_score)
  select 'risk', rc.id, r.id, r.title, rc.deadline, r.owner_id,
    case when r.risk_score >= 15 then 'critical'
         when r.risk_score >= 9  then 'high'
         when r.risk_score >= 4  then 'medium'
         else 'low' end,
    null::text
  from risk_mitigation_checklist rc
  join risks r on r.id = rc.risk_id
  where rc.completed = false and rc.deadline is not null
    and r.deleted_at is null and r.status <> 'resolved'
    and rc.deadline <= current_date + 7

  union all
  -- Audit tasks (own assignee / severity / due_date)
  select 'audit', at.id, a.id, coalesce(nullif(at.title, ''), a.title), at.due_date, at.assignee_id, at.severity, null::text
  from audit_tasks at
  join audits a on a.id = at.audit_id
  where at.completed = false and at.deleted_at is null and at.due_date is not null
    and a.deleted_at is null
    and at.due_date <= current_date + 7

  union all
  -- Circular workflow steps (parent priority as severity)
  select 'circular', cws.id, c.id, c.title, cws.deadline, cws.assigned_to, c.priority, null::text
  from circular_workflow_steps cws
  join circulars c on c.id = cws.circular_id
  where cws.completed_at is null and cws.deadline is not null
    and c.deleted_at is null and c.status <> 'completed'
    and cws.deadline <= current_date + 7

  union all
  -- Article checklist items (parent article assignee + risk_level)
  select 'article', aci.id, c.id, coalesce(nullif(ca.title, ''), c.title), aci.deadline, ca.assigned_to, ca.risk_level, null::text
  from article_checklist_items aci
  join circular_articles ca on ca.id = aci.article_id
  join circulars c on c.id = ca.circular_id
  where aci.completed = false and aci.deadline is not null
    and c.deleted_at is null
    and aci.deadline <= current_date + 7

  union all
  -- Policy workflow steps (policy owner = Policy Leader; policies carry no severity)
  select 'policy', pws.id, p.id, p.name, pws.deadline, p.owner_id, 'medium'::text, null::text
  from policy_workflow_steps pws
  join policies p on p.id = pws.policy_id
  where pws.deadline is not null
    and (pws.status is null or pws.status not in ('completed', 'done', 'approved'))
    and p.deleted_at is null and p.archived_at is null
    and pws.deadline <= current_date + 7;
$$;

grant execute on function public.get_escalation_candidates() to service_role;
