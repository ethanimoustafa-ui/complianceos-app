-- 044_risk_hard_delete_cascade
--
-- Switch risks from soft-delete (`deleted_at = now()`) to hard-delete
-- (`DELETE FROM risks WHERE id = …`). Mirrors migrations 040 (circulars),
-- 041 (policies), 042 (audits), and 043 (observations).
--
-- Cascade audit (verified via pg_constraint on 2026-05-17):
--   All 3 child FKs already specify ON DELETE CASCADE:
--     * risk_department_proposed_plan.risk_id → risks(id) ON DELETE CASCADE
--     * risk_history.risk_id                  → risks(id) ON DELETE CASCADE
--     * risk_mitigation_checklist.risk_id     → risks(id) ON DELETE CASCADE
--   audit_logs.target_id and notifications.entity_id are polymorphic
--   text/uuid pointers (NOT FKs) so the append-only compliance trail
--   survives the hard-delete (see HANDOFF §5 gotcha #7).
--   There are no `risk_attachments`, `risk_checklist`, or `risk_documents`
--   tables in the current schema — the only top-level checklist is
--   `risk_mitigation_checklist` (already CASCADE'd above). History lives
--   on `risk_history` (CASCADE'd) and the global polymorphic `audit_logs`.
-- So this migration does NOT alter any FK definitions; cascade plumbing
-- is already correct. It only:
--   1. Hard-deletes any rows currently flagged as soft-deleted (cascade
--      clears children automatically). Idempotent and safe — at time of
--      writing the table has 0 such rows.
--   2. Replaces the legacy risks SELECT policy (which still gated on
--      `deleted_at IS NULL`) with a permission-based policy matching the
--      circulars/policies/audits/observations pattern. Rows are now
--      physically gone after a delete, so the soft-delete guard is dead.
-- The `deleted_at` column itself stays on the table as a no-op (dropping
-- it would be load-bearing on multiple route handlers updated in the same
-- commit — easier to keep the column and just stop writing to it).

-- Purge soft-deleted risks and their children (CASCADE on the FK chain
-- handles every child table). One-shot DELETE on the soft-deleted set;
-- ongoing deletes go through the route handler's DELETE statement and
-- never touch deleted_at again.
delete from public.risks where deleted_at is not null;

-- Drop the deleted_at filter from the SELECT policy. Rows are now
-- physically gone after a delete, so there's no need to special-case
-- visibility. Match the audit:view permission gate used for risks
-- throughout the API (BACKEND-API-MAP §4.6 — risks reuses audit:* keys
-- because there are no risk:* keys seeded in the RBAC matrix).
drop policy if exists risks_select on public.risks;
create policy risks_select on public.risks
  for select to authenticated
  using (has_permission('audit:view'::text));

-- Document the dead column so future readers don't wire it up again.
comment on column public.risks.deleted_at is
  'No-op as of migration 044. Kept on the table to avoid touching downstream code paths. Hard-delete is now the only delete path — see app/api/risks/[riskId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
