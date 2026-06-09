-- 088 — security hardening (Supabase advisor findings, 2026-06-09)
--
-- 1) ERROR-level: `entity_templates` and `policy_workflow_step_templates` are
--    PostgREST-exposed with RLS disabled — any anon-key holder could read or
--    mutate them directly, bypassing the route-level permission gates.
--      - entity_templates: SELECT for authenticated; writes gated by
--        has_permission('settings:edit') (mirrors /api/entity-templates).
--      - policy_workflow_step_templates: SELECT for authenticated only. The
--        rows are seed/reference data (migrations 080 + 086) written by the
--        table owner (bypasses RLS); deny-by-default blocks client mutation.
-- 2) WARN: SECURITY DEFINER RPCs executable by `anon` — revoke (signed-in
--    flows only).
-- 3) WARN: role-mutable search_path on trigger/RPC functions — pin to public.

-- ── 1a. entity_templates ─────────────────────────────────────────────────────
alter table public.entity_templates enable row level security;

drop policy if exists entity_templates_select on public.entity_templates;
create policy entity_templates_select
  on public.entity_templates for select
  to authenticated
  using (true);

drop policy if exists entity_templates_insert on public.entity_templates;
create policy entity_templates_insert
  on public.entity_templates for insert
  to authenticated
  with check (public.has_permission('settings:edit'));

drop policy if exists entity_templates_update on public.entity_templates;
create policy entity_templates_update
  on public.entity_templates for update
  to authenticated
  using (public.has_permission('settings:edit'))
  with check (public.has_permission('settings:edit'));

drop policy if exists entity_templates_delete on public.entity_templates;
create policy entity_templates_delete
  on public.entity_templates for delete
  to authenticated
  using (public.has_permission('settings:edit'));

-- ── 1b. policy_workflow_step_templates ──────────────────────────────────────
alter table public.policy_workflow_step_templates enable row level security;

drop policy if exists policy_workflow_step_templates_select on public.policy_workflow_step_templates;
create policy policy_workflow_step_templates_select
  on public.policy_workflow_step_templates for select
  to authenticated
  using (true);
-- No write policies on purpose: seed data is written by migrations (owner
-- bypasses RLS); authenticated/anon writes are denied by default.

-- ── 2. SECURITY DEFINER RPC lockdown ─────────────────────────────────────────
revoke execute on function public.compute_next_circular_reference(text, integer) from anon;
revoke execute on function public.increment_template_usage_count(uuid) from anon;

-- ── 3. Pin search_path on flagged functions ──────────────────────────────────
alter function public.increment_template_usage_count(uuid) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.policies_set_is_expired() set search_path = public;
alter function public.observations_set_is_overdue() set search_path = public;
alter function public.circulars_set_is_overdue() set search_path = public;
alter function public.set_completed_at_on_status() set search_path = public;
