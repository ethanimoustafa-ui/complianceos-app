-- 107_team_workload
-- Phase B (server-side dashboard): live per-member assignment counts for the
-- Team Workload widgets (Executive avg-capacity, Managerial distribution +
-- burnout, Officer personal ring). Previously useWorkload/useTeamWorkloads
-- computed these in the BROWSER by reading 8 entity stores — which broke on the
-- Executive view once it stopped hydrating those stores (the workload widget
-- silently under-counted from empty stores). This computes the same 8-source
-- counts server-side; the client keeps the rate/discount % formula (it needs
-- per-member burnoutSince + manual assignments, which live on the team member).
--
-- Returns { "<member_uuid>": { observations, audits, policies, correspondence,
-- advisory, samaLetters, risks, circulars } }. SECURITY DEFINER so it aggregates
-- org-wide regardless of caller RLS (managers see the whole team); locked to
-- service_role (the /api/dashboard/workload route calls it via the admin client,
-- mirroring 103/104). Match keys are the uuid assignment columns.

create or replace function public.compute_team_workload()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with
  obs as (
    select uid, count(*) n from (
      select leader_id as uid from public.observations
        where deleted_at is null and status <> 'closed' and leader_id is not null
      union all
      select oa.user_id from public.observation_assignees oa
        join public.observations o on o.id = oa.observation_id
        where o.deleted_at is null and o.status <> 'closed' and oa.user_id is not null
    ) x group by uid
  ),
  aud  as (select assignee_id uid, count(*) n from public.audits
            where deleted_at is null and status in ('pending','in_progress') and assignee_id is not null group by assignee_id),
  pol  as (select owner_id uid, count(*) n from public.policies
            where deleted_at is null and status in ('under-review','pending-approval') and owner_id is not null group by owner_id),
  corr as (select assignee_id uid, count(*) n from public.correspondence
            where deleted_at is null and archived is not true and assignee_id is not null group by assignee_id),
  adv  as (select assigned_to uid, count(*) n from public.advisory_requests
            where deleted_at is null and status <> 'completed' and assigned_to is not null group by assigned_to),
  lett as (select assigned_to uid, count(*) n from public.letters
            where deleted_at is null and status <> 'response-received' and assigned_to is not null group by assigned_to),
  rsk  as (select owner_id uid, count(*) n from public.risks
            where deleted_at is null and status not in ('mitigated','closed') and owner_id is not null group by owner_id),
  circ as (select assigned_to uid, count(*) n from public.circulars
            where deleted_at is null and status not in ('completed','archived') and assigned_to is not null group by assigned_to),
  ids as (
    select uid from obs union select uid from aud union select uid from pol union select uid from corr
    union select uid from adv union select uid from lett union select uid from rsk union select uid from circ
  )
  select coalesce(jsonb_object_agg(ids.uid, jsonb_build_object(
    'observations',   coalesce((select n from obs  where obs.uid  = ids.uid), 0),
    'audits',         coalesce((select n from aud  where aud.uid  = ids.uid), 0),
    'policies',       coalesce((select n from pol  where pol.uid  = ids.uid), 0),
    'correspondence', coalesce((select n from corr where corr.uid = ids.uid), 0),
    'advisory',       coalesce((select n from adv  where adv.uid  = ids.uid), 0),
    'samaLetters',    coalesce((select n from lett where lett.uid = ids.uid), 0),
    'risks',          coalesce((select n from rsk  where rsk.uid  = ids.uid), 0),
    'circulars',      coalesce((select n from circ where circ.uid = ids.uid), 0)
  )), '{}'::jsonb)
  from ids;
$$;

revoke all on function public.compute_team_workload() from public, anon, authenticated;
grant execute on function public.compute_team_workload() to service_role;
