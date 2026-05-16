-- 035_seed_circulars
--
-- Idempotent seed of 5 realistic regulatory circulars across SAMA / CMA / IA /
-- ZATCA so the /correspondence/regulatory-updates/rules page is populated for
-- demo and dropdown testing. Keyed on `reference` so replays are no-ops.

insert into public.circulars (
  id, reference, authority, title, priority, status, applicability,
  departments, progress, issuance_date, due_date, cap_status,
  description, framework_ids, created_at, updated_at
)
select gen_random_uuid(), v.reference, v.authority, v.title, v.priority, v.status, v.applicability,
       array[]::uuid[], v.progress, v.issuance_date, v.due_date, v.cap_status,
       v.description, array[]::text[], v.created_at, v.created_at
from (values
  ('SAMA-CIRC-2026-001','sama', 'AML Transaction Monitoring Thresholds Update', 'high',     'pending',     'applicable', 0,   '2026-04-15'::date, '2026-08-31'::date, 'pending', 'Revised KYC/AML thresholds for outbound wire transfers; banks must implement enhanced monitoring by 2026-08-31.', now() - interval '20 days'),
  ('SAMA-CIRC-2026-002','sama', 'Capital Adequacy Reporting (Q2)',              'medium',   'in-progress', 'applicable', 30,  '2026-05-01'::date, '2026-07-15'::date, 'in-progress', 'Quarterly Basel III capital adequacy filing due 2026-07-15. Updated templates attached.', now() - interval '7 days'),
  ('CMA-CIRC-2026-014', 'cma',  'Listed Issuer Disclosure of Material Events',  'high',     'pending',     'applicable', 0,   '2026-05-10'::date, '2026-09-30'::date, 'pending', 'New disclosure obligations for listed issuers; deadline 2026-09-30.', now() - interval '3 days'),
  ('IA-CIRC-2026-008',  'ia',   'Insurance Solvency Margin Update',             'critical', 'pending',     'applicable', 0,   '2026-05-05'::date, '2026-10-15'::date, 'pending', 'Mandatory solvency margin increase to 110% by 2026-10-15.', now() - interval '5 days'),
  ('ZATCA-CIRC-2026-022','zatca','VAT E-Invoicing Phase 4 Rollout',             'medium',   'pending',     'applicable', 0,   '2026-04-20'::date, '2026-11-30'::date, 'pending', 'All B2B taxpayers must integrate with FATOORA Phase 4 by 2026-11-30.', now() - interval '14 days')
) as v(reference, authority, title, priority, status, applicability, progress, issuance_date, due_date, cap_status, description, created_at)
where not exists (select 1 from public.circulars c where c.reference = v.reference);

notify pgrst, 'reload schema';
