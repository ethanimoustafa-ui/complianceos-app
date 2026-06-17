-- 109_notifications_retention
-- Bounded retention for in-app notifications so the table never grows without
-- limit. Two caps, whichever hits first:
--   • age   — drop anything older than `max_age_days` (default 30)
--   • count — keep only the `max_per_user` most recent per user (default 100)
-- Called daily by /api/cron/daily via the service-role admin client.

create or replace function public.prune_notifications(
  max_age_days integer default 30,
  max_per_user integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total_deleted integer := 0;
  n integer;
begin
  -- 1) Age cap.
  delete from public.notifications
  where created_at < now() - make_interval(days => max_age_days);
  get diagnostics n = row_count;
  total_deleted := total_deleted + n;

  -- 2) Per-user count cap — delete everything beyond the newest `max_per_user`.
  delete from public.notifications nt
  using (
    select id,
           row_number() over (partition by user_id order by created_at desc, id desc) as rn
    from public.notifications
  ) ranked
  where nt.id = ranked.id and ranked.rn > max_per_user;
  get diagnostics n = row_count;
  total_deleted := total_deleted + n;

  return total_deleted;
end;
$$;

grant execute on function public.prune_notifications(integer, integer) to service_role;
