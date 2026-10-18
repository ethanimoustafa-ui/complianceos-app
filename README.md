# ComplianceOS

**Governance, Risk & Compliance (GRC) platform for Saudi financial institutions.** One place to track
regulator circulars and letters, policies, audits, observations, risks, training and deadlines,
with a live compliance score. Fully bilingual (English / Arabic with RTL).

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand and Supabase (Postgres, Auth, Storage, RLS).

> **Status:** single-tenant MVP (`v0.1.0`, alpha). Feature-complete enough to demo and pilot.
> Production hardening is tracked in [docs/operations/PRODUCTION-READINESS.md](docs/operations/PRODUCTION-READINESS.md).

**New to the codebase?** Read [AI.md](AI.md). It's the architecture and conventions guide, written so
that a developer *or* an AI coding agent can get productive quickly.

---

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Executive, managerial and officer views. Compliance health score, per-framework compliance, approvals, "my work", team workload. |
| **Regulatory updates** | Circulars/rules with implementation workflows and checklists. Policy register with versioning, approval steps and review cadence. Combined registry. |
| **Correspondence** | Letters to regulators (SAMA etc.) with templates, smart placeholders, multi-step approvals, signatures and branded bilingual PDFs. Advisory requests and a correspondence feed. |
| **Observations** | Findings from SAMA, internal audit, Sharia board and external sources. Severity, remediation plans, evidence, closure requests. |
| **Audits & risks** | Audit cycles, tasks and documents. Risk register with a 5×5 heat map and department mitigation workflow. |
| **Reports** | Compliance review (per-rule × per-department), audits, risks, executive "Team Score" with a fiscal-year trend, detailed audit log. CSV and PDF export. |
| **Team** | Directory, role-based access matrix (auditor < officer < manager < admin), activity logs, training assignments. |
| **Calendar** | Unified deadlines and events with deep links into the underlying item. |
| **Notifications & email** | In-app notifications, overdue-item escalation, a role-aware daily digest email. |
| **Settings** | Frameworks and thresholds, departments, categories and enums, templates, preferences. |

Security model: every API route authenticates and checks permissions, and Postgres Row-Level Security
enforces the same permissions again in the database. Permissions travel in the JWT through a Supabase
custom access token hook.

---

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Route Handlers, `src/proxy.ts`) |
| UI | React 19, Tailwind CSS 4, Iconify (Lucide icons) |
| State / forms | Zustand 5, React Hook Form, Zod 4 |
| Backend | Supabase: Postgres + RLS, Auth, Storage. 125 SQL migrations in `supabase/migrations` |
| PDFs | `@react-pdf/renderer` + a xelatex microservice ([services/latex-renderer](services/latex-renderer)) for branded Arabic/English documents |
| Email | Resend (falls back to console logging when not configured) |
| Hosting | Vercel (app + cron); Render (LaTeX renderer) |
| Tests | Vitest (unit), Playwright (e2e), tsx API probes |

---

## Getting started

### Prerequisites

- **Node.js ≥ 20.9** (required by Next.js 16)
- A **Supabase** project (the free tier works for development)
- Optional: Docker, to run the LaTeX renderer locally

### 1. Install

```bash
git clone <this repo>
cd complianceos-app
npm install
```

### 2. Set up the database

1. Apply every file in `supabase/migrations/` **in filename order** (Supabase SQL editor or the
   Supabase MCP server). They create the schema, RLS policies, RPCs, storage buckets and seed data.
   There is no Supabase CLI config yet, and two numbers (025, 026) are each used by two files, so a
   CLI-based `db push` needs those renamed first.
2. In Supabase Studio → **Auth → Hooks**, enable **Custom Access Token Hook** →
   `public.custom_access_token_hook` (from migration 028). Without it, permissions fall back to slower DB lookups.
3. Migrations 024 and 090 seed **development accounts** (e.g. `admin@complianceos.local`) with a shared
   dev password (see `tests/e2e/_helpers/sign-in.ts`). **Change or delete these accounts on any
   environment reachable by others.**

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`. Every variable is documented in [.env.example](.env.example).

### 4. Run

```bash
npm run dev        # http://localhost:3000
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm test` / `npm run test:watch` | Unit tests (Vitest) |
| `npx playwright test` | End-to-end tests (starts the dev server if needed) |
| `npx tsx tests/probes/<name>.ts` | API probes against a running dev server |
| `npm run generate:spec` | Regenerate the legacy backend-requirements `.docx` |

See [tests/README.md](tests/README.md) for how the three test layers work.

---

## Project structure

```
src/
  app/            Pages: (auth), (dashboard), welcome. API: app/api (~210 Route Handlers)
  components/     ui/ primitives + one folder per feature area
  stores/         Zustand stores (client cache of server state)
  hooks/          Data and navigation hooks
  i18n/           useTranslation + en/ar dictionaries
  lib/            api/ (server helpers, Zod schemas, services, scoring), supabase/, rbac/,
                  pdf/, export/, email/, escalation/, format/, letters/, workflow/
  types/          Shared domain types
  proxy.ts        Page-level auth gate
supabase/migrations/   Database schema, RLS, RPCs and seeds (ordered)
services/latex-renderer/  xelatex → PDF microservice (Docker)
tests/            unit/ · e2e/ · probes/
docs/             architecture/ · operations/ · product/ · help-center/ · history/
```

The full annotated map, request flow and coding conventions are in [AI.md](AI.md).

---

## Deployment

- **App:** Vercel. Set the env vars from `.env.example`. `vercel.json` registers two crons:
  `/api/cron/jobs-run` (every minute; background PDF and email jobs) and `/api/cron/daily`
  (escalations, digest, cleanup). Per-minute cron needs Vercel Pro.
- **LaTeX renderer:** build `services/latex-renderer` (Dockerfile) on Render, Cloud Run or similar.
  Set `RENDER_SECRET` there and the same value as `LATEX_RENDER_SECRET` in the app.
- **Email:** verify a sending domain in Resend and set `RESEND_API_KEY` + `EMAIL_FROM`.
- Costs: [docs/operations/SUBSCRIPTIONS.md](docs/operations/SUBSCRIPTIONS.md). Data-residency plan
  (GCP Dammam): [docs/operations/FIREBASE-MIGRATION.md](docs/operations/FIREBASE-MIGRATION.md).

---

## Documentation

| | |
|---|---|
| [AI.md](AI.md) | Architecture, conventions, recipes, known issues. Start here. |
| [docs/README.md](docs/README.md) | Index of all docs (architecture, operations, product, history) |
| [docs/architecture/BACKEND-API-MAP.md](docs/architecture/BACKEND-API-MAP.md) | Backend contract: tables, endpoints, RBAC, scoring |
| [docs/architecture/OPTIMIZATION-PATTERNS.md](docs/architecture/OPTIMIZATION-PATTERNS.md) | Required patterns for stores, routes and pages |
| [docs/operations/PRODUCTION-READINESS.md](docs/operations/PRODUCTION-READINESS.md) | Checklist before going live |

---

## License

[MIT](LICENSE) © 2026 Hani Moustafa
