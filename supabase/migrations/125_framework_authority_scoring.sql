-- 125_framework_authority_scoring
--
-- Light up "Compliance by Framework" (Team Score page + PDF).
--
-- Per-framework scores read each item's `framework_ids` tag, but correspondence
-- is associated by AUTHORITY (letters.authority, circulars.authority,
-- observations.source, audits.type) — which the aggregator RPC did not expose
-- for letters/circulars. This recreates `compute_compliance_inputs` to include
-- `authority` for those two slices so the scoring gather step can fold an
-- item's authority into its framework set (see gather-inputs.ts `withAuthority`).
-- audits.type + observations.source were already returned.
--
-- Also flips `sharia-board.correspondence_based` to TRUE to match the client
-- (framework-config-store) so it joins the default pinned set.
--
-- SECURITY DEFINER posture is preserved: CREATE OR REPLACE keeps existing grants,
-- and we re-assert the migration-103 revoke (authenticated cannot call directly;
-- the Next.js route uses the service-role client).
--
-- Idempotent.

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
        'authority',     c.authority,
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
        'framework_ids',     l.framework_ids,
        'authority',         l.authority
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

-- Preserve the migration-103 lockdown (CREATE OR REPLACE keeps grants, but be explicit).
revoke execute on function
  public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid)
  from authenticated;

-- Match the client (framework-config-store CORRESPONDENCE_BASED_IDS) so the
-- default pin set [sama, cma, sharia-board] resolves all three.
update public.frameworks set correspondence_based = true where id = 'sharia-board';

notify pgrst, 'reload schema';
