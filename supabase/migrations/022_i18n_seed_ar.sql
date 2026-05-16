-- 022_i18n_seed_ar
-- Phase 8 i18n Arabic translation refinements for seeded reference data.
-- The seed in 018_seed_data already populated `name_ar` for frameworks and
-- departments. This migration:
--   1. Aligns a small number of framework AR labels with the canonical
--      Phase 8 wording (uses the explicit "ساما" alias for the SAMA acronym,
--      adds the parenthetical Arabic body name for SAMA + SAFIU).
--   2. Re-asserts canonical AR translations for the 10 default departments
--      so they match the Phase 8 list verbatim (idempotent - same values
--      where already correct).
--
-- The 9 lookup tables seeded from the UI (policy/audit/risk/training
-- categories, calendar event types, correspondence types, letter types,
-- letter sub-categories, authority departments) are empty in the database
-- on a fresh deploy - Arabic translations for those tables will be entered
-- via the Settings UI by the org admin and stored as `name_ar` directly.

-- Frameworks: align with Phase 8 canonical AR strings.
update public.frameworks set name_ar = 'ساما (مؤسسة النقد العربي السعودي)' where id = 'sama';
update public.frameworks set name_ar = 'هيئة السوق المالية'                where id = 'cma';
update public.frameworks set name_ar = 'هيئة التأمين'                      where id = 'ia';
update public.frameworks set name_ar = 'الضوابط الأساسية للأمن السيبراني'  where id = 'nca-ecc';
update public.frameworks set name_ar = 'هيئة الزكاة والضريبة والجمارك'     where id = 'zatca';
update public.frameworks set name_ar = 'وزارة الاستثمار'                   where id = 'misa';
update public.frameworks set name_ar = 'وحدة التحريات المالية السعودية'    where id = 'safiu';
update public.frameworks set name_ar = 'نظام حماية البيانات الشخصية'       where id = 'pdpl';
update public.frameworks set name_ar = 'كوزو للرقابة الداخلية'             where id = 'coso-ic';
update public.frameworks set name_ar = 'آيزو 27001'                        where id = 'iso-27001';
update public.frameworks set name_ar = 'الهيئة الشرعية'                    where id = 'sharia-board';

-- Departments: re-assert canonical AR labels (matches existing seed values
-- where they already align).
update public.departments set name_ar = 'الالتزام'         where key = 'compliance';
update public.departments set name_ar = 'إدارة المخاطر'    where key = 'risk';
update public.departments set name_ar = 'التدقيق الداخلي'  where key = 'audit';
update public.departments set name_ar = 'الشؤون القانونية' where key = 'legal';
update public.departments set name_ar = 'المالية'           where key = 'finance';
update public.departments set name_ar = 'تقنية المعلومات'  where key = 'it';
update public.departments set name_ar = 'الأمن السيبراني'  where key = 'cyber';
update public.departments set name_ar = 'العمليات'         where key = 'operations';
update public.departments set name_ar = 'الموارد البشرية'  where key = 'hr';
update public.departments set name_ar = 'الخزينة'          where key = 'treasury';
