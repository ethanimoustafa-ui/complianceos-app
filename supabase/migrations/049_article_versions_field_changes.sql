-- 049_article_versions_field_changes.sql
--
-- GAP-13 — Article Version History 3-column diff (Story 6.4). Adds a nullable
-- `field_changes jsonb` column to `article_versions` so the implementations
-- PATCH route can persist a structured `[{ field, from, to }]` array alongside
-- the existing human-readable `changes` summary string. The Version History
-- tab renders this as a Field / From / To table; pre-existing Wave-9 rows have
-- a NULL `field_changes` and keep showing the summary text only.
--
-- This DDL was already applied to the DB on 2026-05-22; this file exists so
-- the repo's migration history matches the live schema.

alter table article_versions add column if not exists field_changes jsonb;
