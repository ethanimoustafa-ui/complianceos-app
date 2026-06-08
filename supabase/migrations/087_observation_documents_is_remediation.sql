-- 087_observation_documents_is_remediation.sql
--
-- BUG 3: persist the remediation-doc classification so an uploaded remediation
-- document survives a full page refresh. Previously the "is remediation" flag
-- lived only in client Zustand state and was dropped on reload, so the doc
-- vanished from the Remediation Plan section. Default false keeps every existing
-- row classified as a regular (non-remediation) document.

ALTER TABLE public.observation_documents
  ADD COLUMN IF NOT EXISTS is_remediation boolean NOT NULL DEFAULT false;
