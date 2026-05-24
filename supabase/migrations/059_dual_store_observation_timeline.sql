-- Wave-20 — dual-store the observation_timeline table (PORTING-TEMPLATE §2.11).
--
-- `observation_timeline` previously stored a single `description` text column
-- (plus an aside `description_ar`) populated by `writeObservationTimeline` at
-- write time. Bring it in line with the platform contract: BOTH languages are
-- rendered at WRITE time into `text_en` + `text_ar` via `renderBilingual`.
-- The reader picks the column matching the current locale — no JSON parse,
-- no regex. Mirror of migration 056 (Rules) + Policy `policy_activity_log`.
--
-- All rows are DELETED first — the legacy `description` column held free-
-- text English strings that can't be back-translated. Timeline rows are
-- append-only history, no ongoing dependency on the existing rows.
delete from observation_timeline;

alter table observation_timeline
  drop column if exists description,
  drop column if exists description_ar,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table observation_timeline
  alter column text_en drop default,
  alter column text_ar drop default;
