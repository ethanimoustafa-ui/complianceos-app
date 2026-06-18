-- 115_granular_entity_permissions
--
-- Adds GRANULAR, per-entity create / edit / delete permission keys and exposes
-- them through the Access Matrix (per-user grants in user_permissions) and the
-- role tiers (role_permissions). Before this, only audits + observations had
-- granular keys; policies, rules (circulars), risks, letters and training were
-- gated by the generic `create` / `edit` / `delete` keys, so the matrix could
-- only grant blanket create/edit/delete across every entity at once.
--
-- New keys (15):
--   policy:create  policy:edit  policy:delete
--   circular:create circular:edit circular:delete   (rules)
--   risk:create    risk:edit    risk:delete
--   letter:create  letter:edit  letter:delete
--   training:create training:edit training:delete
--
-- Enforcement model (route + RLS agree):
--   • Entity create/edit/delete API routes now call requireAnyPerm([
--       '<entity>:<action>', '<legacy generic key>' ]) — the granular key OR the
--       generic key the role tiers already carry. Nothing that worked before
--       breaks (officers/managers/admins keep their generic create/edit/delete).
--   • RLS on the MAIN entity tables is widened to OR-in the granular key, so a
--     user granted ONLY the granular key in the matrix (no generic key) still
--     passes the row-level check. The migration-114 owner predicates are
--     preserved (re-created with the granular key OR'd in).
--
-- Role seeding (mirrors the existing tiers auditor < officer < manager = admin):
--   • auditor : none of the new keys (read access stays via `view`).
--   • officer : create + edit on every entity (NOT delete) — matches officer
--               holding audit:create/edit but not audit:delete today.
--   • manager : all 15 (admin-level).
--   • admin   : all 15.
--
-- The custom_access_token_hook (028) and has_permission() (038) derive from
-- permissions/role_permissions/user_permissions generically, so they pick the
-- new keys up automatically — no hook edits required. (Existing sessions must
-- refresh their token to receive newly-granted keys in app_metadata.)
--
-- Idempotent.

-- ── 1. Permission keys ────────────────────────────────────────────────────────
insert into public.permissions (key, name) values
  ('policy:create',   'Create Policies'),
  ('policy:edit',     'Edit Policies'),
  ('policy:delete',   'Delete Policies'),
  ('circular:create', 'Create Rules'),
  ('circular:edit',   'Edit Rules'),
  ('circular:delete', 'Delete Rules'),
  ('risk:create',     'Create Risks'),
  ('risk:edit',       'Edit Risks'),
  ('risk:delete',     'Delete Risks'),
  ('letter:create',   'Create Letters'),
  ('letter:edit',     'Edit Letters'),
  ('letter:delete',   'Delete Letters'),
  ('training:create', 'Create Training'),
  ('training:edit',   'Edit Training'),
  ('training:delete', 'Delete Training')
on conflict (key) do nothing;

-- ── 2. Role seeding ───────────────────────────────────────────────────────────
-- officer: create + edit on every entity (no delete).
insert into public.role_permissions (role_key, permission_key) values
  ('officer','policy:create'),  ('officer','policy:edit'),
  ('officer','circular:create'),('officer','circular:edit'),
  ('officer','risk:create'),    ('officer','risk:edit'),
  ('officer','letter:create'),  ('officer','letter:edit'),
  ('officer','training:create'),('officer','training:edit')
on conflict do nothing;

-- manager + admin: all 15 new keys (admin-level). Seed from the freshly-inserted
-- permission rows so this stays correct if the list above ever grows.
insert into public.role_permissions (role_key, permission_key)
  select 'manager', key from public.permissions
  where key in (
    'policy:create','policy:edit','policy:delete',
    'circular:create','circular:edit','circular:delete',
    'risk:create','risk:edit','risk:delete',
    'letter:create','letter:edit','letter:delete',
    'training:create','training:edit','training:delete')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
  where key in (
    'policy:create','policy:edit','policy:delete',
    'circular:create','circular:edit','circular:delete',
    'risk:create','risk:edit','risk:delete',
    'letter:create','letter:edit','letter:delete',
    'training:create','training:edit','training:delete')
on conflict do nothing;

-- ── 3. RLS — widen MAIN entity tables to accept the granular key ──────────────
-- Each policy is dropped + recreated, OR-ing the granular key alongside the
-- existing generic key (and, for policies/circulars, the migration-114 owner
-- predicate). Only the top-level entity tables change; sub-resource policies
-- (workflow steps, checklists, attachments…) keep their generic `edit` gate.

-- Policies ---------------------------------------------------------------------
drop policy if exists policies_insert on public.policies;
create policy policies_insert on public.policies for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('policy:create'));

-- Re-create the migration-114 owner-aware update policy, OR-ing the granular key.
drop policy if exists policies_update on public.policies;
create policy policies_update on public.policies for update to authenticated
  using (public.has_permission('edit') or public.has_permission('policy:edit') or owner_id = auth.uid())
  with check (public.has_permission('edit') or public.has_permission('policy:edit') or owner_id = auth.uid());

drop policy if exists policies_delete on public.policies;
create policy policies_delete on public.policies for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('policy:delete'));

-- Circulars (rules) ------------------------------------------------------------
drop policy if exists circulars_insert on public.circulars;
create policy circulars_insert on public.circulars for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('circular:create'));

-- Re-create the migration-114 owner-aware update policy, OR-ing the granular key.
drop policy if exists circulars_update on public.circulars;
create policy circulars_update on public.circulars for update to authenticated
  using (public.has_permission('edit') or public.has_permission('circular:edit') or assigned_to = auth.uid())
  with check (public.has_permission('edit') or public.has_permission('circular:edit') or assigned_to = auth.uid());

drop policy if exists circulars_delete on public.circulars;
create policy circulars_delete on public.circulars for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('circular:delete'));

-- Risks ------------------------------------------------------------------------
drop policy if exists risks_insert on public.risks;
create policy risks_insert on public.risks for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('risk:create'));

drop policy if exists risks_update on public.risks;
create policy risks_update on public.risks for update to authenticated
  using (public.has_permission('edit') or public.has_permission('risk:edit'))
  with check (public.has_permission('edit') or public.has_permission('risk:edit'));

drop policy if exists risks_delete on public.risks;
create policy risks_delete on public.risks for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('risk:delete'));

-- Letters (the table is public.letters, policies letters_*) --------------------
drop policy if exists letters_insert on public.letters;
create policy letters_insert on public.letters for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('letter:create'));

drop policy if exists letters_update on public.letters;
create policy letters_update on public.letters for update to authenticated
  using (public.has_permission('edit') or public.has_permission('letter:edit'))
  with check (public.has_permission('edit') or public.has_permission('letter:edit'));

drop policy if exists letters_delete on public.letters;
create policy letters_delete on public.letters for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('letter:delete'));

-- Training courses -------------------------------------------------------------
drop policy if exists training_courses_insert on public.training_courses;
create policy training_courses_insert on public.training_courses for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('training:create'));

drop policy if exists training_courses_update on public.training_courses;
create policy training_courses_update on public.training_courses for update to authenticated
  using (public.has_permission('edit') or public.has_permission('training:edit'))
  with check (public.has_permission('edit') or public.has_permission('training:edit'));

drop policy if exists training_courses_delete on public.training_courses;
create policy training_courses_delete on public.training_courses for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('training:delete'));

notify pgrst, 'reload schema';
