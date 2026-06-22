-- 124_risk_category_icon
-- Add a configurable `icon` to risk categories so Settings can set an icon
-- alongside the existing `color` column (003_system_lookups.sql). Icon is an
-- Iconify id string (e.g. 'lucide:shield'); nullable — categories without one
-- fall back to the seed/default icon in the display layer.

alter table public.risk_categories add column if not exists icon text;

notify pgrst, 'reload schema';
