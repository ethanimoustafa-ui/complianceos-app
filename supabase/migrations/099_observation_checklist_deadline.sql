-- 099_observation_checklist_deadline
--
-- Parity with risk_mitigation_checklist (migration 097): the TypeScript
-- ObservationChecklistItem.deadline field existed with no backing column.
-- Add it so observation checklist items can carry a per-item deadline and
-- surface on the calendar via /api/calendar/deadlines.

alter table public.observation_checklist add column if not exists deadline date;

notify pgrst, 'reload schema';
