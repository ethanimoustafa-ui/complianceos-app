-- 030_settings_onboarding_state
-- Adds an onboarding-state JSONB column to compliance_settings (singleton).
--
-- Layout:
--   {
--     "completed": false,
--     "completed_at": null,
--     "steps": { "<stepKey>": { "completed_at": "...", "payload": { ... } } }
--   }
--
-- The /api/settings/onboarding endpoints read and update this column.

alter table public.compliance_settings
  add column if not exists onboarding_state jsonb not null
    default '{"completed":false,"completed_at":null,"steps":{}}'::jsonb;
