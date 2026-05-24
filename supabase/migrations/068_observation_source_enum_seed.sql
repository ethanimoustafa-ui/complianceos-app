-- Wave-24 W24-6c — seed the hard-coded observation source values into
-- `enum_value_definitions` (domain = 'observation.source'). After this
-- migration the SourcesSection settings panel and the observation filters
-- dropdown both read from the store, and admins can add custom sources.

insert into public.enum_value_definitions
  (domain, key, name_en, name_ar, sort_order, is_default)
values
  ('observation.source', 'sama',     'SAMA',                     'هيئة المصارف',          10, true),
  ('observation.source', 'cma',      'CMA',                      'هيئة السوق المالية',    20, true),
  ('observation.source', 'ia',       'IA',                       'التدقيق الداخلي',       30, true),
  ('observation.source', 'zatca',    'ZATCA',                    'الزكاة والضريبة والجمارك', 40, true),
  ('observation.source', 'misa',     'MISA',                     'وزارة الاستثمار',       50, true),
  ('observation.source', 'safiu',    'SAFIU',                    'وحدة التحقيقات المالية', 60, true),
  ('observation.source', 'citc',     'CITC',                     'هيئة الاتصالات',        70, true),
  ('observation.source', 'internal', 'Internal Audit',           'التدقيق الداخلي',       80, true),
  ('observation.source', 'sharia',   'Sharia Audit',             'التدقيق الشرعي',        90, true)
on conflict (domain, key) do nothing;
