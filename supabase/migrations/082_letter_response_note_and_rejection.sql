-- Migration 082: Add response_note and rejection_reason columns to letters
--
-- W29-L2: Optional note captured when an operator marks a letter's response
-- received. Stored alongside response_received_date on the letters row.
--
-- W29-L6: rejection_reason persists the required free-text reason when the
-- admin rejects a pending-approval letter via POST /api/letters/[id]/reject.
-- This supplements the timeline entry already written by that route.

ALTER TABLE public.letters
  ADD COLUMN IF NOT EXISTS response_note text NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

-- Grant: existing RLS policies on letters cover these columns automatically
-- (column-level RLS is not used here; table-level policies apply).
