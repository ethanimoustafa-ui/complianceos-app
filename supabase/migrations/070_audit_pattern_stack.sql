-- 070_audit_pattern_stack.sql
-- W26-A: Dual-store timeline + version history for audits.
--
-- 1. Add text_en / text_ar dual-store columns to audit_activity_logs.
-- 2. Create audit_versions table for per-field diff history (PORTING §2.11 / W19.4).
-- 3. Ensure set_updated_at trigger is present on audits (ETag / If-Match guard).

-- ---------------------------------------------------------------------------
-- 1. Dual-store columns on audit_activity_logs
-- ---------------------------------------------------------------------------

ALTER TABLE audit_activity_logs
  ADD COLUMN IF NOT EXISTS text_en text NOT NULL DEFAULT '';

ALTER TABLE audit_activity_logs
  ADD COLUMN IF NOT EXISTS text_ar text NOT NULL DEFAULT '';

-- Drop the server defaults so future inserts are required to supply values.
ALTER TABLE audit_activity_logs
  ALTER COLUMN text_en DROP DEFAULT;

ALTER TABLE audit_activity_logs
  ALTER COLUMN text_ar DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 2. audit_versions table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id       uuid        NOT NULL REFERENCES audits (id) ON DELETE CASCADE,
  changed_by     uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  changed_by_name text,
  field_changes  jsonb       NOT NULL DEFAULT '[]',
  text_en        text        NOT NULL,
  text_ar        text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_versions_audit_id
  ON audit_versions (audit_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. set_updated_at trigger on audits (idempotent)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON audits;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON audits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row-level security on audit_versions
-- ---------------------------------------------------------------------------

ALTER TABLE audit_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_versions_select ON audit_versions;
CREATE POLICY audit_versions_select ON audit_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS audit_versions_insert ON audit_versions;
CREATE POLICY audit_versions_insert ON audit_versions
  FOR INSERT TO authenticated WITH CHECK (true);
