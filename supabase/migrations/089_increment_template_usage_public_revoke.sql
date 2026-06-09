-- 089 — follow-up to 088: increment_template_usage_count was still callable by
-- anon because its EXECUTE came through the default PUBLIC grant (088 revoked
-- only the direct anon grant). Revoke from PUBLIC and grant back to
-- authenticated, which is the only runtime caller (post-create template-usage
-- bump in the policy create flow).
revoke execute on function public.increment_template_usage_count(uuid) from public;
grant execute on function public.increment_template_usage_count(uuid) to authenticated;
