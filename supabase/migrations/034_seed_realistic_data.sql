-- Migration 034: Seed realistic Saudi GRC reference data
-- Idempotent — uses ON CONFLICT DO NOTHING and WHERE NOT EXISTS guards.
-- Admin user: c5a105da-4b42-4152-abbc-af517e8c70cc
-- NOTE: domain values respect existing CHECK constraints:
--   letters.priority   ∈ {standard, urgent}
--   letters.status     ∈ {draft, pending-approval, approved, sent, response-received, overdue}
--   observations.source ∈ {sama, internal, sharia}
--   observations.status ∈ {open, in_progress, resolved, closed}
--   audits.type        ∈ {internal, sama, sharia}
--   audits.status      ∈ {pending, in_progress, completed, overdue}
--   risks.category     ∈ {operational, financial, compliance, strategic, reputational}
--   risks.status       ∈ {identified, mitigating, accepted, resolved}
--   policies.category  ∈ {compliance, it, operations, risk, hr, finance}
--   policies.status    ∈ {draft, under-review, approved, expired, overdue, requires-review}
--   policies.approval_tier ∈ {board, management, sharia, agm}

BEGIN;

-- 1. letter_types
INSERT INTO public.letter_types (key, name_en, name_ar, is_default, created_at) VALUES
  ('regulatory_directive',    'Regulatory Directive',        'توجيه تنظيمي',                      true,  now() - interval '85 days'),
  ('regulatory_inquiry',      'Regulatory Inquiry',          'استفسار تنظيمي',                    true,  now() - interval '83 days'),
  ('compliance_notice',       'Compliance Notice',           'إشعار الامتثال',                    true,  now() - interval '80 days'),
  ('audit_finding',           'Audit Finding',               'ملاحظة تدقيق',                      true,  now() - interval '70 days'),
  ('corrective_action',       'Corrective Action Request',   'طلب إجراء تصحيحي',                  true,  now() - interval '65 days'),
  ('enforcement_action',      'Enforcement Action',          'إجراء إنفاذ',                       false, now() - interval '60 days'),
  ('policy_circular',         'Policy Circular',             'تعميم سياسة',                       true,  now() - interval '50 days'),
  ('licensing_correspondence','Licensing Correspondence',    'مراسلة ترخيص',                      false, now() - interval '40 days')
ON CONFLICT (key) DO NOTHING;

-- 2. framework_sub_categories
INSERT INTO public.framework_sub_categories (framework_id, key, name_en, name_ar, is_default, created_at) VALUES
  ('sama',         'corporate-governance',     'Corporate Governance',                    'الحوكمة المؤسسية',                            true,  now() - interval '88 days'),
  ('sama',         'risk-management',          'Risk Management',                         'إدارة المخاطر',                                true,  now() - interval '86 days'),
  ('sama',         'aml-cft-compliance',       'AML/CFT Compliance',                      'الامتثال لمكافحة غسل الأموال وتمويل الإرهاب', true,  now() - interval '85 days'),
  ('sama',         'it-cybersecurity',         'IT & Cybersecurity',                      'تقنية المعلومات والأمن السيبراني',            true,  now() - interval '82 days'),
  ('cma',          'market-conduct',           'Market Conduct',                          'سلوك السوق',                                   true,  now() - interval '78 days'),
  ('cma',          'disclosure-transparency',  'Disclosure & Transparency',               'الإفصاح والشفافية',                            true,  now() - interval '76 days'),
  ('cma',          'investor-protection',      'Investor Protection',                     'حماية المستثمر',                               true,  now() - interval '74 days'),
  ('cma',          'licensing-supervision',    'Licensing & Supervision',                 'الترخيص والإشراف',                             false, now() - interval '72 days'),
  ('nca-ecc',      'access-control',           'Access Control',                          'التحكم في الوصول',                             true,  now() - interval '68 days'),
  ('nca-ecc',      'incident-response',        'Incident Response',                       'الاستجابة للحوادث',                            true,  now() - interval '66 days'),
  ('nca-ecc',      'data-protection',          'Data Protection',                         'حماية البيانات',                               true,  now() - interval '64 days'),
  ('sharia-board', 'sharia-supervision',       'Sharia Supervision',                      'الرقابة الشرعية',                              true,  now() - interval '60 days'),
  ('sharia-board', 'product-approval',         'Product Approval',                        'اعتماد المنتجات',                              true,  now() - interval '58 days')
