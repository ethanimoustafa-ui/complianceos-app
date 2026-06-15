-- 106_dashboard_rollup_obs_stats
-- Extends the observations group of refresh_dashboard_rollup (104) with three
-- additional counts the Observations Tracker stats strip needs so it can read
-- ALL its KPIs from the precomputed rollup instead of the shared store's
-- (capped, client-side-counted) array:
--   openCritical  = critical severity AND status <> 'closed'
--   inRemediation = status 'in_progress'
--   drafting      = status 'open'
-- This also lets the tracker source its strip from the rollup (correct at scale)
-- and fixes the old client placeholder where "closedThisQuarter" counted ALL
-- closed observations. Only the observations object changes; everything else in
-- the blob is identical to 104.

create or replace function public.refresh_dashboard_rollup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  with
  a  as (select * from public.audits         where deleted_at is null),
  o  as (select * from public.observations   where deleted_at is null),
  r  as (select * from public.risks          where deleted_at is null),
  p  as (select * from public.policies       where deleted_at is null),
  l  as (select * from public.letters        where deleted_at is null),
  c  as (select * from public.correspondence where deleted_at is null),
  ci as (select * from public.circulars      where deleted_at is null)
  select jsonb_build_object(
    'audits', jsonb_build_object(
      'total', (select count(*) from a),
      'overdueCount', (select count(*) from a where status = 'overdue'),
      'upcoming30dCount', (select count(*) from a
         where status not in ('completed','overdue')
           and due_date > current_date and due_date <= current_date + 30),
      'completedThisMonth', (select count(*) from a
         where status = 'completed' and completed_at >= date_trunc('month', now())
           and completed_at < date_trunc('month', now()) + interval '1 month'),
      'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
         from (select status, count(*) n from a group by status) s),
      'byType', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
         from (select type, count(*) n from a group by type) s)
    ),
    'observations', jsonb_build_object(
      'total', (select count(*) from o),
      'open', (select count(*) from o where status in ('open','in_progress')),
      'openCritical', (select count(*) from o where severity = 'critical' and status <> 'closed'),
      'inRemediation', (select count(*) from o where status = 'in_progress'),
      'drafting', (select count(*) from o where status = 'open'),
      'closedThisQuarter', (select count(*) from o
         where status = 'closed' and updated_at >= date_trunc('quarter', now())
           and updated_at < date_trunc('quarter', now()) + interval '3 months'),
      'overdueCount', (select count(*) from o
         where status not in ('closed','resolved') and due_date < current_date),
      'bySource', jsonb_build_object(
        'sama', (select jsonb_build_object('total', count(*),
            'critical', count(*) filter (where severity='critical'),
            'high', count(*) filter (where severity='high'),
            'medium', count(*) filter (where severity='medium'),
            'low', count(*) filter (where severity='low')) from o where source='sama'),
        'internal', (select jsonb_build_object('total', count(*),
            'critical', count(*) filter (where severity='critical'),
            'high', count(*) filter (where severity='high'),
            'medium', count(*) filter (where severity='medium'),
            'low', count(*) filter (where severity='low')) from o where source='internal'),
        'sharia', (select jsonb_build_object('total', count(*),
            'critical', count(*) filter (where severity='critical'),
            'high', count(*) filter (where severity='high'),
            'medium', count(*) filter (where severity='medium'),
            'low', count(*) filter (where severity='low')) from o where source='sharia')
      )
    ),
    'risks', jsonb_build_object(
      'total', (select count(*) from r),
      'open', (select count(*) from r where status <> 'resolved'),
      'resolved', (select count(*) from r where status = 'resolved'),
      'byLevel', (select jsonb_build_object(
          'critical', count(*) filter (where likelihood*impact >= 20),
          'high',     count(*) filter (where likelihood*impact >= 12 and likelihood*impact < 20),
          'medium',   count(*) filter (where likelihood*impact >= 6  and likelihood*impact < 12),
          'low',      count(*) filter (where likelihood*impact < 6)
        ) from r where status <> 'resolved')
    ),
    'policies', jsonb_build_object(
      'total', (select count(*) from p),
      'approved', (select count(*) from p where status='approved'),
      'overdue', (select count(*) from p where status='overdue'),
      'requiresReview', (select count(*) from p where status='requires-review'),
      'draft', (select count(*) from p where status='draft'),
      'expired', (select count(*) from p where status='expired')
    ),
    'samaLetters', jsonb_build_object(
      'total', (select count(*) from l),
      'overdueCount', (select count(*) from l where status='overdue'),
      'upcoming30d', (select count(*) from l
         where status not in ('response-received','overdue') and response_deadline is not null
           and response_deadline > now() and response_deadline <= now() + interval '30 days'),
      'completedThisMonth', (select count(*) from l
         where status in ('response-received','sent')
           and coalesce(sent_date, updated_at) >= date_trunc('month', now())
           and coalesce(sent_date, updated_at) < date_trunc('month', now()) + interval '1 month'),
      'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
         from (select status, count(*) n from l group by status) s)
    ),
    'correspondence', jsonb_build_object(
      'total', (select count(*) from c),
      'active', (select count(*) from c where archived is not true),
      'drafts', (select count(*) from c where status='draft'),
      'sent', (select count(*) from c where status='sent')
    ),
    'circulars', jsonb_build_object(
      'total', (select count(*) from ci),
      'implemented', (select count(*) from ci where status='completed'),
      'byAuthority', (select coalesce(jsonb_object_agg(authority, n), '{}'::jsonb)
         from (select authority, count(*) n from ci group by authority) s)
    )
  ) into v;

  insert into public.dashboard_rollup (scope_type, scope_id, data, refreshed_at)
  values ('org', null, v, now())
  on conflict (scope_type, scope_id)
    do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
end;
$$;

select public.refresh_dashboard_rollup();
