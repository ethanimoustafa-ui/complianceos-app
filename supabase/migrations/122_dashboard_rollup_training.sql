-- 122_dashboard_rollup_training
-- Move the dashboard TRAINING summary server-side into the dashboard_rollup blob.
--
-- WHY: the dashboard page used to fetch /api/training/courses + /api/training/employees
-- (two pageSize=100 calls) on every cold load to feed the "Mandatory Training
-- Compliance" / "Training by Department" widgets. But the employees list endpoint
-- never returns per-course enrollments and the dashboard never ran the client-side
-- recompute, so `departmentProgress` was always empty and those widgets rendered
-- "no data". This adds a `training` section to refresh_dashboard_rollup() so the
-- dashboard reads real aggregates from the single /api/dashboard/summary request it
-- already makes — fixing the empty widgets AND dropping the two heavy fetches.
--
-- Computed from employee_course_progress (the source of completed/in_progress/overdue
-- per enrollment) grouped by training_employees.department. Saudization actual/target
-- and overallCompletion keep their existing semantics: the manually-entered
-- saudization_metrics singleton wins when set, else overallCompletion is derived from
-- the real enrollment completion ratio.
--
-- Everything else in the blob is IDENTICAL to migration 116. Only two CTEs
-- (dept_prog, sm) and the top-level `training` key are added. Trailing
-- `select refresh_dashboard_rollup()` repopulates the org row immediately.

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
  ci as (select * from public.circulars      where deleted_at is null),
  -- Training: per-department enrollment rollup (employees hard-deleted, no soft-delete col).
  dept_prog as (
    select
      coalesce(emp.department, 'Unknown') as name,
      count(distinct emp.id)                                      as employees,
      count(ecp.id) filter (where ecp.status = 'completed')       as completed,
      count(ecp.id) filter (where ecp.status = 'in_progress')     as in_progress,
      count(ecp.id) filter (where ecp.status = 'overdue')         as overdue,
      count(ecp.id)                                               as total
    from public.training_employees emp
    left join public.employee_course_progress ecp on ecp.employee_id = emp.id
    group by coalesce(emp.department, 'Unknown')
  ),
  sm as (select target, actual, overall_completion from public.saudization_metrics limit 1)
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
            'low', count(*) filter (where severity='low'))
            from o where source='sama' and status in ('open','in_progress') and archived_at is null),
        'internal', (select jsonb_build_object('total', count(*),
            'critical', count(*) filter (where severity='critical'),
            'high', count(*) filter (where severity='high'),
            'medium', count(*) filter (where severity='medium'),
            'low', count(*) filter (where severity='low'))
            from o where source='internal' and status in ('open','in_progress') and archived_at is null),
        'sharia', (select jsonb_build_object('total', count(*),
            'critical', count(*) filter (where severity='critical'),
            'high', count(*) filter (where severity='high'),
            'medium', count(*) filter (where severity='medium'),
            'low', count(*) filter (where severity='low'))
            from o where source='sharia' and status in ('open','in_progress') and archived_at is null)
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
    ),
    -- Training summary (new in 122). Feeds the dashboard's training widgets from
    -- the rollup so the page no longer fetches the full course/employee lists.
    'training', jsonb_build_object(
      'overallCompletion', coalesce(
        (select overall_completion from sm),
        (select case when sum(total) > 0
                     then round(sum(completed)::numeric / sum(total) * 100)
                     else 0 end
         from dept_prog)
      ),
      'saudization', jsonb_build_object(
        'actual', coalesce((select actual from sm), 0),
        'target', coalesce((select target from sm), 0),
        'gap', round((coalesce((select actual from sm), 0) - coalesce((select target from sm), 0)) * 10) / 10.0
      ),
      'departmentProgress', coalesce((
        select jsonb_agg(jsonb_build_object(
            'name', name,
            'employees', employees,
            'completed', completed,
            'inProgress', in_progress,
            'overdue', overdue,
            'progress', case when total > 0 then round(completed::numeric / total * 100) else 0 end
          ) order by name)
        from dept_prog
      ), '[]'::jsonb)
    )
  ) into v;

  insert into public.dashboard_rollup (scope_type, scope_id, data, refreshed_at)
  values ('org', null, v, now())
  on conflict (scope_type, scope_id)
    do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
end;
$$;

-- Repopulate immediately so the dashboard reflects the new training section
-- without waiting for the next pg_cron tick.
select public.refresh_dashboard_rollup();