ON CONFLICT (framework_id, key) DO NOTHING;

-- 3. correspondence_types
INSERT INTO public.correspondence_types (key, name_en, name_ar, is_default, created_at) VALUES
  ('external_letter',     'External Letter',     'خطاب خارجي',         true,  now() - interval '90 days'),
  ('internal_memo',       'Internal Memo',       'مذكرة داخلية',        true,  now() - interval '88 days'),
  ('regulatory_filing',   'Regulatory Filing',   'إيداع تنظيمي',        true,  now() - interval '85 days'),
  ('advisory_request',    'Advisory Request',    'طلب استشارة',        false, now() - interval '70 days'),
  ('notification',        'Notification',        'إشعار',              true,  now() - interval '60 days'),
  ('acknowledgment',      'Acknowledgment',      'إقرار',              false, now() - interval '50 days')
ON CONFLICT (key) DO NOTHING;

-- 4. policy_categories
INSERT INTO public.policy_categories (key, name_en, name_ar, is_default, created_at) VALUES
  ('information-security',      'Information Security',          'أمن المعلومات',                  true,  now() - interval '88 days'),
  ('aml',                       'Anti-Money Laundering',         'مكافحة غسل الأموال',             true,  now() - interval '85 days'),
  ('customer-onboarding-kyc',   'Customer Onboarding (KYC)',     'إدخال العملاء',                  true,  now() - interval '82 days'),
  ('operational-risk',          'Operational Risk',              'المخاطر التشغيلية',              true,  now() - interval '78 days'),
  ('credit-risk',               'Credit Risk',                   'مخاطر الائتمان',                 true,  now() - interval '75 days'),
  ('sharia-compliance',         'Sharia Compliance',             'الامتثال الشرعي',                true,  now() - interval '70 days'),
  ('data-privacy',              'Data Privacy',                  'خصوصية البيانات',                true,  now() - interval '65 days'),
  ('outsourcing-third-parties', 'Outsourcing & Third Parties',   'الإسناد والأطراف الثالثة',       false, now() - interval '60 days')
ON CONFLICT (key) DO NOTHING;

-- 5. audit_categories
INSERT INTO public.audit_categories (key, name_en, name_ar, is_default, created_at) VALUES
  ('internal-audit',     'Internal Audit',       'المراجعة الداخلية',     true,  now() - interval '85 days'),
  ('external-audit',     'External Audit',       'المراجعة الخارجية',     true,  now() - interval '82 days'),
  ('regulatory-audit',   'Regulatory Audit',     'المراجعة التنظيمية',    true,  now() - interval '78 days'),
  ('sharia-audit',       'Sharia Audit',         'المراجعة الشرعية',      true,  now() - interval '70 days'),
  ('it-security-audit',  'IT Security Audit',    'مراجعة أمن المعلومات',  true,  now() - interval '60 days'),
  ('operational-audit',  'Operational Audit',    'المراجعة التشغيلية',    false, now() - interval '50 days')
ON CONFLICT (key) DO NOTHING;

-- 6. risk_categories
INSERT INTO public.risk_categories (key, name_en, name_ar, color, is_default, created_at) VALUES
  ('credit-risk',        'Credit Risk',         'مخاطر الائتمان',         '#DC2626', true,  now() - interval '88 days'),
  ('market-risk',        'Market Risk',         'مخاطر السوق',            '#F59E0B', true,  now() - interval '85 days'),
  ('liquidity-risk',     'Liquidity Risk',      'مخاطر السيولة',          '#0EA5E9', true,  now() - interval '82 days'),
  ('operational-risk',   'Operational Risk',    'المخاطر التشغيلية',      '#8B5CF6', true,  now() - interval '78 days'),
  ('compliance-risk',    'Compliance Risk',     'مخاطر الامتثال',         '#10B981', true,  now() - interval '72 days'),
  ('reputational-risk',  'Reputational Risk',   'المخاطر السمعية',        '#EC4899', true,  now() - interval '65 days'),
  ('strategic-risk',     'Strategic Risk',      'المخاطر الاستراتيجية',   '#6366F1', false, now() - interval '60 days'),
  ('cybersecurity-risk', 'Cybersecurity Risk',  'مخاطر الأمن السيبراني',  '#EF4444', true,  now() - interval '55 days')
ON CONFLICT (key) DO NOTHING;

