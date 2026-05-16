-- 027_compute_compliance_inputs_rpc
--
-- Aggregator RPC for the server-side scoring engines.
--
-- Replaces the 10-query Promise.all in `src/lib/api/services/scoring/gather-inputs.ts`
-- with a single round-trip that returns a JSONB envelope containing every slice
-- the compliance + dashboard-health engines consume:
--
--   audits, observations, risks, policies, trainings, circulars,
--   letters, frameworks, settings, framework_pins
--
-- The function is SECURITY DEFINER and bypasses RLS — it intentionally mirrors
-- the engine's existing behaviour where the only filter is `deleted_at IS NULL`
-- plus the period range. RBAC for the calling route handler is enforced at
-- the Next.js layer (via requirePerm / requireUser).
--
-- Letters are NOT period-filtered (matching the legacy gather-inputs path).
--
-- Idempotent.
--
-- Author: Agent P — Performance pack (2026-05-16)

create or replace function public.compute_compliance_inputs(
  p_period_start  timestamptz,
  p_period_end    timestamptz,
  p_framework_id  uuid default null,
  p_department_id uuid default null
)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  with
    audits_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',             a.id,
        'type',           a.type,
        'status',         a.status,
        'due_date',       a.due_date,
        'completed_at',   a.completed_at,
        'closed_overdue', a.closed_overdue,
        'priority',       a.priority,
        'progress',       a.progress,
        'framework_ids',  a.framework_ids,
        'created_at',     a.created_at
      )), '[]'::jsonb) as data
      from public.audits a
      where a.deleted_at is null
        and a.created_at >= p_period_start
        and a.created_at <= p_period_end
    ),
    observations_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',            o.id,
        'source',        o.source,
        'severity',      o.severity,
        'status',        o.status,
        'due_date',      o.due_date,
        'framework_ids', o.framework_ids,
        'created_at',    o.created_at
      )), '[]'::jsonb) as data
      from public.observations o
      where o.deleted_at is null
        and o.created_at >= p_period_start
        and o.created_at <= p_period_end
    ),
    risks_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',            r.id,
        'likelihood',    r.likelihood,
        'impact',        r.impact,
        'status',        r.status,
        'framework_ids', r.framework_ids,
        'created_at',    r.created_at
      )), '[]'::jsonb) as data
      from public.risks r
      where r.deleted_at is null
        and r.created_at >= p_period_start
        and r.created_at <= p_period_end
    ),
    policies_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',               p.id,
        'status',           p.status,
        'next_review_date', p.next_review_date,
        'framework_ids',    p.framework_ids,
        'created_at',       p.created_at
      )), '[]'::jsonb) as data
      from public.policies p
      where p.deleted_at is null
        and p.created_at >= p_period_start
        and p.created_at <= p_period_end
    ),
    trainings_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',              t.id,
        'assigned_count',  t.assigned_count,
        'completed_count', t.completed_count,
        'framework_ids',   t.framework_ids,
        'created_at',      t.created_at
      )), '[]'::jsonb) as data
      from public.training_courses t
      where t.deleted_at is null
        and t.created_at >= p_period_start
        and t.created_at <= p_period_end
    ),
    circulars_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',            c.id,
        'priority',      c.priority,
        'status',        c.status,
        'progress',      c.progress,
        'framework_ids', c.framework_ids,
        'created_at',    c.created_at
      )), '[]'::jsonb) as data
      from public.circulars c
      where c.deleted_at is null
        and c.created_at >= p_period_start
        and c.created_at <= p_period_end
    ),
    letters_q as (
      -- Letters are NOT period-filtered, matching gather-inputs.ts behaviour.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                l.id,
        'status',            l.status,
        'response_deadline', l.response_deadline,
        'framework_ids',     l.framework_ids
      )), '[]'::jsonb) as data
      from public.letters l
      where l.deleted_at is null
    ),
    frameworks_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                   f.id,
        'enabled',              f.enabled,
        'correspondence_based', f.correspondence_based,
        'weights',              f.weights,
        'name_en',              f.name_en
      )), '[]'::jsonb) as data
      from public.frameworks f
    ),
    settings_q as (
      select to_jsonb(s) - 'singleton' as data
      from public.compliance_settings s
      where s.singleton = true
      limit 1
    ),
    pins_q as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'framework_id', fp.framework_id,
        'position',     fp.position
      ) order by fp.position asc), '[]'::jsonb) as data
      from public.framework_pins fp
    )
  select jsonb_build_object(
    'audits',         (select data from audits_q),
    'observations',   (select data from observations_q),
    'risks',          (select data from risks_q),
    'policies',       (select data from policies_q),
    'trainings',      (select data from trainings_q),
    'circulars',      (select data from circulars_q),
    'letters',        (select data from letters_q),
    'frameworks',     (select data from frameworks_q),
    'settings',       (select data from settings_q),
    'framework_pins', (select data from pins_q),
    'meta',           jsonb_build_object(
      'period_start',    p_period_start,
      'period_end',      p_period_end,
      'framework_id',    p_framework_id,
      'department_id',   p_department_id,
      'computed_at',     now()
    )
  );
$$;

revoke all on function public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid) from public;
grant execute on function public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;

comment on function public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid) is
  'Aggregator for the compliance scoring engines. Returns one JSONB envelope with all 10 source slices in a single round-trip. SECURITY DEFINER; mirrors legacy gather-inputs.ts filters.';

notify pgrst, 'reload schema';
