-- Migration 073: backfill observation_timeline leadership-transfer rows
-- that contain raw {{from}}/{{to}} Mustache tokens written before the W27-β
-- interpolation fix landed in assign/route.ts.
--
-- The table has an append-only UPDATE trigger (trg_observation_timeline_block_update).
-- We disable it for the duration of this targeted backfill, then re-enable it.
-- This is a one-time data repair; no future UPDATE paths are opened.
--
-- Strategy:
--   - Only touch rows whose text_en still contains '{{from}}' or '{{to}}' (idempotent).
--   - For {{to}}: subquery profiles JOIN observations on current leader_id.
--   - For {{from}}: metadata->>'from_user_id' if present; else fall back to
--     user_name (the actor who triggered the transfer) since metadata was
--     not capturing from/to IDs for the affected rows.
--   - Rows written after the fix already have resolved names — untouched.

ALTER TABLE observation_timeline DISABLE TRIGGER trg_observation_timeline_block_update;

UPDATE observation_timeline ot
SET
  text_en = REPLACE(
              REPLACE(
                text_en,
                '{{from}}',
                COALESCE(
                  (SELECT p.name FROM profiles p
                   WHERE p.id = (ot.metadata->>'from_user_id')::uuid),
                  ot.user_name,
                  '(previous leader)'
                )
              ),
              '{{to}}',
              COALESCE(
                (SELECT p.name FROM profiles p
                 JOIN observations o2 ON p.id = o2.leader_id
                 WHERE o2.id = ot.observation_id),
                ot.user_name,
                '(new leader)'
              )
            ),
  text_ar = REPLACE(
              REPLACE(
                text_ar,
                '{{from}}',
                COALESCE(
                  (SELECT p.name FROM profiles p
                   WHERE p.id = (ot.metadata->>'from_user_id')::uuid),
                  ot.user_name,
                  '(القائد السابق)'
                )
              ),
              '{{to}}',
              COALESCE(
                (SELECT p.name FROM profiles p
                 JOIN observations o2 ON p.id = o2.leader_id
                 WHERE o2.id = ot.observation_id),
                ot.user_name,
                '(القائد الجديد)'
              )
            )
WHERE (ot.text_en LIKE '%{{from}}%' OR ot.text_en LIKE '%{{to}}%');

ALTER TABLE observation_timeline ENABLE TRIGGER trg_observation_timeline_block_update;