-- 7. business_units
INSERT INTO public.business_units (key, name_en, name_ar, is_default, created_at) VALUES
  ('retail-banking',     'Retail Banking',          'الخدمات المصرفية للأفراد',     true,  now() - interval '88 days'),
  ('corporate-banking',  'Corporate Banking',       'الخدمات المصرفية للشركات',     true,  now() - interval '85 days'),
  ('treasury',           'Treasury',                'الخزينة',                      true,  now() - interval '80 days'),
  ('investment-banking', 'Investment Banking',      'الخدمات المصرفية الاستثمارية', false, now() - interval '75 days'),
  ('operations',         'Operations',              'العمليات',                     true,  now() - interval '70 days'),
  ('information-tech',   'Information Technology',  'تقنية المعلومات',              true,  now() - interval '65 days'),
  ('human-resources',    'Human Resources',         'الموارد البشرية',              true,  now() - interval '60 days')
ON CONFLICT (key) DO NOTHING;

-- 8. authority_departments
INSERT INTO public.authority_departments (authority_id, name_en, name_ar, email, is_seed, created_at)
SELECT v.authority_id, v.name_en, v.name_ar, v.email, true, v.created_at
FROM (VALUES
  ('sama',  'Banking Supervision Department',           'إدارة الرقابة المصرفية',                     'banking.supervision@sama.gov.sa',    now() - interval '85 days'),
  ('sama',  'Insurance Supervision Department',         'إدارة الرقابة على التأمين',                  'insurance.supervision@sama.gov.sa',  now() - interval '82 days'),
  ('sama',  'Consumer Protection Department',           'إدارة حماية المستهلك',                       'consumer.protection@sama.gov.sa',    now() - interval '78 days'),
  ('cma',   'Capital Market Authority - Issuance',      'هيئة السوق المالية - الإصدار',               'issuance@cma.org.sa',                now() - interval '70 days'),
  ('ia',    'Insurance Authority - Compliance',         'هيئة التأمين - الامتثال',                    'compliance@ia.gov.sa',               now() - interval '65 days'),
  ('citc',  'CITC - Telecom',                           'هيئة الاتصالات - الاتصالات',                 'telecom@citc.gov.sa',                now() - interval '60 days'),
  ('zatca', 'ZATCA - VAT',                              'هيئة الزكاة - ضريبة القيمة المضافة',         'vat@zatca.gov.sa',                   now() - interval '55 days')
) AS v(authority_id, name_en, name_ar, email, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.authority_departments ad
  WHERE ad.authority_id = v.authority_id AND ad.name_en = v.name_en
);

-- 9. calendar_event_types
INSERT INTO public.calendar_event_types (key, name_en, name_ar, is_default, created_at) VALUES
  ('regulatory_deadline',   'Regulatory Deadline',     'موعد تنظيمي نهائي',     true,  now() - interval '88 days'),
  ('audit_engagement',      'Audit Engagement',        'ارتباط مراجعة',         true,  now() - interval '85 days'),
  ('policy_review',         'Policy Review',           'مراجعة سياسة',          true,  now() - interval '80 days'),
  ('training_session',      'Training Session',        'جلسة تدريب',            true,  now() - interval '75 days'),
  ('committee_meeting',     'Committee Meeting',       'اجتماع لجنة',           true,  now() - interval '70 days'),
  ('external_audit_visit',  'External Audit Visit',    'زيارة مراجعة خارجية',   false, now() - interval '65 days'),
  ('sharia_board_meeting',  'Sharia Board Meeting',    'اجتماع هيئة شرعية',     true,  now() - interval '60 days')
ON CONFLICT (key) DO NOTHING;

-- 10. training_employees
INSERT INTO public.training_employees (name, email, department, is_saudi, overall_progress, created_at)
SELECT v.name, v.email, v.department, v.is_saudi, v.overall_progress, v.created_at
FROM (VALUES
  ('Ahmed Al-Saud',      'ahmed.alsaud@example.bank.sa',      'compliance',  true,  85,  now() - interval '80 days'),
  ('Fatima Al-Qahtani',  'fatima.alqahtani@example.bank.sa',  'risk',        true,  72,  now() - interval '75 days'),
  ('Khalid Al-Otaibi',   'khalid.alotaibi@example.bank.sa',   'audit',       true,  60,  now() - interval '70 days'),
  ('Mona Al-Harbi',      'mona.alharbi@example.bank.sa',      'cyber',       true,  90,  now() - interval '65 days'),
  ('Saud Al-Dosari',     'saud.aldosari@example.bank.sa',     'finance',     true,  55,  now() - interval '55 days'),
  ('Hessa Al-Mutairi',   'hessa.almutairi@example.bank.sa',   'legal',       true,  78,  now() - interval '45 days'),
  ('Faisal Al-Subaie',   'faisal.alsubaie@example.bank.sa',   'it',          true,  88,  now() - interval '35 days'),
  ('Reem Al-Shehri',     'reem.alshehri@example.bank.sa',     'operations',  true,  68,  now() - interval '25 days')
) AS v(name, email, department, is_saudi, overall_progress, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.training_employees te WHERE te.email = v.email
);

