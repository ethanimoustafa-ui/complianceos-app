-- P1: add optional deadline column to policy_workflow_steps.
-- This mirrors the same column that already exists on circular_workflow_steps
-- (migration 025). The column stores a YYYY-MM-DD date that must be ≤ the
-- parent policy's next_review_date (validated client-side via
-- `validateChildDeadline`; the DB carries the data without a check constraint
-- to keep the schema simple and let the app layer surface the error).

alter table public.policy_workflow_steps
  add column if not exists deadline date;
