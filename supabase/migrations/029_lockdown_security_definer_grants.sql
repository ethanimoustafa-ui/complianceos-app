-- 029_lockdown_security_definer_grants
--
-- Addresses the `authenticated_security_definer_function_executable` advisor
-- warnings on the 3 SECURITY DEFINER RPCs we expose under /rest/v1/rpc.
--
-- Decisions:
--   * claim_jobs            — cron-worker only. Service-role calls it. Revoke from public, anon, authenticated.
--   * has_permission        — see migration 031 below: we ORIGINALLY revoked it here,
--                             but that broke ~80 RLS policies because Postgres evaluates
--                             policy predicate functions with the CALLER's privileges,
--                             not the policy owner's. The follow-up migration 031
--                             restores authenticated EXECUTE. The advisor lint that
--                             re-appears is intentional and acceptable.
--   * compute_compliance_inputs — called from gather-inputs.ts under the user's JWT.
--                                 Keep authenticated, revoke anon + public.
--
-- Idempotent. REVOKEs are safe to re-run.

revoke execute on function public.claim_jobs(integer) from public, anon, authenticated;
revoke execute on function public.has_permission(text) from public, anon, authenticated;
revoke execute on function public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid) from public, anon;

notify pgrst, 'reload schema';
