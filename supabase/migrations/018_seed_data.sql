-- 018_seed_data
-- Roles (4), permissions (25), role_permissions matrix per BACKEND-API-MAP §3,
-- frameworks (11), default departments (10), compliance_settings + saudization_metrics singletons.

insert into public.roles (key, name, description) values
  ('viewer','Viewer','Read-only access across modules'),
  ('auditor','Auditor','Officer (default). View + comment + observation full access'),
  ('compliance_officer','Compliance Officer','Manager. Create, edit, comment, export. No delete or settings'),
  ('org_admin','Organization Admin','Full access')
on conflict (key) do nothing;

insert into public.permissions (key, name) values
  ('view','View'),('comment','Comment'),('create','Create'),('edit','Edit'),('delete','Delete'),
  ('audit:view','View Audits'),('audit:comment','Comment on Audits'),('audit:create','Create Audits'),('audit:edit','Edit Audits'),('audit:delete','Delete Audits'),
  ('observation:view','View Observations'),('observation:comment','Comment on Observations'),('observation:create','Create Observations'),('observation:edit','Edit Observations'),('observation:delete','Delete Observations'),
  ('report:view','View Reports'),('report:create','Create Reports'),('report:delete','Delete Reports'),
  ('export','Export'),
  ('settings:view','View Settings'),('settings:edit','Edit Settings'),
  ('team:view','View Team'),('team:invite','Invite Team Members'),('team:edit','Edit Team Members'),('team:remove','Remove Team Members')
on conflict (key) do nothing;

-- viewer
insert into public.role_permissions (role_key, permission_key) values
  ('viewer','view'),('viewer','audit:view'),('viewer','observation:view'),('viewer','report:view'),('viewer','export')
on conflict do nothing;

-- auditor
insert into public.role_permissions (role_key, permission_key) values
  ('auditor','view'),('auditor','comment'),('auditor','audit:view'),
  ('auditor','observation:view'),('auditor','observation:comment'),('auditor','observation:create'),('auditor','observation:edit'),
  ('auditor','report:view'),('auditor','export')
on conflict do nothing;

-- compliance_officer
insert into public.role_permissions (role_key, permission_key) values
  ('compliance_officer','view'),('compliance_officer','comment'),('compliance_officer','create'),('compliance_officer','edit'),
  ('compliance_officer','audit:view'),('compliance_officer','audit:comment'),('compliance_officer','audit:create'),('compliance_officer','audit:edit'),
  ('compliance_officer','observation:view'),('compliance_officer','observation:comment'),('compliance_officer','observation:create'),('compliance_officer','observation:edit'),
  ('compliance_officer','report:view'),('compliance_officer','report:create'),
  ('compliance_officer','export')
on conflict do nothing;

-- org_admin gets all perms
insert into public.role_permissions (role_key, permission_key)
select 'org_admin', p.key from public.permissions p
on conflict do nothing;

insert into public.frameworks (id, name_en, name_ar, enabled, correspondence_based) values
  ('sama','SAMA','مؤسسة النقد العربي السعودي', true, true),
  ('cma','CMA','هيئة السوق المالية', true, true),
  ('ia','IA','هيئة التأمين', true, true),
  ('nca-ecc','NCA ECC','الضوابط الأساسية للأمن السيبراني', true, false),
  ('zatca','ZATCA','الزكاة والضريبة والجمارك', true, false),
  ('misa','MISA','وزارة الاستثمار', true, false),
  ('safiu','SAFIU','وحدة التحريات المالية', true, false),
  ('pdpl','PDPL','نظام حماية البيانات الشخصية', true, false),
  ('coso-ic','COSO IC','إطار كوسو للرقابة الداخلية', true, false),
  ('iso-27001','ISO 27001','أيزو ٢٧٠٠١', true, false),
  ('sharia-board','Sharia Board','الهيئة الشرعية', true, false)
on conflict (id) do nothing;

insert into public.departments (key, name_en, name_ar, is_default) values
  ('compliance','Compliance','الالتزام', true),
  ('risk','Risk Management','إدارة المخاطر', true),
  ('audit','Internal Audit','المراجعة الداخلية', true),
  ('it','Information Technology','تقنية المعلومات', true),
  ('finance','Finance','المالية', true),
  ('hr','Human Resources','الموارد البشرية', true),
  ('operations','Operations','العمليات', true),
  ('legal','Legal','الشؤون القانونية', true),
  ('treasury','Treasury','الخزينة', true),
  ('cyber','Cybersecurity','الأمن السيبراني', true)
on conflict (key) do nothing;

insert into public.compliance_settings (singleton) values (true) on conflict (singleton) do nothing;
insert into public.saudization_metrics (singleton) values (true) on conflict (singleton) do nothing;
