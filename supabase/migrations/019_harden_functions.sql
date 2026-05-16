-- 019_harden_functions
-- Silence function_search_path_mutable advisor by pinning search_path.
-- Revoke EXECUTE from anon on SECURITY DEFINER functions where unintended.

alter function public.set_updated_at()         set search_path = public;
alter function public.gen_short_id(text)        set search_path = public;
alter function public.block_append_only_update() set search_path = public;
alter function public.invalidate_compliance_cache() set search_path = public;

revoke execute on function public.has_permission(text) from anon, public;
revoke execute on function public.claim_jobs(integer)  from anon, public;
revoke execute on function public.handle_new_user()    from anon, public, authenticated;
