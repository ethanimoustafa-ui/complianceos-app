-- Wave-19.4 / Item-3 — dual-store on the version-history tables.
--
-- The single-language `changes` column on `circular_versions`,
-- `article_versions`, and `policy_versions` used to hold a `{k,p}` JSON
-- payload (Rules) or a free-text "Policy updated — …" string (Policies),
-- rendered on the client by parsing the JSON or substituting embedded i18n
-- keys. Migration 056 already retired this pattern for timeline rows; this
-- migration finishes the job for version-history rows.
--
-- Writers (`insertCircularVersion`, `insertArticleVersion`,
-- `insertPolicyVersion`) now persist BOTH rendered languages at write time
-- via `renderBilingual`. The reader picks `text_en` vs `text_ar` based on
-- the current locale — no JSON parse, no regex.
--
-- The structured per-field diff (`field_changes` jsonb) is unchanged — only
-- the summary string moved to dual-store.

delete from circular_versions;
delete from article_versions;
delete from policy_versions;

alter table circular_versions drop column if exists changes,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table circular_versions alter column text_en drop default,
  alter column text_ar drop default;

alter table article_versions drop column if exists changes,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table article_versions alter column text_en drop default,
  alter column text_ar drop default;

alter table policy_versions drop column if exists changes,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table policy_versions alter column text_en drop default,
  alter column text_ar drop default;
