-- 051_backfill_applicability_past_phase0
-- GAP-18: a circular past Phase 0 must not show 'pending' applicability.
-- recomputeCircularProgress() sets `applicability` going forward; this one-time
-- backfill corrects pre-existing rows that had not had a recompute since the
-- GAP-18 logic shipped. Corrective only — never touches an explicit
-- 'not-applicable', never downgrades.

update circulars c
set applicability = 'applicable'
where c.deleted_at is null
  and c.applicability = 'pending'
  and exists (
    select 1 from circular_workflow_steps w
    where w.circular_id = c.id
      and w.phase > 0
      and w.status in ('current', 'completed')
  );
