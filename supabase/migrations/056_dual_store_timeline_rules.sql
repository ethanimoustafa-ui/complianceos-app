-- Wave-19.1 / Q8 — dual-store the Rules timeline tables.
--
-- Until this migration, `circular_timeline.title` (+ `title_ar`) and
-- `article_timeline.title` stored a transitional `{k,p}` JSON payload that was
-- rendered at display time. Wave-19.1 retires that pattern in favour of the
-- platform convention already used by `policy_activity_log`: both languages
-- are rendered at WRITE time into `text_en` + `text_ar`. The reader simply
-- picks the column matching the current locale (no JSON parse, no regex).
--
-- All rows are DELETED first because the existing `{k,p}` JSON cannot be
-- back-translated into Arabic without re-running every writer — and the
-- timeline at this point holds only test data (no production usage). The new
-- columns are NOT NULL with an empty-string default that we then drop, so any
-- future writer must explicitly populate both languages.
delete from circular_timeline;
delete from article_timeline;

alter table circular_timeline
  drop column if exists title,
  drop column if exists title_ar,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table circular_timeline
  alter column text_en drop default,
  alter column text_ar drop default;

alter table article_timeline
  drop column if exists title,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table article_timeline
  alter column text_en drop default,
  alter column text_ar drop default;
