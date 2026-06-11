-- 095_open_risk_category_constraint
--
-- Allow custom risk categories (user-extensible via the risk_categories
-- lookup — the Risk Register page offers those keys in its category picker,
-- e.g. 'cybersecurity-risk' seeded by 034). The original CHECK from 009 only
-- accepted the five legacy slugs, so every server-seeded category 400'd on
-- create. Mirrors 037_open_policy_constraints. The Zod schema is loosened in
-- tandem (src/lib/api/schemas/risks.ts).

alter table public.risks drop constraint if exists risks_category_check;
alter table public.risks add constraint risks_category_check check (char_length(category) between 1 and 100);

notify pgrst, 'reload schema';
