-- 069_seed_test_users.sql
-- W25-I2: Seed two test user profiles for approval-flow QA:
--   • test-manager@complianceos.dev  — role: compliance_officer (→ manager in UI)
--   • test-employee@complianceos.dev — role: auditor            (→ officer in UI)
--
-- DB roles map: org_admin→admin, compliance_officer→manager, auditor/viewer→officer
--
-- IMPORTANT: These profiles need matching Supabase Auth users to enable login.
-- Create them in Supabase Dashboard → Auth → Users → Add User with the same
-- UUIDs listed below, or use the Auth API:
--   Email: test-manager@complianceos.dev   Password: TestManager123!
--   Email: test-employee@complianceos.dev  Password: TestEmployee123!
--
-- Idempotent: ON CONFLICT DO UPDATE.

insert into public.profiles
  (id, email, name, role, status, preferred_language, workload, nationality, created_at, updated_at)
values
  (
    '00000000-0001-4000-a000-000000000001',
    'test-manager@complianceos.dev',
    'Test Manager',
    'compliance_officer',
    'active',
    'en',
    30,
    'Saudi',
    now(),
    now()
  ),
  (
    '00000000-0002-4000-a000-000000000002',
    'test-employee@complianceos.dev',
    'Test Employee',
    'auditor',
    'active',
    'en',
    20,
    'Saudi',
    now(),
    now()
  )
on conflict (id) do update
  set
    name               = excluded.name,
    role               = excluded.role,
    status             = excluded.status,
    preferred_language = excluded.preferred_language,
    updated_at         = now();

-- Seed backend permissions for test-manager (compliance_officer tier).
insert into public.user_permissions (user_id, permission_key, granted, granted_by)
values
  ('00000000-0001-4000-a000-000000000001', 'view',               true, null),
  ('00000000-0001-4000-a000-000000000001', 'create',             true, null),
  ('00000000-0001-4000-a000-000000000001', 'edit',               true, null),
  ('00000000-0001-4000-a000-000000000001', 'audit:view',         true, null),
  ('00000000-0001-4000-a000-000000000001', 'audit:create',       true, null),
  ('00000000-0001-4000-a000-000000000001', 'audit:edit',         true, null),
  ('00000000-0001-4000-a000-000000000001', 'observation:view',   true, null),
  ('00000000-0001-4000-a000-000000000001', 'observation:create', true, null),
  ('00000000-0001-4000-a000-000000000001', 'observation:edit',   true, null),
  ('00000000-0001-4000-a000-000000000001', 'report:view',        true, null),
  ('00000000-0001-4000-a000-000000000001', 'report:create',      true, null),
  ('00000000-0001-4000-a000-000000000001', 'export',             true, null),
  -- test-employee (auditor/officer tier) — view + limited create
  ('00000000-0002-4000-a000-000000000002', 'view',               true, null),
  ('00000000-0002-4000-a000-000000000002', 'audit:view',         true, null),
  ('00000000-0002-4000-a000-000000000002', 'observation:view',   true, null),
  ('00000000-0002-4000-a000-000000000002', 'observation:create', true, null),
  ('00000000-0002-4000-a000-000000000002', 'observation:edit',   true, null),
  ('00000000-0002-4000-a000-000000000002', 'report:view',        true, null),
  ('00000000-0002-4000-a000-000000000002', 'export',             true, null)
on conflict (user_id, permission_key) do update
  set granted = excluded.granted;