-- 11. letter_templates
INSERT INTO public.letter_templates (
  name, type, icon, color, description, status,
  default_subject_en, default_subject_ar, default_body_en, default_body_ar,
  default_signer_name, default_signer_title, default_signer_name_ar, default_signer_title_ar,
  default_recipient_name, default_recipient_org, default_recipient_city,
  default_recipient_name_ar, default_recipient_org_ar, default_recipient_city_ar,
  placeholder_defs, created_at
)
SELECT v.name, v.type, v.icon, v.color, v.description, 'active',
       v.subj_en, v.subj_ar, v.body_en, v.body_ar,
       v.signer_en, v.signer_title_en, v.signer_ar, v.signer_title_ar,
       v.rcpt_name_en, v.rcpt_org_en, v.rcpt_city_en,
       v.rcpt_name_ar, v.rcpt_org_ar, v.rcpt_city_ar,
       v.placeholders::jsonb, v.created_at
FROM (VALUES
  ( 'SAMA Quarterly Compliance Report', 'sama', 'FileText', '#0F766E',
    'Template for quarterly SAMA compliance reporting submission.',
    'Quarterly Compliance Report - {{quarter}} {{year}}',
    'تقرير الامتثال الربع سنوي - {{quarter}} {{year}}',
    E'Dear Sir/Madam,\n\nWe hereby submit our quarterly compliance report for {{quarter}} {{year}} covering all regulatory obligations and risk indicators.\n\nFindings: {{findings_summary}}\nRemediation actions: {{remediation_status}}\n\nKind regards,\n{{signer_name}}',
    E'تحية طيبة وبعد،\n\nنرفق طيه تقرير الامتثال الربع سنوي عن {{quarter}} {{year}} الذي يغطي جميع الالتزامات التنظيمية ومؤشرات المخاطر.\n\nالملاحظات: {{findings_summary}}\nالإجراءات التصحيحية: {{remediation_status}}\n\nوتقبلوا فائق الاحترام،\n{{signer_name}}',
    'Compliance Officer', 'Chief Compliance Officer', 'مسؤول الامتثال', 'رئيس قسم الامتثال',
    'Banking Supervision Department', 'Saudi Central Bank (SAMA)', 'Riyadh',
    'إدارة الرقابة المصرفية', 'البنك المركزي السعودي (ساما)', 'الرياض',
    '[{"key":"quarter","label":"Quarter","type":"text"},{"key":"year","label":"Year","type":"text"},{"key":"findings_summary","label":"Findings Summary","type":"textarea"},{"key":"remediation_status","label":"Remediation Status","type":"textarea"}]',
    now() - interval '70 days'
  ),
  ( 'Sharia Audit Response Template', 'internal', 'BookOpen', '#7C3AED',
    'Internal template for responding to Sharia Board audit findings.',
    'Response to Sharia Audit Finding {{finding_ref}}',
    'الرد على ملاحظة المراجعة الشرعية {{finding_ref}}',
    E'Honorable Sharia Board,\n\nIn response to audit finding {{finding_ref}} dated {{finding_date}}, we provide the following:\n\nRoot cause: {{root_cause}}\nCorrective action: {{corrective_action}}\nTarget completion: {{target_date}}',
    E'هيئة الرقابة الشرعية الموقرة،\n\nردًا على ملاحظة المراجعة رقم {{finding_ref}} بتاريخ {{finding_date}}، نفيدكم بالآتي:\n\nالسبب الجذري: {{root_cause}}\nالإجراء التصحيحي: {{corrective_action}}\nتاريخ الإنجاز المستهدف: {{target_date}}',
    'Head of Sharia Compliance', 'Director of Sharia Compliance', 'رئيس الالتزام الشرعي', 'مدير الالتزام الشرعي',
    'Sharia Supervisory Board', 'Internal Sharia Board', 'Riyadh',
    'هيئة الرقابة الشرعية', 'الهيئة الشرعية الداخلية', 'الرياض',
    '[{"key":"finding_ref","label":"Finding Reference","type":"text"},{"key":"finding_date","label":"Finding Date","type":"date"},{"key":"root_cause","label":"Root Cause","type":"textarea"},{"key":"corrective_action","label":"Corrective Action","type":"textarea"},{"key":"target_date","label":"Target Completion","type":"date"}]',
    now() - interval '55 days'
  ),
  ( 'CMA Disclosure Notice', 'cma', 'Megaphone', '#2563EB',
    'Event-driven disclosure notice for the Capital Market Authority.',
    'Material Event Disclosure - {{event_type}}',
    'إفصاح حدث جوهري - {{event_type}}',
    E'To: Capital Market Authority\n\nWe disclose the following material event:\n\nEvent type: {{event_type}}\nEvent date: {{event_date}}\nDescription: {{event_description}}\nFinancial impact: {{financial_impact}}\n\nRegards,\n{{signer_name}}',
    E'إلى: هيئة السوق المالية\n\nنفصح عن الحدث الجوهري التالي:\n\nنوع الحدث: {{event_type}}\nتاريخ الحدث: {{event_date}}\nالوصف: {{event_description}}\nالأثر المالي: {{financial_impact}}\n\nمع التحية،\n{{signer_name}}',
    'Investor Relations', 'Head of Investor Relations', 'علاقات المستثمرين', 'رئيس علاقات المستثمرين',
    'Issuance Department', 'Capital Market Authority (CMA)', 'Riyadh',
    'إدارة الإصدار', 'هيئة السوق المالية', 'الرياض',
    '[{"key":"event_type","label":"Event Type","type":"text"},{"key":"event_date","label":"Event Date","type":"date"},{"key":"event_description","label":"Description","type":"textarea"},{"key":"financial_impact","label":"Financial Impact","type":"textarea"}]',
    now() - interval '40 days'
  ),
  ( 'Internal Audit Finding Response', 'internal', 'ClipboardCheck', '#EA580C',
    'Standard response template for Internal Audit findings.',
    'Response to Internal Audit Finding {{finding_id}}',
    'الرد على ملاحظة المراجعة الداخلية {{finding_id}}',
    E'Internal Audit Team,\n\nWe acknowledge audit finding {{finding_id}} and provide the following management response:\n\nManagement response: {{management_response}}\nAction owner: {{action_owner}}\nDue date: {{due_date}}',
    E'فريق المراجعة الداخلية،\n\nنقر باستلام ملاحظة المراجعة رقم {{finding_id}} ونقدم رد الإدارة التالي:\n\nرد الإدارة: {{management_response}}\nمسؤول التنفيذ: {{action_owner}}\nتاريخ الاستحقاق: {{due_date}}',
    'Department Head', 'Department Director', 'رئيس القسم', 'مدير القسم',
    'Internal Audit Department', 'Internal Audit', 'Head Office',
    'إدارة المراجعة الداخلية', 'المراجعة الداخلية', 'المكتب الرئيسي',
    '[{"key":"finding_id","label":"Finding ID","type":"text"},{"key":"management_response","label":"Management Response","type":"textarea"},{"key":"action_owner","label":"Action Owner","type":"text"},{"key":"due_date","label":"Due Date","type":"date"}]',
    now() - interval '25 days'
  )
) AS v(name, type, icon, color, description,
       subj_en, subj_ar, body_en, body_ar,
       signer_en, signer_title_en, signer_ar, signer_title_ar,
       rcpt_name_en, rcpt_org_en, rcpt_city_en,
       rcpt_name_ar, rcpt_org_ar, rcpt_city_ar,
       placeholders, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.letter_templates lt WHERE lt.name = v.name);

