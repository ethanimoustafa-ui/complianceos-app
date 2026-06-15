-- 103_secure_compute_compliance_inputs
-- Scalability/security audit finding C4.
--
-- public.compute_compliance_inputs(...) is SECURITY DEFINER and aggregates
-- org-wide compliance data (audits/observations/risks/policies/training/
-- circulars/letters/frameworks/settings/pins) bypassing RLS. EXECUTE was
-- granted to `authenticated`, so ANY signed-in user could call
--   POST /rest/v1/rpc/compute_compliance_inputs
-- with the anon key + their JWT and read org-wide compliance data — and force a
-- full-table aggregation by passing a wide period window (the framework/dept
-- args are ignored by the function body).
--
-- The application now invokes this RPC through the service-role admin client
-- (src/lib/api/services/scoring/gather-inputs.ts -> fetchViaRpc), gated at the
-- route layer. So revoke direct access from `authenticated`. `service_role`
-- (used by the admin client) and `postgres` retain EXECUTE; `anon` never had it.

revoke execute on function
  public.compute_compliance_inputs(timestamptz, timestamptz, uuid, uuid)
  from authenticated;
