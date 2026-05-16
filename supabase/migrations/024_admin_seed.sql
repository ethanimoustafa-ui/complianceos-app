-- Dev / test admin user seed.
-- Runs as a single transaction. Idempotent: re-running rotates the password but keeps the same auth.users row if email exists.
--
-- IMPORTANT: this file is intended for DEV / staging only. Do NOT apply against production.
-- Production accounts are created via Supabase Studio or via the admin invite Route Handler.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@complianceos.local';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    -- Important: GoTrue's Go SQL scanner cannot read NULL on the various *_token columns;
    -- they must be empty strings.
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'admin@complianceos.local',
      crypt('ComplianceOS!2026', gen_salt('bf')), now(),
      '{"full_name":"ComplianceOS Admin"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      'authenticated', 'authenticated', now(), now(),
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'admin@complianceos.local'),
      'email', v_user_id::text, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('ComplianceOS!2026', gen_salt('bf')),
           email_confirmed_at = now(),
           confirmation_token = COALESCE(confirmation_token, ''),
           recovery_token = COALESCE(recovery_token, ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           email_change = COALESCE(email_change, ''),
           phone_change = COALESCE(phone_change, ''),
           phone_change_token = COALESCE(phone_change_token, ''),
           email_change_token_current = COALESCE(email_change_token_current, ''),
           reauthentication_token = COALESCE(reauthentication_token, ''),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- Profile row (handle_new_user trigger creates it on INSERT; this is the UPDATE path).
  UPDATE public.profiles
     SET name = 'ComplianceOS Admin',
         role = 'org_admin',
         status = 'active',
         preferred_language = 'en',
         updated_at = now()
   WHERE id = v_user_id;

  -- Grant org_admin role
  INSERT INTO public.user_roles (user_id, role_key)
  VALUES (v_user_id, 'org_admin')
  ON CONFLICT DO NOTHING;
END $$;