-- 12. letters (priority/status constraint-aware)
INSERT INTO public.letters (
  reference, authority, type, subject, subject_ar, body, body_ar, status, priority,
  created_by, response_deadline, sent_date, response_received_date,
  recipient_name, recipient_org, recipient_city,
  recipient_name_ar, recipient_org_ar, recipient_city_ar,
  signer_name, signer_title, signer_name_ar, signer_title_ar,
  framework_ids, created_at
)
SELECT v.reference, v.authority, v.type, v.subject, v.subject_ar, v.body, v.body_ar,
       v.status, v.priority,
       'c5a105da-4b42-4152-abbc-af517e8c70cc'::uuid,
       v.response_deadline, v.sent_date, v.response_received,
       v.rcpt_name, v.rcpt_org, v.rcpt_city,
       v.rcpt_name_ar, v.rcpt_org_ar, v.rcpt_city_ar,
       v.signer_name, v.signer_title, v.signer_name_ar, v.signer_title_ar,
       v.framework_ids::text[], v.created_at
FROM (VALUES
  ('SAMA-2026-001', 'sama', 'regulatory_directive',
    'Q1 2026 Capital Adequacy Reporting Requirements',
    'متطلبات تقارير كفاية رأس المال للربع الأول 2026',
    E'Dear Bank,\n\nKindly find attached the updated capital adequacy reporting templates for Q1 2026. Submissions must reach SAMA by April 30, 2026.',
    E'تحية طيبة،\n\nنرفق نماذج تقرير كفاية رأس المال المحدثة للربع الأول 2026. يجب أن تصل المعلومات إلى ساما بحلول 30 أبريل 2026.',
    'draft', 'urgent',
    (now() + interval '45 days')::timestamptz, NULL::timestamptz, NULL::timestamptz,
    'Banking Supervision Department', 'Saudi Central Bank (SAMA)', 'Riyadh',
    'إدارة الرقابة المصرفية', 'البنك المركزي السعودي (ساما)', 'الرياض',
    'Hani Moustafa', 'Chief Compliance Officer', 'هاني مصطفى', 'رئيس قسم الامتثال',
    ARRAY['sama'], now() - interval '12 days'),
  ('SAMA-2026-002', 'sama', 'compliance_notice',
    'AML/CFT Annual Self-Assessment Submission',
    'تقديم التقييم الذاتي السنوي لمكافحة غسل الأموال وتمويل الإرهاب',
    E'Dear Compliance Team,\n\nThe annual AML/CFT self-assessment is now open. Please complete and submit by the deadline.',
    E'فريق الامتثال،\n\nتم فتح التقييم الذاتي السنوي لمكافحة غسل الأموال وتمويل الإرهاب. يرجى إكماله وتسليمه قبل الموعد النهائي.',
    'sent', 'standard',
    (now() + interval '20 days')::timestamptz, (now() - interval '10 days')::timestamptz, NULL::timestamptz,
    'Consumer Protection Department', 'Saudi Central Bank (SAMA)', 'Riyadh',
    'إدارة حماية المستهلك', 'البنك المركزي السعودي (ساما)', 'الرياض',
    'Hani Moustafa', 'Chief Compliance Officer', 'هاني مصطفى', 'رئيس قسم الامتثال',
    ARRAY['sama'], now() - interval '30 days'),
  ('CMA-2026-042', 'cma', 'regulatory_inquiry',
    'Request for Clarification - Disclosure Practices',
    'طلب توضيح - ممارسات الإفصاح',
    E'To CMA,\n\nWe request clarification on the disclosure timing for material events occurring outside trading hours.',
    E'إلى هيئة السوق المالية،\n\nنطلب توضيحًا حول توقيت الإفصاح عن الأحداث الجوهرية التي تقع خارج ساعات التداول.',
    'pending-approval', 'standard',
    (now() + interval '30 days')::timestamptz, NULL::timestamptz, NULL::timestamptz,
    'Issuance Department', 'Capital Market Authority (CMA)', 'Riyadh',
    'إدارة الإصدار', 'هيئة السوق المالية', 'الرياض',
    'Hani Moustafa', 'Investor Relations Lead', 'هاني مصطفى', 'رئيس علاقات المستثمرين',
    ARRAY['cma'], now() - interval '8 days'),
  ('IA-2026-014', 'ia', 'audit_finding',
    'Insurance Compliance Audit Finding Response',
    'رد على ملاحظات تدقيق الامتثال التأميني',
    E'Dear Insurance Authority,\n\nWe acknowledge audit finding IA-2026-014 and provide our remediation plan herewith.',
    E'إلى هيئة التأمين،\n\nنقر باستلام ملاحظة التدقيق IA-2026-014 ونرفق خطة المعالجة.',
    'response-received', 'urgent',
    (now() - interval '5 days')::timestamptz, (now() - interval '40 days')::timestamptz, (now() - interval '3 days')::timestamptz,
    'Compliance Department', 'Insurance Authority (IA)', 'Riyadh',
    'إدارة الامتثال', 'هيئة التأمين', 'الرياض',
    'Hani Moustafa', 'Chief Compliance Officer', 'هاني مصطفى', 'رئيس قسم الامتثال',
    ARRAY['ia'], now() - interval '50 days'),
  ('ZATCA-2026-007', 'zatca', 'regulatory_inquiry',
    'VAT Treatment of Islamic Finance Products',
    'المعالجة الضريبية لمنتجات التمويل الإسلامي',
    E'To ZATCA,\n\nWe request guidance on the VAT treatment of newly launched Islamic finance products under Murabaha structure.',
    E'إلى هيئة الزكاة،\n\nنطلب إرشادات حول المعالجة الضريبية لمنتجات التمويل الإسلامي المطلقة حديثًا تحت هيكل المرابحة.',
    'draft', 'standard',
    (now() + interval '60 days')::timestamptz, NULL::timestamptz, NULL::timestamptz,
    'VAT Department', 'Zakat, Tax and Customs Authority (ZATCA)', 'Riyadh',
    'إدارة ضريبة القيمة المضافة', 'هيئة الزكاة والضريبة والجمارك', 'الرياض',
    'Hani Moustafa', 'Tax Lead', 'هاني مصطفى', 'رئيس الضرائب',
    ARRAY['zatca'], now() - interval '4 days')
) AS v(reference, authority, type, subject, subject_ar, body, body_ar, status, priority,
       response_deadline, sent_date, response_received,
       rcpt_name, rcpt_org, rcpt_city, rcpt_name_ar, rcpt_org_ar, rcpt_city_ar,
       signer_name, signer_title, signer_name_ar, signer_title_ar,
       framework_ids, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.letters l WHERE l.reference = v.reference);

