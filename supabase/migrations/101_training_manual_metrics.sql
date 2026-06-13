-- 101: persist manually-entered training metrics.
--
-- The training page's "Edit Metrics" modal writes saudization headcounts and
-- the two manually-entered overview numbers (overall completion %, courses
-- assigned), but the store only mutated local Zustand state — every entry was
-- lost on reload ("the numbers don't stick"). The `saudization_metrics`
-- singleton (migration 010) already persists the headcounts; add the two
-- overview columns so the new /api/training/metrics route can persist the
-- whole manual-entry payload in one row. NULL = "never manually entered" —
-- the client then falls back to its computed value.

alter table public.saudization_metrics
  add column if not exists overall_completion numeric,
  add column if not exists courses_assigned integer;
