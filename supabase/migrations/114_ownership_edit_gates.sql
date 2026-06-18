-- 114_ownership_edit_gates
--
-- Ownership-aware edit gates for the POLICY workflow and the CIRCULAR (rule)
-- article checklist.
--
-- Product rule (confirmed): "only one person works on a rule" — the resource
-- OWNER may drive their own workflow / edit their own checklist even WITHOUT the
-- global `edit` permission, while everyone else still needs `edit` (managers and
-- admins hold it via their role; officers via the access matrix). Ownership is:
--   • policies.owner_id        (the policy owner)
--   • circulars.assigned_to    (the single assignee of a rule)
--
-- This MIRRORS the API route guards (policies/[id]/workflow/advance,
-- circulars/[id]/.../checklist/[itemId]) and the client gates
-- (canAdvancePolicyWorkflow / canEditCircular) so all three layers agree.
--
-- The two mutation flows also write the PARENT rows via recompute helpers
-- (recomputeCircularProgress → circulars; advance → policies + policy_review_cycles),
-- so those policies are widened to the owner too — otherwise the owner's write
-- would silently match 0 rows under the old `edit`-only RLS. Route handlers keep
-- their own `requirePerm`/ownership checks, so this widening does not open any
-- new write path: it only lets the already-authorised owner flows complete.
--
-- Idempotent (drop + recreate).

-- ── Policies ────────────────────────────────────────────────────────────────
drop policy if exists policies_update on public.policies;
create policy policies_update on public.policies for update to authenticated
  using (public.has_permission('edit') or owner_id = auth.uid())
  with check (public.has_permission('edit') or owner_id = auth.uid());

drop policy if exists policy_workflow_steps_modify on public.policy_workflow_steps;
create policy policy_workflow_steps_modify on public.policy_workflow_steps for all to authenticated
  using (
    public.has_permission('edit')
    or exists (
      select 1 from public.policies p
      where p.id = policy_workflow_steps.policy_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or exists (
      select 1 from public.policies p
      where p.id = policy_workflow_steps.policy_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists policy_review_cycles_modify on public.policy_review_cycles;
create policy policy_review_cycles_modify on public.policy_review_cycles for all to authenticated
  using (
    public.has_permission('edit')
    or exists (
      select 1 from public.policies p
      where p.id = policy_review_cycles.policy_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or exists (
      select 1 from public.policies p
      where p.id = policy_review_cycles.policy_id and p.owner_id = auth.uid()
    )
  );

-- ── Circulars (rules) ───────────────────────────────────────────────────────
drop policy if exists circulars_update on public.circulars;
create policy circulars_update on public.circulars for update to authenticated
  using (public.has_permission('edit') or assigned_to = auth.uid())
  with check (public.has_permission('edit') or assigned_to = auth.uid());

drop policy if exists article_checklist_items_modify on public.article_checklist_items;
create policy article_checklist_items_modify on public.article_checklist_items for all to authenticated
  using (
    public.has_permission('edit')
    or exists (
      select 1 from public.circular_articles a
      join public.circulars c on c.id = a.circular_id
      where a.id = article_checklist_items.article_id and c.assigned_to = auth.uid()
    )
  )
  with check (
    public.has_permission('edit')
    or exists (
      select 1 from public.circular_articles a
      join public.circulars c on c.id = a.circular_id
      where a.id = article_checklist_items.article_id and c.assigned_to = auth.uid()
    )
  );

notify pgrst, 'reload schema';
