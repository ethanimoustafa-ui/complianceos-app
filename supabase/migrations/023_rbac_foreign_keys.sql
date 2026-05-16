-- Add missing foreign keys for the RBAC text-key chain.
-- These let PostgREST auto-embed user_roles → roles → role_permissions → permissions.
-- Data-consistency expected to be intact (seed is fresh and authoritative).

-- 1) user_roles.role_key -> roles.key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conname = 'user_roles_role_key_fkey'
  ) THEN
    -- ensure roles.key is referenceable (must be UNIQUE/PK)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.roles'::regclass
        AND contype IN ('p','u')
        AND pg_get_constraintdef(oid) ~ 'UNIQUE.*\(key\)|PRIMARY KEY.*\(key\)'
    ) THEN
      ALTER TABLE public.roles ADD CONSTRAINT roles_key_unique UNIQUE (key);
    END IF;
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_role_key_fkey
      FOREIGN KEY (role_key) REFERENCES public.roles(key) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- 2) role_permissions.role_key -> roles.key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conname = 'role_permissions_role_key_fkey'
  ) THEN
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_role_key_fkey
      FOREIGN KEY (role_key) REFERENCES public.roles(key) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- 3) role_permissions.permission_key -> permissions.key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conname = 'role_permissions_permission_key_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.permissions'::regclass
        AND contype IN ('p','u')
        AND pg_get_constraintdef(oid) ~ 'UNIQUE.*\(key\)|PRIMARY KEY.*\(key\)'
    ) THEN
      ALTER TABLE public.permissions ADD CONSTRAINT permissions_key_unique UNIQUE (key);
    END IF;
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_permission_key_fkey
      FOREIGN KEY (permission_key) REFERENCES public.permissions(key) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Tell PostgREST to refresh its schema cache
NOTIFY pgrst, 'reload schema';
