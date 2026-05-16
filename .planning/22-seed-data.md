# Phase 22 — Realistic Saudi GRC Seed Data

Project: `qdbitfgxbnbzkqhdoepd`
Migration: `supabase/migrations/034_seed_realistic_data.sql`
Test admin: `c5a105da-4b42-4152-abbc-af517e8c70cc`
Applied as 2 chunks (`_part1`, `_part2`) via `mcp__supabase__apply_migration`. The canonical single-file version in the migrations folder is idempotent and replays cleanly.

## Per-table delta

| Table | Before | After | Inserted |
|---|---|---|---|
| letter_types | 1 | 9 | +8 |
| framework_sub_categories | 1 | 14 | +13 (SAMA x4, CMA x4, NCA-ECC x3, Sharia x2) |
| correspondence_types | 1 | 7 | +6 |
| policy_categories | 0 | 8 | +8 |
| audit_categories | 0 | 6 | +6 |
| risk_categories | 0 | 8 | +8 |
| business_units | 0 | 7 | +7 |
| authority_departments | 1 | 8 | +7 (SAMA x3, CMA, IA, CITC, ZATCA) |
| calendar_event_types | 1 | 8 | +7 |
| training_employees | 0 | 8 | +8 (distributed across compliance/risk/audit/cyber/finance/legal/it/operations) |
| letter_templates | 0 | 4 | +4 (SAMA Quarterly, Sharia Audit Response, CMA Disclosure, Internal Audit Response) |
| letters | 4 | 9 | +5 across SAMA(2), CMA(1), IA(1), ZATCA(1) |
| observations | 5 | 8 | +3 |
| audits | 0 | 3 | +3 |
| risks | 0 | 3 | +3 |
| policies | 0 | 3 | +3 |

**Total rows inserted:** 99 across 16 tables.

## Schema surprises that forced deviation from the original plan

1. **`letters.priority` CHECK constraint** allows only `{standard, urgent}` (not `high`, `medium`, etc.). Initial migration attempt failed with `sama_letters_priority_check`. Switched all "high" priorities to `urgent`.
2. **`letters.status` CHECK constraint** allows only `{draft, pending-approval, approved, sent, response-received, overdue}`. Original plan used `submitted_for_approval` and `received_response`, which were rewritten to `pending-approval` and `response-received`.
3. **`observations.source` CHECK constraint** allows only `{sama, internal, sharia}`. Original plan used finer-grained sources like `internal_audit`, `it_security_scan`, `sharia_review`, all collapsed to the allowed set.
4. **`observations.status` CHECK constraint** uses snake_case `in_progress` (not `in-progress`).
5. **`audits.type` CHECK constraint** allows only `{internal, sama, sharia}`. Initial plan used `regulatory` — switched the SAMA audit to type `sama`.
6. **`audits.status`** uses `in_progress` snake_case (not `in-progress`).
7. **`risks.category` CHECK constraint** allows only `{operational, financial, compliance, strategic, reputational}` (does NOT match `risk_categories` table values like `cybersecurity-risk`, `liquidity-risk`, etc.). The `risk_categories` lookup table is for the UI dropdown; the column on `risks` itself enforces a narrower domain. Cyber/IT risks were mapped to `operational`, liquidity to `financial`.
8. **`policies.category` CHECK constraint** allows only `{compliance, it, operations, risk, hr, finance}` (does NOT match `policy_categories` lookup values like `information-security`, `aml`, `data-privacy`). Same pattern: the lookup table feeds the picker; the column itself uses a narrower fixed enum. Mapped accordingly.
9. **`policies.approval_tier` CHECK constraint** allows only `{board, management, sharia, agm}` — switched `executive` to `management`.
10. **`authority_departments` has no UNIQUE constraint** on `(authority_id, name_en)`, so used `WHERE NOT EXISTS` guards instead of `ON CONFLICT`.
11. **`training_employees` has no natural-key UNIQUE** either — guarded on `email`.
12. **`letter_templates` PK constraint name** is still `sama_letter_templates_pkey` (legacy from the rename), but the table itself is `letter_templates`. No functional issue.
13. **`frameworks` table has no `key` column** — only `id` (text). The initial intro query failed; this is fine since seeds only need framework_id references.

## What's NOT seeded and why

- **`frameworks`** — already had 11 rows. No seeding needed.
- **`departments`** — already had 12 rows. No seeding needed.
- **`training_categories`** — already had 5 rows. No seeding needed.
- **`auth.users` / `profiles`** — per hard rules, NOT touched. Sample team members go to `training_employees` only.

## Data tagging / authority distribution

- **Letters by authority:** SAMA x2 (incl. existing 4 SAMA-prefixed), CMA x1, IA x1, ZATCA x1. Five distinct `authority` tags across the new rows: sama, sama, cma, ia, zatca.
- **Statuses across new letters:** draft, sent, pending-approval, response-received, draft.
- **Frameworks referenced in new domain rows:** sama, cma, ia, zatca, nca-ecc, iso-27001, sharia-board, pdpl.
- **Departments referenced:** compliance, risk, audit, cyber, finance, legal, it, operations.

## Idempotency

The single-file migration `034_seed_realistic_data.sql` uses:
- `ON CONFLICT (key) DO NOTHING` for lookup tables with UNIQUE(key).
- `ON CONFLICT (framework_id, key) DO NOTHING` for `framework_sub_categories`.
- `WHERE NOT EXISTS (...)` guards for tables without natural-key UNIQUE constraints (authority_departments, training_employees, letter_templates, letters, observations, audits, risks, policies).

Replay-safe — re-running inserts 0 new rows. Ends with `NOTIFY pgrst, 'reload schema';`.

---

**SEED DONE. Tables seeded: 16. Rows inserted: 99.**
