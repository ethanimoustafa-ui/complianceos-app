-- 048_seed_missing_frameworks.sql
--
-- Aligns the DB `frameworks` table with the frontend FRAMEWORK_DEFAULTS table
-- in `src/stores/framework-config-store.ts`. The mismatch was surfaced on
-- 2026-05-19 when a user toggling `ndmo-pdpl` (legacy id) hit a 404 from
-- `assertFrameworkExists`. Eight other rows were similarly missing — toggling
-- any of them would 404 too.
--
-- Changes (user-authorized 2026-05-19):
--   1. Rename the existing `pdpl` row to `sdaia-pdpl` (matches frontend id;
--      pre-flight grep across every framework_ids[] / framework_id column
--      showed 0 references to `pdpl`, so the rename is safe).
--   2. Seed the 7 frameworks present in the frontend defaults but missing
--      from the DB. All disabled by default — the user opts in via Settings.
--
-- Note: `ndmo-pdpl` is intentionally NOT seeded. It remains in the
-- RegulatoryBodyId type union only for back-compat reads of legacy persisted
-- state, and was removed from FRAMEWORK_DEFAULTS in the same wave. The
-- current Saudi PDPL is `sdaia-pdpl`.

BEGIN;

UPDATE frameworks
   SET id = 'sdaia-pdpl',
       name_en = 'SDAIA PDPL',
       name_ar = 'نظام حماية البيانات الشخصية (سدايا)'
 WHERE id = 'pdpl';

INSERT INTO frameworks (id, name_en, name_ar, enabled, correspondence_based, threshold)
VALUES
  ('nca-cscc',  'NCA CSCC',  'ضوابط الأمن السيبراني للحوسبة السحابية',     false, false, 'standard'),
  ('nca-ccc',   'NCA CCC',   'ضوابط الأمن السيبراني للأنظمة الحساسة',      false, false, 'standard'),
  ('citc',      'CITC',      'هيئة الاتصالات وتقنية المعلومات',             false, true,  'standard'),
  ('iso-22301', 'ISO 22301', 'أيزو 22301',                                  false, false, 'standard'),
  ('iso-31000', 'ISO 31000', 'أيزو 31000',                                  false, false, 'standard'),
  ('coso-erm',  'COSO ERM',  'إطار إدارة مخاطر المؤسسة (COSO)',             false, false, 'standard'),
  ('saso',      'SASO',      'الهيئة السعودية للمواصفات والمقاييس والجودة', false, false, 'standard')
ON CONFLICT (id) DO NOTHING;

COMMIT;
