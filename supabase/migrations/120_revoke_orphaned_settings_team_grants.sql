-- 120: Revoke orphaned settings:* / team:* per-user grants from non-admin/manager
-- members.
--
-- The Access Matrix used to expose "Manage Settings" (→ settings:edit,
-- settings:view) and "Manage Team & Permissions" (→ team:edit/invite/remove/view)
-- as grantable toggles for officers/auditors. Those toggles were removed:
--   • the Settings page is open to EVERY signed-in user (sections self-gate on
--     frameworks:config / lists:config), so a blanket settings grant is redundant;
--   • the Team Directory is role-gated to managers/admins, so granting team:* to
--     an officer is a no-op in the UI but still LIVE server-side.
--
-- Any officer/auditor previously granted these now holds the backend keys in
-- user_permissions with NO toggle left to revoke them — a silent, un-removable
-- escalation. This one-time cleanup deletes those grants. Managers/admins receive
-- these capabilities via their ROLE (role_permissions), never via user_permissions,
-- so they are unaffected; we still scope the DELETE to non-admin/manager members
-- to be safe.

delete from public.user_permissions up
using public.profiles pr
where up.user_id = pr.id
  and pr.role not in ('admin', 'manager')
  and up.permission_key in (
    'settings:edit',
    'settings:view',
    'team:edit',
    'team:invite',
    'team:remove',
    'team:view'
  );
