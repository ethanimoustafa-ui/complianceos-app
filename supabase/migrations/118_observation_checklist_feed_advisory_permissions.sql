-- 118_observation_checklist_feed_advisory_permissions
--
-- Adds three more GRANULAR permission families and exposes them through the
-- Access Matrix (per-user grants in user_permissions) + the role tiers
-- (role_permissions). Before this:
--   • the observation REMEDIATION CHECKLIST was gated only by `observation:edit`
--     + observation membership (leader/assignee) — there was no separately
--     grantable checklist capability like circular/risk have.
--   • the correspondence FEED (public.correspondence) and ADVISORY
--     (public.advisory_requests) create/edit/delete were gated by the generic
--     `create`/`edit`/`delete` keys only, so the matrix couldn't grant or
--     withhold them per-entity.
--
-- New keys (7):
--   observation:checklist
--   feed:create     feed:edit     feed:delete        (public.correspondence)
--   advisory:create advisory:edit advisory:delete    (public.advisory_requests)
--
-- VERIFIED TABLE NAMES (checked against the live schema, project
-- qdbitfgxbnbzkqhdoepd, before writing — NOT guessed; cf. the migration-115
-- sama_letters mistake):
--   • Feed                  → public.correspondence
--   • Advisory              → public.advisory_requests
--   • Observation checklist → public.observation_checklist  (dedicated table,
--                              one row per item; backs /api/observations/[id]/checklist)
--
-- Enforcement model (route + RLS agree, mirrors migrations 115/117):
--   • FEED / ADVISORY create/edit/delete API routes now call
--       requireAnyPerm(['<entity>:<action>', '<legacy generic key>']) — the
--       granular key OR the generic key the role tiers carry. RLS on the two
--       main tables is widened to OR-in the granular key so a user granted ONLY
--       the granular key (no generic key) still passes the row-level check.
--   • OBSERVATION:CHECKLIST — gated at the ROUTE layer (the observation
--       checklist POST/PATCH/DELETE handlers accept observation:checklist OR
--       observation:edit + membership). For a checklist-only grantee (no
--       observation:edit, not a member) to actually write, the
--       observation_checklist RLS — which gated `observation:edit` only — is
--       widened to OR-in observation:checklist. The route remains the primary
--       gate (membership is still enforced for non-checklist-key writers).
--       No parent-table recompute write happens from this route (checklist items
--       live entirely in observation_checklist), so only that one table changes.
--
-- Role seeding (mirrors auditor < officer < manager = admin):
--   • auditor : NONE of the new keys.
--   • officer : feed:create/edit, advisory:create/edit, observation:checklist
--               (NOT feed:delete / advisory:delete — officers never delete, per
--               the migration-115 no-delete convention).
--   • manager : all 7.
--   • admin   : all 7.
--
-- The custom_access_token_hook (028) + has_permission() (038) derive from the
-- permissions/role_permissions/user_permissions tables generically, so they pick
-- the new keys up automatically — no hook edits. (Existing sessions must refresh
-- their token to receive newly-granted keys in app_metadata.)
--
-- Idempotent.

-- ── 1. Permission keys ────────────────────────────────────────────────────────
insert into public.permissions (key, name) values
  ('observation:checklist', 'Manage Observation Checklist'),
  ('feed:create',           'Create Correspondence'),
  ('feed:edit',             'Edit Correspondence'),
  ('feed:delete',           'Delete Correspondence'),
  ('advisory:create',       'Create Advisory Requests'),
  ('advisory:edit',         'Edit Advisory Requests'),
  ('advisory:delete',       'Delete Advisory Requests')
on conflict (key) do nothing;

-- ── 2. Role seeding ───────────────────────────────────────────────────────────
-- officer: create + edit on feed/advisory + observation:checklist (NO delete).
insert into public.role_permissions (role_key, permission_key) values
  ('officer','observation:checklist'),
  ('officer','feed:create'),    ('officer','feed:edit'),
  ('officer','advisory:create'),('officer','advisory:edit')
on conflict do nothing;

-- manager + admin: all 7 new keys (admin-level). Seed from the permission rows
-- so this stays correct if the list above ever grows.
insert into public.role_permissions (role_key, permission_key)
  select 'manager', key from public.permissions
  where key in (
    'observation:checklist',
    'feed:create','feed:edit','feed:delete',
    'advisory:create','advisory:edit','advisory:delete')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
  select 'admin', key from public.permissions
  where key in (
    'observation:checklist',
    'feed:create','feed:edit','feed:delete',
    'advisory:create','advisory:edit','advisory:delete')
on conflict do nothing;

-- ── 3. RLS — Feed (public.correspondence) ─────────────────────────────────────
-- Re-create each write policy OR-ing the granular feed key alongside the
-- existing generic key. SELECT stays open (correspondence_select = true).
drop policy if exists correspondence_insert on public.correspondence;
create policy correspondence_insert on public.correspondence for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('feed:create'));

drop policy if exists correspondence_update on public.correspondence;
create policy correspondence_update on public.correspondence for update to authenticated
  using (public.has_permission('edit') or public.has_permission('feed:edit'))
  with check (public.has_permission('edit') or public.has_permission('feed:edit'));

drop policy if exists correspondence_delete on public.correspondence;
create policy correspondence_delete on public.correspondence for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('feed:delete'));

-- ── 4. RLS — Advisory (public.advisory_requests) ──────────────────────────────
-- Re-create each write policy OR-ing the granular advisory key. The SELECT
-- policy also surfaces soft-deleted rows to edit/delete holders — OR-in the
-- granular keys so a granular grantee keeps that same visibility.
drop policy if exists advisory_requests_insert on public.advisory_requests;
create policy advisory_requests_insert on public.advisory_requests for insert to authenticated
  with check (public.has_permission('create') or public.has_permission('advisory:create'));

drop policy if exists advisory_requests_update on public.advisory_requests;
create policy advisory_requests_update on public.advisory_requests for update to authenticated
  using (public.has_permission('edit') or public.has_permission('advisory:edit'))
  with check (public.has_permission('edit') or public.has_permission('advisory:edit'));

drop policy if exists advisory_requests_delete on public.advisory_requests;
create policy advisory_requests_delete on public.advisory_requests for delete to authenticated
  using (public.has_permission('delete') or public.has_permission('advisory:delete'));

drop policy if exists advisory_requests_select on public.advisory_requests;
create policy advisory_requests_select on public.advisory_requests for select to authenticated
  using (
    deleted_at is null
    or public.has_permission('edit') or public.has_permission('advisory:edit')
    or public.has_permission('delete') or public.has_permission('advisory:delete')
  );

-- ── 5. RLS — Observation checklist (public.observation_checklist) ──────────────
-- The checklist write route accepts observation:checklist OR observation:edit
-- (+ membership). OR-in observation:checklist so a checklist-only grantee (no
-- observation:edit) the route authorised can complete the write. The SELECT
-- policy keeps gating observation:view (read access is unchanged).
drop policy if exists observation_checklist_modify on public.observation_checklist;
create policy observation_checklist_modify on public.observation_checklist for all to authenticated
  using (public.has_permission('observation:edit') or public.has_permission('observation:checklist'))
  with check (public.has_permission('observation:edit') or public.has_permission('observation:checklist'));

notify pgrst, 'reload schema';