-- 13. observations (source/status constraint-aware)
INSERT INTO public.observations (
  title, description, source, severity, status, due_date, department, reference,
  progress, creator_id, framework_ids, created_at
)
SELECT v.title, v.description, v.source, v.severity, v.status, v.due_date,
       v.department, v.reference, v.progress,
       'c5a105da-4b42-4152-abbc-af517e8c70cc'::uuid,
       v.framework_ids::text[], v.created_at
FROM (VALUES
  ('Inadequate KYC documentation for high-risk clients',
   'Sample review found 12% of high-risk client files missing updated source-of-funds documentation, contravening SAMA AML guidelines.',
   'internal', 'high', 'in_progress', (now() + interval '30 days')::date,
   'compliance', 'OBS-2026-101', 45, ARRAY['sama'], now() - interval '25 days'),
  ('Delayed patching on perimeter firewalls',
   'IT scan revealed several perimeter firewall devices running firmware versions 2 cycles behind the vendor patch baseline.',
   'internal', 'medium', 'open', (now() + interval '14 days')::date,
   'cyber', 'OBS-2026-102', 10, ARRAY['nca-ecc','sama'], now() - interval '15 days'),
  ('Outdated Sharia approval documentation',
   'Sharia approval certificates for two structured products have lapsed and require renewal by the Sharia Board.',
   'sharia', 'high', 'open', (now() + interval '21 days')::date,
   'compliance', 'OBS-2026-103', 0, ARRAY['sharia-board'], now() - interval '6 days')
) AS v(title, description, source, severity, status, due_date, department, reference, progress, framework_ids, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.observations o WHERE o.reference = v.reference);

