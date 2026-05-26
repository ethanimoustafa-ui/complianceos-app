-- Migration 071: Letter template helper functions
--
-- L7c: atomic usage_count increment via an RPC function so concurrent
-- POST /api/letters requests don't race on the read-modify-write pattern.
--
-- L7b: also patches the seeded placeholder_defs that still contain the
-- obsolete type:'text' / type:'textarea' values (Zod rejects these on
-- the create-letter path via PlaceholderDef.type enum).

-- ── Atomic increment function ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_template_usage_count(
  template_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.letter_templates
  SET
    usage_count  = usage_count + 1,
    last_used_at = now()
  WHERE id = template_id;
$$;

-- Grant execute to authenticated users (the API route calls this with the
-- service role, but we allow authenticated to future-proof client-side calls).
GRANT EXECUTE ON FUNCTION public.increment_template_usage_count(uuid) TO authenticated;

-- ── last_used_at column (best-effort; no-op if already exists) ──────────────

ALTER TABLE public.letter_templates
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- ── Fix seeded placeholder_defs: promote 'text'/'textarea' → 'date' ─────────
-- This is a one-time data patch so existing seeded templates don't cause
-- Zod validation failures when used to create a letter (L7b).

UPDATE public.letter_templates
SET placeholder_defs = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'type' IN ('text', 'textarea')
        THEN jsonb_set(elem, '{type}', '"date"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(placeholder_defs) AS elem
)
WHERE placeholder_defs IS NOT NULL
  AND placeholder_defs != 'null'::jsonb
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(placeholder_defs) AS e
    WHERE e->>'type' IN ('text', 'textarea')
  );
