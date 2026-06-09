-- 090 — dev/test user seed (W38): three additional users so multi-user flows
-- (assignee pickers, remediation review, closure review — both of which block
-- self-review) are testable. Mirrors the 024_admin_seed pattern, including the
-- GoTrue empty-string token-column gotcha.
--
-- DEV / staging only. Do NOT apply against production.
--
--   officer@complianceos.local  ComplianceOS!2026  compliance_officer  Compliance
--   auditor@complianceos.local  ComplianceOS!2026  auditor             Internal Audit
--   viewer@complianceos.local   ComplianceOS!2026  viewer              Legal

DO $$
DECLARE
  rec record;
  v_user_id uuid;
  v_dept uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('officer@complianceos.local', 'Sara Al-Otaibi',   'compliance_officer', 'compliance'),
      ('auditor@complianceos.local', 'Khalid Al-Harbi',  'auditor',            'audit'),
      ('viewer@complianceos.local',  'Noura Al-Qahtani', 'viewer',             'legal')
    ) AS t(email, full_name, role_key, dept_key)
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = rec.email;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      -- GoTrue's scanner cannot read NULL on the *_token columns — empty strings.
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token
      ) VALUES (
        v_user_id, '00000000-0000-0000-0000-000000000000', rec.email,
        crypt('ComplianceOS!2026', gen_salt('bf')), now(),
        jsonb_build_object('full_name', rec.full_name),
        '{"provider":"email","providers":["email"]}'::jsonb,
        'authenticated', 'authenticated', now(), now(),
        '', '', '', '', '', '', '', ''
      );
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', rec.email),
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

    -- Resolve the department by stable key (085 enforces partial uniqueness).
    SELECT id INTO v_dept FROM public.departments WHERE key = rec.dept_key LIMIT 1;

    -- Profile row exists via the handle_new_user trigger; enrich it.
    UPDATE public.profiles
       SET name = rec.full_name,
           role = rec.role_key,
           status = 'active',
           preferred_language = 'en',
           department_id = v_dept,
           updated_at = now()
     WHERE id = v_user_id;

    INSERT INTO public.user_roles (user_id, role_key)
    VALUES (v_user_id, rec.role_key)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