-- Audits (type/status constraint-aware)
INSERT INTO public.audits (title, type, status, due_date, progress, description, category, frequency, priority, framework_ids, created_at)
SELECT v.title, v.type, v.status, v.due_date, v.progress, v.description, v.category, v.frequency, v.priority, v.framework_ids::text[], v.created_at
FROM (VALUES
  ('Annual SAMA Compliance Audit 2026',          'sama',     'in_progress', (now() + interval '60 days')::date, 35, 'Comprehensive review of SAMA regulatory compliance across all operating units.', 'regulatory-audit',  'annual',    'high',   ARRAY['sama'],                now() - interval '40 days'),
  ('Q1 2026 IT Security Audit',                  'internal', 'pending',     (now() + interval '45 days')::date,  0, 'Quarterly IT security and access control audit covering core banking systems.',  'it-security-audit', 'quarterly', 'medium', ARRAY['nca-ecc','iso-27001'], now() - interval '20 days'),
  ('Sharia Compliance Audit - Retail Products',  'sharia',   'pending',     (now() + interval '75 days')::date,  0, 'Sharia compliance audit of retail banking financing products.',                  'sharia-audit',      'annual',    'high',   ARRAY['sharia-board'],         now() - interval '10 days')
) AS v(title, type, status, due_date, progress, description, category, frequency, priority, framework_ids, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.audits a WHERE a.title = v.title);

