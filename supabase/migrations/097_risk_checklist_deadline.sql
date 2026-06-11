-- 097_risk_checklist_deadline
--
-- Risk mitigation checklist items gain an optional deadline. The TypeScript
-- `MitigationChecklistItem.deadline` field existed but had no backing column
-- (the API silently dropped it). Officer-added items and department-proposed
-- plan items can now carry a per-item deadline, which also lets the calendar
-- surface them. Nullable; bounded ≤ the parent risk's mitigation_deadline is
-- enforced in the UI (InlineDeadlinePicker), not the DB.

alter table public.risk_mitigation_checklist add column if not exists deadline date;

notify pgrst, 'reload schema';
