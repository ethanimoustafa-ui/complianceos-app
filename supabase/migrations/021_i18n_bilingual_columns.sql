-- 021_i18n_bilingual_columns
-- Phase 8 i18n verification migration. All target lookup tables already have
-- `name_en` + `name_ar` (NOT NULL) from migration 003_system_lookups; no
-- legacy single-column `name` was ever created on these tables. This
-- migration is therefore idempotent and exists to:
--   1. Document the policy (see BACKEND-API-MAP §11).
--   2. Backfill any NULL `name_ar` defensively in case a future seed
--      omitted it (no rows match today; runs as a no-op).
--   3. Serve as a sentinel for environments that diverged.
--
-- If a future schema change introduces a `name`-only lookup, this is where
-- to add the `ALTER TABLE ... ADD COLUMN name_ar` + backfill.

-- Defensive backfill: copy `name_en` -> `name_ar` for any row where the
-- Arabic side is NULL or empty. Safe no-op on a clean DB.
update public.departments              set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.business_units           set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.authority_departments    set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.framework_sub_categories set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.policy_categories        set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.audit_categories         set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.risk_categories          set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.training_categories      set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.calendar_event_types     set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.correspondence_types     set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.letter_types             set name_ar = name_en where coalesce(trim(name_ar), '') = '';
update public.frameworks               set name_ar = name_en where coalesce(trim(name_ar), '') = '';
