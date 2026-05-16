-- 031_restore_has_permission_execute
--
-- ROLLBACK fragment of 029: that migration revoked EXECUTE on has_permission(text)
-- from authenticated, which broke every RLS policy that calls public.has_permission(...)
-- because Postgres evaluates policy predicate functions with the caller's
-- privileges, not the policy owner's.
--
-- Restoring authenticated EXECUTE here. The advisor warning
-- `authenticated_security_definer_function_executable` will re-appear for
-- has_permission(text) — that's intentional and acceptable: the function
-- only reads RBAC tables which are themselves protected by RLS, and it is
-- load-bearing for ~80 RLS policies on tables like audits, observations,
-- policies, risks, circulars, training_courses, etc.
--
-- NOTE on file naming: the DB tracks this migration under the name
-- `030_restore_has_permission_execute` (it was applied before we discovered
-- the local filename collision with `030_settings_onboarding_state.sql`).
-- For local replay this file is numbered 031 to preserve ordering on disk;
-- the migration content is identical.

grant execute on function public.has_permission(text) to authenticated;
notify pgrst, 'reload schema';
