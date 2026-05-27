-- Migration 077: Widen storage SELECT policy for letter signature images
--
-- L3: Signature images uploaded via TemplateEditForm are stored in
-- sama_letter_attachments/signatures/. The existing SELECT policy
-- restricts reads to the file owner (auth.uid()), so signatures
-- uploaded by Admin A are invisible to Compliance Officer B when
-- viewing a letter or rendering a PDF.
--
-- Fix: add a supplementary SELECT policy that allows any authenticated
-- user to read objects whose storage_path starts with 'signatures/'.
-- The original owner-scoped policy is kept for non-signature attachments.
--
-- NOTE: Apply via the Supabase dashboard or CLI — DO NOT apply via MCP.

-- Allow any authenticated user to view signature images in the
-- sama_letter_attachments bucket (signatures sub-folder only).
DROP POLICY IF EXISTS "sama_letter_signatures_select_any" ON storage.objects;

CREATE POLICY "sama_letter_signatures_select_any" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sama_letter_attachments'
    AND name LIKE 'signatures/%'
  );
