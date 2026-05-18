-- 046_letter_hard_delete_cascade
--
-- Phase-12 cleanup for the letters + correspondence resource families.
-- Mirrors migrations 040..045 (circulars, policies, audits, observations,
-- risks, training). Switches both to hard-delete and reverts the
-- `deleted_at IS NULL` SELECT policies.
--
-- Cascade audit (verified live via pg_constraint at migration-time):
--   letters has 4 child FKs and every one specifies ON DELETE CASCADE:
--     - letter_approval_steps.letter_id      → letters(id) ON DELETE CASCADE
--     - letter_attachments.letter_id         → letters(id) ON DELETE CASCADE
--     - letter_observations.letter_id        → letters(id) ON DELETE CASCADE
--                (linking table; deleting the letter row clears links but
--                 leaves the referenced observations intact — they're owned
--                 by their own resource family.)
--     - letter_timeline.letter_id            → letters(id) ON DELETE CASCADE
--   correspondence has 1 child FK and it cascades:
--     - correspondence_attachments.correspondence_id → correspondence(id)
--                                                   ON DELETE CASCADE
--   audit_logs.entity_id / notifications.entity_id are NOT FKs — they're
--   polymorphic text/uuid pointers (HANDOFF §5 gotcha #7), so the audit trail
--   survives the physical row removal. The constraint names retain their
--   legacy `sama_letter_*_fkey` prefixes from migration 008 (pre-rename in
--   033); leaving them as-is — pg_constraint name is internal-only.
--
-- This migration:
--   1. Hard-deletes any rows currently flagged as soft-deleted (letters +
--      correspondence) — cascade clears children automatically.
--   2. Reverts the SELECT policies on letters + correspondence from
--      `(deleted_at IS NULL)` to `USING (true)`, because rows are now
--      physically gone after a delete — there's no tombstone to hide.
--   3. Documents the dead `deleted_at` columns so future readers don't
--      wire them up again. (Columns intentionally retained to avoid
--      destabilising route handlers that may still reference them in
--      filters — those filters become harmless no-ops, since no row ever
--      has a non-null deleted_at again.)
--
-- See OPTIMIZATION-PATTERNS.md §4 and migration 040 for the canonical pattern.

-- =========================================================================
-- 1. Purge soft-deleted letters + correspondence (cascade handles children).
-- =========================================================================
delete from public.letters where deleted_at is not null;
delete from public.correspondence where deleted_at is not null;

-- =========================================================================
-- 2a. Revert letters SELECT policy → using (true).
-- =========================================================================
drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select to authenticated
  using (true);

-- =========================================================================
-- 2b. Revert correspondence SELECT policy → using (true).
-- =========================================================================
drop policy if exists correspondence_select on public.correspondence;
create policy correspondence_select on public.correspondence
  for select to authenticated
  using (true);

-- =========================================================================
-- 3. Document the dead columns so future readers don't wire them back up.
-- =========================================================================
comment on column public.letters.deleted_at is
  'No-op as of migration 046. Kept on the table to avoid destabilising downstream code paths. Hard-delete is now the only delete path — see app/api/letters/[letterId]/route.ts DELETE handler.';
comment on column public.correspondence.deleted_at is
  'No-op as of migration 046. Kept on the table to avoid destabilising downstream code paths. Hard-delete is now the only delete path — see app/api/correspondence/[correspondenceId]/route.ts DELETE handler.';

notify pgrst, 'reload schema';
