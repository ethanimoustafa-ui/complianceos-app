-- Wave-18 — port of GAP-13 to the Policies page. Structured per-field diff
-- jsonb column on the policy_versions table so the Version-History tab can
-- render a Field / From / To diff (mirror of circular_versions + article_versions).
alter table policy_versions add column if not exists field_changes jsonb;
