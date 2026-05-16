-- 037_open_policy_constraints
--
-- Allow custom policy categories + approval tiers (user-extensible via
-- Settings → Policy Categories). The Zod schema is loosened in tandem.

alter table public.policies drop constraint if exists policies_category_check;
alter table public.policies add constraint policies_category_check check (char_length(category) between 1 and 100);

alter table public.policies drop constraint if exists policies_approval_tier_check;
alter table public.policies add constraint policies_approval_tier_check check (char_length(approval_tier) between 1 and 100);

notify pgrst, 'reload schema';
