-- 105_audit_retention_purge
-- Scalability follow-up to 102 (the deliberately-deferred audit retention item,
-- see 102 header). Daily pg_cron purge of the append-only audit/activity logs
-- older than the org retention policy (compliance_settings.audit_retention_years).
--
-- Append-only interaction (verified against the live catalog):
--   * The per-table block trigger from 012 fires on UPDATE ONLY (tgtype=19 =
--     BEFORE+ROW+UPDATE, no DELETE bit), so it NEVER blocks DELETE.
--   * 012 revoked UPDATE/DELETE/TRUNCATE from authenticated/anon/service_role and
--     granted DELETE back only to role `audit_admin`. `postgres` is a member of
--     audit_admin (rolinherit), so it already holds DELETE on both tables.
--   * Every pg_cron job in this project runs as `postgres`, so this job can
--     DELETE without tripping the trigger. We do NOT alter any table grant here,
--     so authenticated/service_role remain unable to mutate the logs.
--
-- NO-OP today: the oldest rows are ~1 month old and retention is 7 years.
--
-- FUTURE SCALE PATH (not done here): at 100M+ rows, convert these tables to
-- monthly RANGE partitions on (timestamp / created_at) and replace the row
-- DELETE with DROP PARTITION (metadata-only). Out of scope for this migration.

create or replace function public.purge_expired_audit_logs()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_years   integer;
  v_cutoff  timestamptz;
  v_deleted bigint;
begin
  -- Org retention policy (singleton row). Fallback to 7 if somehow unset.
  select coalesce(audit_retention_years, 7) into v_years
    from public.compliance_settings
    order by created_at asc
    limit 1;
  if v_years is null then
    v_years := 7;
  end if;
  v_cutoff := now() - make_interval(years => v_years);

  -- audit_logs: purge on `timestamp`.
  delete from public.audit_logs where timestamp < v_cutoff;
  get diagnostics v_deleted = row_count;
  insert into public.audit_admin_actions (action, rows_deleted, cutoff, performed_by)
  values ('retention_purge:audit_logs', v_deleted, v_cutoff, current_user);

  -- user_activity_logs: purge on `created_at` (it has NO `timestamp` column).
  delete from public.user_activity_logs where created_at < v_cutoff;
  get diagnostics v_deleted = row_count;
  insert into public.audit_admin_actions (action, rows_deleted, cutoff, performed_by)
  values ('retention_purge:user_activity_logs', v_deleted, v_cutoff, current_user);
end;
$fn$;

-- Lock down EXECUTE (mirrors 104). Only cron (postgres) and the service-role
-- admin client may invoke it; never authenticated/anon.
revoke all on function public.purge_expired_audit_logs() from public, anon, authenticated;
grant execute on function public.purge_expired_audit_logs() to service_role;

-- Daily at 03:15 (03:00 is taken by housekeeping_cron_run_details_purge from 102).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'audit_logs_retention_purge') then
    perform cron.schedule(
      'audit_logs_retention_purge',
      '15 3 * * *',
      $cmd$select public.purge_expired_audit_logs();$cmd$
    );
  end if;
end $$;
