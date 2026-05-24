-- 050_circular_pdf_attachments.sql
--
-- GAP-21: multi-file circular PDF uploads. Today the circular carries a single
-- `circulars.pdf_url` column; this table makes "Upload Circular PDF" a true
-- multi-file list, each row preserving the original filename — mirroring
-- `circular_cap_attachments` / `circular_remediation_attachments`.
--
-- This table was created out-of-band (applied directly to the remote project);
-- this migration file records the change so the repo migration history stays
-- consistent. `CREATE TABLE IF NOT EXISTS` makes the file safe to (re-)run.
--
-- The legacy `circulars.pdf_url` column is intentionally left untouched: a
-- circular that already has a `pdf_url` value still surfaces it as a read-only
-- "legacy" entry in the list (no data migration, no data loss).

BEGIN;

CREATE TABLE IF NOT EXISTS circular_pdf_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id  uuid NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
  name         text NOT NULL,
  storage_path text NOT NULL,
  type         text,
  size         bigint,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid
);

CREATE INDEX IF NOT EXISTS circular_pdf_attachments_circular_id_idx
  ON circular_pdf_attachments (circular_id);

ALTER TABLE circular_pdf_attachments ENABLE ROW LEVEL SECURITY;

-- Policies mirror circular_cap_attachments: open SELECT for any authenticated
-- user; all writes gated behind the `edit` permission via `has_permission`.
DROP POLICY IF EXISTS "circular_pdf_attachments_select" ON circular_pdf_attachments;
CREATE POLICY "circular_pdf_attachments_select" ON circular_pdf_attachments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "circular_pdf_attachments_modify" ON circular_pdf_attachments;
CREATE POLICY "circular_pdf_attachments_modify" ON circular_pdf_attachments
  FOR ALL USING (has_permission('edit')) WITH CHECK (has_permission('edit'));

COMMIT;