-- Risks (category/status constraint-aware)
INSERT INTO public.risks (title, description, category, likelihood, impact, status, mitigation_plan, mitigation_progress, monitoring_frequency, framework_ids, created_at)
SELECT v.title, v.description, v.category, v.likelihood, v.impact, v.status, v.mitigation_plan, v.mitigation_progress, v.monitoring_frequency, v.framework_ids::text[], v.created_at
FROM (VALUES
  ('Cyber-attack on core banking systems',        'Risk of targeted cyber-attacks against core banking infrastructure leading to data breach and service disruption.', 'operational', 4, 5, 'mitigating', 'Implement zero-trust architecture, MFA on all admin accounts, and quarterly red-team exercises.', 35, 'monthly',   ARRAY['nca-ecc','sama'], now() - interval '60 days'),
  ('Regulatory change affecting capital ratios',  'Anticipated SAMA changes to capital adequacy requirements may increase regulatory capital demand.',                  'compliance',  3, 4, 'identified', 'Monitor SAMA consultations and run capital impact stress tests quarterly.',                            10, 'quarterly', ARRAY['sama'],          now() - interval '30 days'),
  ('Liquidity stress in adverse market scenario', 'Potential liquidity shortfall under combined market and credit stress scenarios.',                                    'financial',   2, 5, 'mitigating', 'Maintain HQLA buffers above regulatory minimums and run monthly LCR stress tests.',                     55, 'monthly',   ARRAY['sama','cma'],    now() - interval '15 days')
) AS v(title, description, category, likelihood, impact, status, mitigation_plan, mitigation_progress, monitoring_frequency, framework_ids, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.risks r WHERE r.title = v.title);

-- Policies (category/status/approval_tier constraint-aware)
INSERT INTO public.policies (ref_code, name, description, status, category, version, approval_tier, owner_name, owner_department, framework_ids, affected_departments, last_review_date, next_review_date, approved_date, created_at)
SELECT v.ref_code, v.name, v.description, v.status, v.category, v.version, v.approval_tier, v.owner_name, v.owner_department, v.framework_ids::text[], v.affected_departments::text[], v.last_review_date, v.next_review_date, v.approved_date, v.created_at
FROM (VALUES
  ('POL-INFOSEC-001', 'Information Security Policy',    'Establishes the framework for protecting information assets across the institution.',           'approved',    'it',         'v2.1', 'board',     'Hani Moustafa', 'cyber',      ARRAY['nca-ecc','iso-27001','sama'], ARRAY['cyber','it','compliance'],         (now() - interval '180 days')::date, (now() + interval '185 days')::date, (now() - interval '170 days')::date, now() - interval '180 days'),
  ('POL-AML-001',     'AML/CFT Policy',                 'Defines the institution''s approach to anti-money laundering and counter-terrorism financing.', 'approved',    'compliance', 'v3.0', 'board',     'Hani Moustafa', 'compliance', ARRAY['sama'],                       ARRAY['compliance','operations','risk'],  (now() - interval '90 days')::date,  (now() + interval '275 days')::date, (now() - interval '85 days')::date,  now() - interval '90 days'),
  ('POL-DATA-001',    'Data Privacy & PDPL Compliance', 'Governs personal data processing in line with the Saudi Personal Data Protection Law.',         'under-review','compliance', 'v1.2', 'management','Hani Moustafa', 'legal',      ARRAY['pdpl'],                       ARRAY['legal','it','compliance'],         (now() - interval '30 days')::date,  (now() + interval '335 days')::date, NULL::date,                          now() - interval '30 days')
) AS v(ref_code, name, description, status, category, version, approval_tier, owner_name, owner_department, framework_ids, affected_departments, last_review_date, next_review_date, approved_date, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.policies p WHERE p.ref_code = v.ref_code);

COMMIT;

NOTIFY pgrst, 'reload schema';
