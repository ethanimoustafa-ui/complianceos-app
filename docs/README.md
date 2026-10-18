# Documentation

Start with the root [README](../README.md) (setup) and [AI.md](../AI.md) (architecture + conventions).
This folder holds everything deeper. Docs are grouped by **how much you can trust them today**.

## `architecture/` — how the system works (maintained)

| Doc | What it covers |
|---|---|
| [BACKEND-API-MAP.md](architecture/BACKEND-API-MAP.md) | The backend contract: tables, ~160 endpoints, RBAC matrix, scoring, jobs, caching. Code comments cite it as `BACKEND-API-MAP §N`. Written 2026-05-15, so check details against the code. |
| [OPTIMIZATION-PATTERNS.md](architecture/OPTIMIZATION-PATTERNS.md) | The five patterns every store, route and page follows: optimistic mutations, skeleton boundaries, button loading, hard-delete cascade, request budget. Cited as `OPTIMIZATION-PATTERNS §N`. |
| [latex-pdf-generation-design.md](architecture/latex-pdf-generation-design.md) | Design of the xelatex PDF pipeline (`src/lib/pdf/latex`, `services/latex-renderer`). |
| [INPUT-ERROR-MESSAGING-AUDIT.md](architecture/INPUT-ERROR-MESSAGING-AUDIT.md) | Rules for user-facing error messages, plus the audit that applied them. |

## `operations/` — running it in production

| Doc | What it covers |
|---|---|
| [PRODUCTION-READINESS.md](operations/PRODUCTION-READINESS.md) | Work deliberately deferred until go-live (rate limiting, HSTS, CSP, RLS tightening…). Cited as `PR-N`. **Read before any production deploy.** |
| [SUBSCRIPTIONS.md](operations/SUBSCRIPTIONS.md) | Monthly running costs: Vercel, Supabase, Resend, Render. |
| [FIREBASE-MIGRATION.md](operations/FIREBASE-MIGRATION.md) | Planned move to GCP Dammam (`me-central2`) for KSA data residency. Not started. |

## `product/` — what we're building

| Doc | What it covers |
|---|---|
| [PRODUCT-BACKLOG.md](product/PRODUCT-BACKLOG.md) | Epic/story backlog with status. Last bulk update 2026-05-09, so it trails the code; `git log` is more current. |
| [scope/](product/scope/) | Original project scope (v3 .docx) and the "Technical Concerns" pushback notes. |
| `ComplianceOS_Architecture.xlsx` | Onboarding archetypes spreadsheet (Feb 2026): regulatory authorities, frameworks, internal governance. |

## `help-center/` — in-app help content

Articles for the in-app Help Center, plus the switch that turns it on (`src/config/help-center.ts`). See [help-center/README.md](help-center/README.md).

## `history/` — point-in-time reports (NOT maintained)

These describe the codebase **on the date they were written**. They're useful for archaeology
("why is it like this?"). Don't treat them as current instructions: file paths, counts and "next steps" inside them may be stale.

| Doc | Date | What it was |
|---|---|---|
| [MIGRATION_GUIDE.md](history/MIGRATION_GUIDE.md) | Jan 2026 | Plan for porting the static HTML prototype to Next.js. |
| [HANDOFF.md](history/HANDOFF.md) | 2026-05-16 | Backend handoff after phases 0–10 (Supabase build-out). |
| [OPTIMIZATION-BASELINE.md](history/OPTIMIZATION-BASELINE.md) | 2026-05-17 | Supabase request-count baseline before the perf pass. |
| [NIGHT-SHIFT-SUMMARY.md](history/NIGHT-SHIFT-SUMMARY.md) | 2026-05-18 | Hard-delete cascade + skeleton/optimistic parity pass across 9 pages. |
| [FINAL-VERIFICATION.md](history/FINAL-VERIFICATION.md) | 2026-05-18 | 17-page Playwright sweep results + request budgets. |
| [QA-REPORT.md](history/QA-REPORT.md) | 2026-06-19 | Real-browser QA walkthrough of features shipped that month. |

## Docs that live next to the code

- [`src/lib/email/README.md`](../src/lib/email/README.md): email foundation, providers, env vars.
- [`services/latex-renderer/README.md`](../services/latex-renderer/README.md): the xelatex container (deploy and local Docker).
- [`tests/README.md`](../tests/README.md): the three kinds of tests and how to run each.
