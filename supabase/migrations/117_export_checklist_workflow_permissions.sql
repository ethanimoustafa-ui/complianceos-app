-- 117_export_checklist_workflow_permissions
--
-- Adds three families of GRANULAR permission keys and exposes them through the
-- Access Matrix (per-user grants in user_permissions) + the role tiers
-- (role_permissions). Before this, exporting, editing entity checklists, and
-- advancing workflows were all gated by the generic `export` / `edit` keys, so
-- the matrix couldn't grant (or withhold) them per-entity.
--
-- New keys (12):
--   Per-entity EXPORT (7):
--     policy:export  circular:export  observation:export  audit:export
--     risk:export    letter:export    training:export
--   Per-entity CHECKLIST (4):
--     policy:checklist  circular:checklist  risk:checklist  audit:checklist
--   WORKFLOW (1):
--     workflow:advance
--
-- Enforcement model (mirrors migration 115 conventions):
--   • EXPORT — gated at the ROUTE layer only. /api/pdf/generate (centralised,
--     keyed by template) maps template→<entity>:export OR the legacy `export`
--     key via requireAnyPerm; the per-letter /api/letters/[id]/print-pdf route
--     gates letter:export OR export. No table RLS change — exports are reads.
--   • CHECKLIST — gated at the ROUTE layer (requireAnyPerm-style OR in the
--     handler: <entity>:checklist OR edit/audit:edit OR ownership). For a user
--     granted ONLY the checklist key (no `edit`) to actually write, the
--     checklist table's RLS — AND the parent table the recompute helper writes —
--     must also accept the checklist key, otherwise the authorised write would
--     silently match 0 rows under the `edit`-only RLS. We widen exactly those
--     two tables per entity that HAS a dedicated checklist route (circular, risk).
--     policy:checklist + audit:checklist have NO dedicated checklist route/table
--     (those checklists are edited via the parent PATCH / don't exist yet), so
--     there is nothing to widen for them — the keys are seeded for forward use
--     and client-side gating only.
--   • WORKFLOW — gated at the ROUTE layer only (workflow:advance OR edit OR
--     ownership) on the true workflow-advance routes (policies + circulars).
--     The existing workflow-step RLS (migration 114) already OR's the owner in;
--     a workflow:advance-only grantee who is NOT the owner is an
--     intentionally-rare access-matrix grant, and the policy/circular workflow
--     mutations write `policy_workflow_steps` / `circular_workflow_steps` whose
--     RLS is `edit OR owner`. We widen policies/circulars workflow-step RLS to
--     OR-in workflow:advance so such a grantee's writes complete; the route
--     remains the primary gate.
--
-- Role seeding (mirrors auditor < officer < manager = admin, migration 115):
--   • auditor : NONE of the new keys.
--   • officer : ALL 12 (the 7 exports + 4 checklists + workflow:advance).
--   • manager : all 12.
--   • admin   : all 12.
--
-- The custom_access_token_hook (028) + has_permission() (038) derive from the
-- permissions/role_permissions/user_permissions tables generically, so they
-- pick the new keys up automatically — no hook edits. (Existing sessions must
-- refresh their token to receive newly-granted keys in app_metadata.)
--
-- Idempotent.

-- ── 1. Permission keys ────────────────────────────────────────────────────────
insert into public.permissions (key, name) values
  ('policy:export',       'Export Policies'),
  ('circular:export',     'Export Rules'),
  ('observation:export',  'Export Observations'),
  ('audit:export',        'Export Audits'),
  ('risk:export',         'Export Risks'),
  ('letter:export',       'Export Letters'),
  ('training:export',     'Export Training'),
  ('policy:checklist',    'Manage Policy Checklist'),
  ('circular:checklist',  'Manage Rule Checklist'),
  ('risk:checklist',      'Manage Risk Checklist'),
  ('audit:checklist',     'Manage Audit Checklist'),
  ('workflow:advance',    'Advance Workflow Steps')
on conflict (key) do nothing;

-- ── 2. Role seeding ───────────────────────────────────────────────────────────
-- officer: ALL 12 new keys (export + checklist + workflow:advance).
insert into public.role_permissions (role_key, permission_key)
  select 'officer', key from public.permissions
  where key in (
    'policy:export','circular:export','observation:export','audit:export',
    'risk:export','letter:export','training:export',
    'policy:checklist','circular:checklist','risk:checklist','audit:checklist',
    'workflow:advance')
on conflict do nothing;

-- manager + admin: all 12 (admin-level). Seed from the permission rows so this
-- stays correct if the list above ever grows.
insert into public.role_permissions (role_key, permission_key)
  select 'manager', key from public.permissions
  where key in (
    'policy:export','circular:export','observation:export','audit:export',
    'risk:export','letter:export','training:export',
    'policy:checklist','circular:checklist','risk:checklist','audit:checklist',
    'workflow:advance')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
  where key in (
    'policy:export','circular:export','observation:export','audit:export',
    'risk:export','letter:export','training:export',
    'policy:checklist','circular:checklist','risk:checklist','audit:checklist',
    'workflow:advance')
on conflict do nothing;

-- ── 3. RLS — widen checklist + recompute-parent tables for checklist-only grantees ─
-- Only the entities with a DEDICATED checklist mutation route are widened
-- (circular, risk). Each predicate OR's the granular checklist key alongside the
-- existing `edit`/ownership predicate, so a user granted ONLY <entity>:checklist
-- via the Access Matrix (no `edit`) can complete the write the route already
-- authorised. The parent entity PATCH/DELETE routes gate on <entity>:edit / edit
-- (NOT the checklist key), so this widening does NOT open a general-edit path —
-- a checklist-only grantee still cannot edit arbitrary entity fields. Mirrors
-- the migration-114/115 owner-write widening + its rationale.

-- Circular article checklist (route: circulars/[id]/implementations/[id]/checklist) -
drop policy if exists article_checklist_items_modify on public.article_checklist_items;
create policy article_checklist_items_modify on public.article_checklist_items for all to authenticated
  using (
    public.has_permission('edit')
    or public.has_permission('circular:checklist')
    or exists (
      select 1 from public.circular_articles a
      join public.circulars c on c.id = a.circular_id
      where a.id = article_checklist_items.article_id and c.assigned_to = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or public.has_permission('circular:checklist')
    or exists (
      select 1 from public.circular_articles a
      join public.circulars c on c.id = a.circular_id
      where a.id = article_checklist_items.article_id and c.assigned_to = auth.uid()
    )
  );

-- NOTE: recomputeCircularProgress() (triggered by the circular checklist route)
-- UPDATEs public.circulars, so circulars_update must also OR-in circular:checklist.
-- The circular WORKFLOW-advance route recomputes circulars too, so it must also
-- OR-in workflow:advance. Both are folded into a SINGLE circulars_update
-- definition in Part 4 below (drop+recreate once, all OR clauses) to avoid an
-- intermediate policy.

-- Risk mitigation checklist (route: risks/[id]/checklist) ----------------------
drop policy if exists risk_mitigation_checklist_modify on public.risk_mitigation_checklist;
create policy risk_mitigation_checklist_modify on public.risk_mitigation_checklist for all to authenticated
  using (public.has_permission('edit') or public.has_permission('risk:checklist'))
  with check (public.has_permission('edit') or public.has_permission('risk:checklist'));

-- The risk checklist PATCH/DELETE also UPDATEs public.risks (mitigation_progress
-- + terminal status). OR-in the checklist key so the recompute write completes.
-- (Re-creates the migration-115 predicate with risk:checklist added.)
drop policy if exists risks_update on public.risks;
create policy risks_update on public.risks for update to authenticated
  using (public.has_permission('edit') or public.has_permission('risk:edit') or public.has_permission('risk:checklist'))
  with check (public.has_permission('edit') or public.has_permission('risk:edit') or public.has_permission('risk:checklist'));

-- ── 4. RLS — widen workflow-step tables for workflow:advance-only grantees ─────
-- The policy/circular workflow-advance routes write policy_workflow_steps /
-- circular_workflow_steps. Migration 114 gated those `edit OR owner`. OR-in
-- workflow:advance so a matrix grantee with only that key can complete the
-- transition the route authorised. The advance routes remain the primary gate.

-- Policy workflow steps (route: policies/[id]/workflow/advance) ----------------
drop policy if exists policy_workflow_steps_modify on public.policy_workflow_steps;
create policy policy_workflow_steps_modify on public.policy_workflow_steps for all to authenticated
  using (
    public.has_permission('edit')
    or public.has_permission('workflow:advance')
    or exists (
      select 1 from public.policies p
      where p.id = policy_workflow_steps.policy_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or public.has_permission('workflow:advance')
    or exists (
      select 1 from public.policies p
      where p.id = policy_workflow_steps.policy_id and p.owner_id = auth.uid()
    )
  );

-- The policy advance route also UPDATEs public.policies.status (+ approved_date)
-- and public.policy_review_cycles. Widen both so the workflow:advance-only
-- grantee's parent writes complete. (Re-creates the 114/115 predicates + key.)
drop policy if exists policies_update on public.policies;
create policy policies_update on public.policies for update to authenticated
  using (public.has_permission('edit') or public.has_permission('policy:edit') or public.has_permission('workflow:advance') or owner_id = auth.uid())
  with check (public.has_permission('edit') or public.has_permission('policy:edit') or public.has_permission('workflow:advance') or owner_id = auth.uid());

drop policy if exists policy_review_cycles_modify on public.policy_review_cycles;
create policy policy_review_cycles_modify on public.policy_review_cycles for all to authenticated
  using (
    public.has_permission('edit')
    or public.has_permission('workflow:advance')
    or exists (
      select 1 from public.policies p
      where p.id = policy_review_cycles.policy_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or public.has_permission('workflow:advance')
    or exists (
      select 1 from public.policies p
      where p.id = policy_review_cycles.policy_id and p.owner_id = auth.uid()
    )
  );

-- Circular workflow steps (route: circulars/[id]/workflow/advance) -------------
-- The circular advance route writes circular_workflow_steps and recomputes
-- circulars. This is the SINGLE authoritative circulars_update definition: it
-- re-creates the migration-115 predicate (edit / circular:edit / assigned_to)
-- and OR's in BOTH circular:checklist (recompute from the checklist route) and
-- workflow:advance (recompute from the advance route). Then widen the
-- workflow-step policy itself.
drop policy if exists circulars_update on public.circulars;
create policy circulars_update on public.circulars for update to authenticated
  using (public.has_permission('edit') or public.has_permission('circular:edit') or public.has_permission('circular:checklist') or public.has_permission('workflow:advance') or assigned_to = auth.uid())
  with check (public.has_permission('edit') or public.has_permission('circular:edit') or public.has_permission('circular:checklist') or public.has_permission('workflow:advance') or assigned_to = auth.uid());

-- circular_workflow_steps had no ownership-aware policy from 114 (its advance
-- route was `requirePerm('edit')`). Recreate idempotently as edit OR
-- workflow:advance so the matrix grantee can advance. SELECT stays open.
drop policy if exists circular_workflow_steps_modify on public.circular_workflow_steps;
create policy circular_workflow_steps_modify on public.circular_workflow_steps for all to authenticated
  using (public.has_permission('edit') or public.has_permission('workflow:advance'))
  with check (public.has_permission('edit') or public.has_permission('workflow:advance'));

notify pgrst, 'reload schema';
