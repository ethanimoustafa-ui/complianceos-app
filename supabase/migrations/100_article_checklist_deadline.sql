-- 100_article_checklist_deadline
--
-- Parity with risk_mitigation_checklist (migration 097) and
-- observation_checklist (migration 099): the TypeScript ChecklistItem.deadline
-- field existed with no backing column on article_checklist_items. Add it so
-- circular ARTICLE checklist items can carry a per-item deadline and surface on
-- the calendar via /api/calendar/deadlines.

alter table public.article_checklist_items add column if not exists deadline date;

notify pgrst, 'reload schema';
