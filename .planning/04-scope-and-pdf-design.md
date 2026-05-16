# 04 — Scope & PDF Design Synthesis

Sources digested:
- `scope/ComplianceOS_Project_Scope_v3.docx` (extracted to `.planning/_scope-raw.txt`)
- `latex-pdf-generation-design.md`
- `scope/ComplianceOS — Technical Concerns.txt`

---

## 1. Scope summary

**Product.** ComplianceOS is a Governance / Risk / Compliance (GRC) platform for Saudi financial institutions regulated by SAMA. It manages regulator correspondence, observations and remediation, compliance calendars, HR-compliance data (Saudization, training), policies, audits, and executive reporting.

**Users.** Compliance department staff of Saudi financial institutions (banks, insurance, fintech, payment providers, broker-dealers, asset managers). RBAC has **three roles** and **25 permissions** defined by the existing frontend. The engineer does not talk to the compliance department directly — questions flow through Hani.

**Current state.** The frontend is already shipped: Next.js 16 + React 19 + TS 5 + Tailwind 4 + Zustand 5, 32 screens, 29 stores, 95+ TS interfaces. A **585-line compliance scoring engine** already runs in the browser and must be ported to the server bit-for-bit (to 0.1 precision). The client today tracks compliance in Excel + Google Drive — **no legacy migration**; data entry is manual from day one.

**Milestones (Build phase = 8 weeks, milestone-pinned, not date-pinned).**
- **Trial (1 wk).** One self-contained module (recommended: Observations Tracker) end-to-end against the existing frontend contract: schema + RLS + endpoints + versioning + audit log + one background job + tests + handoff doc. Runs on a throwaway GCP project in the Saudi region.
- **Discovery (1 wk).** Final agreed ERD, scoring logic alignment, GCP project + IAM model, all open questions assigned.
- **M1 — Infrastructure & foundations.** GCP project setup, Cloud SQL Postgres, Cloud Run for Express API, Cloud Storage, auth service on Cloud Run, tenant middleware, RLS, users + tenants tables. Exit: JWT login E2E, two-tenant RLS smoke test passes, infra reproducible via Terraform.
- **M2 — Core CRUD.** Audits, observations, risks, policies, circulars, SAMA letters. Exit: 80% of endpoints live, frontend on real API for these modules.
- **M3 — Versioning & audit log.** `entity_versions`, `audit_log`, version + audit endpoints, diff + restore. Exit: observation update produces correct version + audit rows, E2E passes. *(Append-only enforcement at the DB role level is a hard exit gate — see Risks #5.)*
- **M4 — Notifications & messaging.** `notification_preferences`, dispatch + digest jobs, in-app messaging, email via in-Saudi SMTP relay.
- **M5 — Scoring & PDF.** Compliance engine port with golden tests, xelatex pipeline, pdflatex for English, English + at least one Arabic template. Exit: score matches frontend to 0.1, SAMA letter renders in Arabic.
- **Pilot (3 wks).** UAT with compliance dept on real data. Exit: ≥90% of correspondence logged in-platform.
- **Scale (3 wks).** Multi-tenant SaaS readiness. Exit: new tenant onboarded in <1 business day; 3 concurrent tenants, no perf degradation; runbooks for top 10 ops scenarios.

**In scope.** 14 domain modules CRUD; multi-tenancy + RLS on every tenant-scoped table; RBAC (3 roles / 25 perms); compliance scoring engine (two tracks); GitHub-style versioning on every mutable entity (view / diff / restore); central audit log; in-app messaging (per-tenant threads); smart notification system (26 trigger types, in-app + email + Slack, per-user/per-trigger prefs, daily digest); LaTeX PDF generation (7 templates + generic fallback, Arabic/RTL); pg-boss background jobs; normalized status mapping table; quarterly Saudization snapshots (not raw employee rows); configurable training programs; Terraform IaC.

**Out of scope.** AI auto-parsing of SAMA documents; AI auto-assessment of compliance quality; framework-based scoring as a parallel track (frameworks are tags on correspondence, not their own scoring system); legacy data migration; realtime cross-device sync (WebSockets); multi-region DR (single Saudi region only).

**Multitenancy posture — and where the single-tenant MVP diverges.**
The scope is written for **multi-tenant SaaS from day one** (RLS, `tenant_id` on every table, tenant provisioning flow, soft-delete with grace period, service-role pattern for cross-tenant admin work, M5 score-API port to prevent tenant-on-tenant weight leakage). **The orchestrator is building a single-tenant MVP**, so the following items are deferred / simplified now but must be re-instated when the platform moves to Scale:
- `tenant_id` columns and RLS policies — *MVP may omit; Scale-phase will need a migration to retrofit them onto every existing tenant-scoped table. Plan the schema to accept `tenant_id NOT NULL` later without disruptive data backfill (e.g. include `tenant_id` from the start with a default sentinel, or design migrations now).*
- `app.current_tenant_id` / `app.current_user_id` Postgres GUCs — *deferred until multi-tenant.*
- Tenant provisioning + soft-delete + grace-period flows — *not needed for MVP.*
- Frontend-to-server **scoring engine cutover** — Technical-Concerns #4 says the frontend must stop computing scores and read them from the API **before multi-tenant**, otherwise any tenant can read the weights driving every other tenant's scores via browser devtools. For single-tenant MVP this is "low risk" per the doc and may stay client-side, but it is an **explicit M5 deliverable when multi-tenant lands.**
- Scale exit criteria ("3 tenants concurrent, new tenant <1 business day") are by definition Scale-phase work.

**Substitution from orchestrator.** Scope mandates **self-hosted GoTrue on Cloud Run** (with a minimal Express auth fallback). The orchestrator is substituting **Supabase Auth** (managed). The auth *feature surface* below is the contract the orchestrator must still satisfy regardless of provider.

---

## 2. The 14 modules (one line each)

1. **Audits** — Audit lifecycle: scope, lead auditor, findings (severity/owner/remediation), activity log, status transitions.
2. **Observations** — Tracker for compliance observations across regulators: ref, severity, source, status, assignee, due date, resolution.
3. **Risks** — Risk register with 5x5 likelihood × impact matrix, mitigation, owner, treatment, status, heat-map plotting.
4. **Policies** — Internal policy log: versions, owners, review cycles, approvals.
5. **Circulars** — Regulator-issued circulars (SAMA / CMA / etc.) indexed and tagged to obligations.
6. **SAMA letters** — Inbound/outbound correspondence with SAMA specifically: reference, subject, attachments, response deadlines, signatures.
7. **Correspondence** — Generalized regulator correspondence (CMA, IA, ZATCA, MISA, SAFIU, CITC, Sharia Board) feeding into observations.
8. **Advisory** — Advisory notes / opinions on compliance matters (likely Sharia + internal).
9. **Calendar** — Compliance calendar: recurring obligations, deadlines, reminders, regulator events.
10. **Training** — Configurable training programs, completion tracking, certificates.
11. **Team** — Team roster with roles and HR-compliance fields (Saudization aggregate, training status). Saudization is stored as **quarterly summary snapshots, not raw employee rows.**
12. **Reports** — Executive reports: compliance health, framework scores, observations summary, deadlines.
13. **Settings** — Tenant-level configuration: framework applicability, weights, normalization, status mapping, notification preferences.
14. **Messaging** — In-app messaging scoped to a tenant: threads, participants, unread counts.

---

## 3. Auth model (the contract regardless of provider)

The scope's auth feature surface (which Supabase Auth must satisfy or be supplemented to satisfy):

- Signup with email + password.
- Login with email + password, returns **JWT containing `tenant_id`, `user_id`, role claims**.
- Password hashing with **bcrypt or argon2** at correct work factor.
- **Email verification** flow — signup sends single-use link, token expires.
- **Password reset** flow — request → email → single-use token, rate-limited.
- **TOTP MFA** (Google Authenticator / Authy) **with backup codes**.
- **Refresh-token rotation with theft detection** — reuse of a rotated token invalidates the entire session family and raises a security alert.
- **Session revocation + logout-everywhere** — admin can force-logout a user across all devices.
- **Account lockout** after N failed login attempts, **exponential backoff**.
- **Rate limiting** on all auth endpoints (signup, login, password reset, MFA challenge) per IP and per account.
- **Audit log entries** for every auth event (login success / fail, MFA enrolled, password changed, MFA challenged) written to central `audit_log`.
- **Password complexity** rules per SAMA / NCA expectations (min length, character classes, common-password block).
- **Email delivery** from in-region SMTP relay or third-party with Saudi delivery endpoint, so verification/reset emails do not leak metadata cross-border.

**Note for Supabase substitution.** Supabase Auth covers most of this out of the box (rotation, MFA, lockout, password reset) but verify: theft-detection behaviour on refresh-token reuse, session-family invalidation, in-region SMTP for transactional email, and writing every auth event into our own `audit_log` table (Supabase ships its own auth audit but SAMA-style auditors want it inside the platform's tamper-proof log).

---

## 4. PDF / LaTeX requirements (detailed — this is phase input)

### 4.1 Engine decision

Scope v3 says **pdflatex for English, xelatex + polyglossia for Arabic**. **Technical-Concerns #3 overrides this**: use **xelatex + polyglossia for every template, English and Arabic alike**. One engine, one preamble, one tested path. The compile-time delta (hundreds of ms) is irrelevant for on-demand reports.

**Decision pinned for this project: xelatex + polyglossia everywhere.** The pdflatex code in `latex-pdf-generation-design.md` is preliminary; the preamble must be rewritten for xelatex with `fontspec` + `polyglossia`.

### 4.2 Templates required

Scope says **7 report templates + 1 generic fallback**. The design doc enumerates 9 (it splits some reports). The canonical list to implement, with purpose:

| # | Template | Purpose | Orientation | Special |
|---|----------|---------|-------------|---------|
| 1 | `base.tex` | Shared preamble — colors, fonts, layout, fancyhdr, severity/status badge commands, watermark conditional, info/warning/critical boxes | n/a | Imported by all |
| 2 | `cover.tex` | Reusable cover page — title, subtitle, org, prepared-by, date, classification (CONFIDENTIAL) | n/a | Imported by all reports |
| 3 | `observation-list.tex` | Observations export — executive summary table (counts by severity, open, overdue, avg resolution days), TikZ/pgfplots severity bar chart, longtable of observations (Ref / Title / Severity / Source / Status / Assignee / Due) | Portrait | Multi-page longtable |
| 4 | `compliance-report.tex` | Executive compliance status — framework score table, 6-month trend pgfplots line chart, open observations table, upcoming regulatory deadlines | Portrait | Charts |
| 5 | `audit-report.tex` | Audit report — audit metadata, findings summary by severity, detailed findings (per-finding subsection: severity / category / owner / status / description / remediation), audit activity log longtable | Portrait | Multi-page activity log |
| 6 | `risk-register.tex` | Risk register — risk summary by severity, full risk longtable (ID / Risk / Category / L / I / Score / Mitigation / Owner / Treatment / Status), **5x5 risk heat map drawn in TikZ with plotted risk dots** | **Landscape** | TikZ heat map |
| 7 | `sama-letter.tex` | Formal SAMA correspondence letter — letterhead (org name, address, CR No.), letter metadata (Reference / Date / To / Subject), salutation, body paragraphs, attachments list, signature block | Portrait | Letter geometry (3cm top), no cover page |
| 8 | `correspondence-tracker.tex` | Generalized correspondence export across all regulators (not just SAMA) | Portrait | Longtable |
| 9 | `training-report.tex` | Team training completion report | Portrait | Per-employee rows |
| 10 | `calendar-export.tex` | Compliance calendar export | Portrait/Landscape | Date-grouped |
| 11 | `generic-table.tex` | Fallback for any tabular data with no purpose-built template — dynamic column count + widths, header row, body rows | Portrait | Universal |

### 4.3 Language requirements

- **English templates.** Default. xelatex + polyglossia with `\setmainlanguage{english}`.
- **Arabic / RTL templates.** xelatex + polyglossia with `\setmainlanguage{arabic}` (or `\setotherlanguage{arabic}` for bilingual letters with English headers + Arabic body). RTL paragraphs wrapped in `\begin{Arabic}…\end{Arabic}`. Templates already include a `meta.locale: 'en' | 'ar'` field to drive locale-aware rendering.
- **M5 exit gate.** English engine working **plus at least one Arabic template** (SAMA letter is the natural first Arabic template). Remaining Arabic variants ship in a defined order post-UAT — *Arabic template rollout order is an open question per scope §10.*
- **Bilingual letters.** SAMA letters are commonly bilingual (English admin metadata + Arabic body, or vice versa). Templates must support both directions within one document via `\begin{english}…\end{english}` and `\begin{arabic}…\end{arabic}` blocks.

### 4.4 Font requirements

- **Latin/English.** A modern OpenType serif/sans available system-wide — design doc currently uses `lmodern`; with xelatex prefer `fontspec` + a system font like **Latin Modern Roman** (`\setmainfont{Latin Modern Roman}`) or a corporate-style sans (e.g. **Inter**, **Source Sans Pro**) once branding is finalized.
- **Arabic.** **Amiri** is the design doc's chosen Arabic font (`\setmainfont{Amiri}` + `\newfontfamily\arabicfont{Amiri}`). Alternative SAMA-friendly fonts to evaluate: **Noto Naskh Arabic**, **Scheherazade New**. Whichever is picked, must be installed in the LaTeX container.
- **Monospace** (for technical fields like reference codes, audit log timestamps, JSON diffs in version views) — system mono via `\setmonofont`.
- **Container packaging.** Docker image must include `texlive-xetex`, `texlive-lang-arabic`, `texlive-fonts-recommended`, `texlive-latex-extra`, plus the chosen Arabic font files copied into `/usr/share/fonts/` and `fc-cache -fv` run at build time.

### 4.5 Signature, seal, and stamp placement

For SAMA letters and audit reports specifically:
- **Signature block** at the foot of the letter — name, title, organization, vertical space (~1.5cm) above for wet-ink signature, below the closing ("Respectfully," / "والسلام عليكم").
- **Company seal / stamp image** support — base64 PNG uploaded with the request and placed next to or below the signature. Use `\includegraphics[width=3cm]{seal.png}` at the signature anchor.
- **Letterhead logo** — base64 PNG in request body (`options.headerLogo`), decoded to `logo.png` in the temp build dir, included at top of letter / cover page via `\includegraphics[width=4cm]{logo.png}`.
- **Classification stamp** ("CONFIDENTIAL", "DRAFT", "INTERNAL USE ONLY") — handled via the `draftwatermark` package with conditional `\watermarktext` macro; can be set via `options.watermark` in the request.

### 4.6 Page templates / layout

- **Default geometry** (most reports): A4, 11pt, margins top=2cm bottom=2.5cm left/right=2cm.
- **Letter geometry** (SAMA letter): A4, 11pt, margins top=3cm bottom=2.5cm left/right=2.5cm, no `fancyhdr` page header on first page (`\thispagestyle{empty}`).
- **Landscape geometry** (risk register): A4 landscape, margins top=1.5cm bottom=2cm left/right=1.5cm.
- **Page header/footer (`fancyhdr`).** Header: left = section name (`\leftmark`), right = "ComplianceOS". Footer: left = `Generated: \today`, center = "CONFIDENTIAL", right = `Page X of Y` via `lastpage`. Rule lines top and bottom (0.4pt slate).
- **Section styling.** H1 = Large bold slate-900 with full-width 2pt emerald underline rule. H2 = large bold slate-700. H3 = normal bold slate-700.
- **Brand colors (Tailwind-matched).** emerald `#10B981` (+ dark `#059669`, light `#D1FAE5`), slate-900/700/500/200/50, rose `#F43F5E` + light, amber `#F59E0B` + light, blue `#3B82F6` + light. Defined in `base.tex` as `\definecolor{cos-*}{HTML}{...}`.
- **Severity & status badges.** Reusable LaTeX commands: `\severitycritical{}`, `\severityhigh{}`, `\severitymedium{}`, `\severitylow{}`, `\statusopen`, `\statusinprogress`, `\statusclosed`, `\statusoverdue`. Implemented as colored `\colorbox` + `\textcolor`.
- **Boxes.** `infobox` (blue), `warningbox` (amber), `criticalbox` (rose) — full-width single-cell tabular environments for callouts.
- **TOC.** Reports with multiple sections include `\tableofcontents\newpage` after cover page. Requires **two-pass compilation** to populate TOC + `lastpage` correctly.

### 4.7 API contract (universal export)

`POST /api/export/pdf` with body:
```ts
{
  template: 'compliance-report' | 'audit-report' | 'observation-list' | 'risk-register'
          | 'sama-letter' | 'correspondence-tracker' | 'training-report'
          | 'calendar-export' | 'generic-table',
  data: Record<string, unknown>,         // shape depends on template
  meta: {
    title: string, subtitle?: string,
    generatedBy: string, organization: string,
    locale: 'en' | 'ar', dateFormat?: string,
  },
  options?: {
    orientation?: 'portrait' | 'landscape',
    includeCharts?: boolean, includeSummary?: boolean,
    watermark?: string,           // 'DRAFT' | 'CONFIDENTIAL' | ...
    headerLogo?: string,          // base64-encoded PNG
  },
}
```
Returns `Content-Type: application/pdf` binary. Errors return `{ error: 'COMPILATION_FAILED', message, details }`.

### 4.8 Frontend pages needing the universal `ExportModal`

`/observations`, `/audits`, `/audits/[id]`, `/reports`, `/correspondence`, `/risk-register`, `/calendar`, `/team` (training), `/dashboard`. Modal offers CSV (client-side, instant) or PDF (server-side via LaTeX).

### 4.9 Security: LaTeX input sanitization (critical)

User-supplied strings injected into LaTeX templates must be escaped — backslashes first, then `# $ % & _ { } ~ ^` — to prevent command injection. Additional block-list filter for `\input`, `\include`, `\write`, `\read`, `\def`, `\newcommand`. Sanitization applied recursively across all string values in the request payload before Handlebars rendering. **This is a non-negotiable production gate.**

### 4.10 Job: PDF generation

PDF generation is one of the **13 pg-boss jobs** (per scope §8 "Background jobs"). For on-demand exports, the API may compile synchronously (≤30s timeout per pass, two passes for TOC). For scheduled or batch reports, the job queue handles compilation off-request.

### 4.11 Audit-log entry per export

Every PDF export writes an `audit_log` row: `action: 'EXPORT_PDF'`, user, template, title, tenant. Required for SAMA audit trail of "who exported what data and when".

---

## 5. Compliance / regulatory pins

The platform must satisfy **multiple overlapping Saudi regulations simultaneously**, not just one:

- **SAMA Cloud Computing Framework** — banks, insurance, fintech, payment providers. Customer data, transactions, backups, logs, audit trails all in-Kingdom. Cross-border transfer is exception-based, requires documented risk assessment + SAMA approval.
- **SDAIA PDPL (Personal Data Protection Law)** — fully enforced since September 2024. Horizontal application to *any* entity processing personal data of Saudi residents. Because the platform stores names, contact details, Saudization records, training data → **PDPL is always triggered.**
- **NCA ECC (Essential Cybersecurity Controls)** — critical national infrastructure including financial services. Residency and logging expectations overlap with SAMA.
- **CMA** — broker-dealers, asset managers, capital market institutions. Cybersecurity and data governance rules effectively require in-Kingdom storage.
- **CITC** — telecom/ICT licensees. Subscriber and traffic data in-Kingdom.
- **ZATCA / MISA / SAFIU / IA** — no separate residency rules in practice; rolled into SAMA (for financial entities) or PDPL (everything else).

**Concrete implications (binding from day one, not a later migration):**

- **In-Kingdom data residency.** Backend, database, storage, job queue, logs, backups, analytics — *all* in a Saudi region. UAE and Bahrain regions **do not satisfy** Saudi residency. Strictest interpretation: all data, all environments, in-Kingdom.
- **Append-only audit log.** Every database mutation writes an `audit_log` row with `before` + `after` JSON, changed fields, actor, request metadata. The log table must be tamper-proof — `REVOKE UPDATE, DELETE ON audit_log` from the application role; INSERT only. Retention purges run under a separate admin role invoked by a scheduled pg-boss job with its *own* audit trail. **This is an M3 exit-gate requirement, not a nice-to-have.**
- **Retention policies.** Default 10 years uniform for `entity_versions` and `audit_log` (some SAMA artefacts mandate 10 years). To be confirmed during Discovery. Cloud Storage object versioning enabled.
- **In-region log sinks.** Cloud Logging sinks configured to keep all logs in `me-central2`. (For Supabase substitution: confirm logs stay in-region or set up a forwarder.)
- **Email delivery in-region.** Verification, password-reset, notification, and digest emails sent via SMTP relay or transactional provider with a **Saudi delivery endpoint**, so email metadata doesn't leak cross-border.
- **Cross-border transfer log.** Every external call the platform makes (email providers, Slack webhooks, third-party APIs) must be documented: purpose, data transferred, legal basis. Compliance artefact.
- **Data inventory.** List of every table / bucket / log sink classified as personal / regulated / internal data. Compliance artefact.
- **SAMA contractual mapping document.** Adapted from the cloud provider's published SAMA mapping, referencing specific controls implemented. Compliance artefact.
- **Access review procedure.** Quarterly review of who has access to what. Compliance artefact.
- **Incident response runbook.** Data breach, prolonged outage, key compromise. Compliance artefact.
- **Soft-delete + grace period** for tenant deletion, complying with SAMA + PDPL data disposal rules.

---

## 6. Tech-stack pins from scope

### Kept (orchestrator must use)

- **Frontend (already built, not to be touched at the stack level).** Next.js 16, React 19, TypeScript 5, Tailwind 4, Zustand 5, React Hook Form + Zod, hand-built CSS+SVG charts (no charting libraries).
- **Backend language/framework.** Express + TypeScript, **three-layer pattern**: routes → controllers → services → repositories.
- **Database.** PostgreSQL 15+ with row-level security on every tenant-scoped table (RLS required at multi-tenant Scale; MVP can defer column-level enforcement but schema should be ready).
- **Background jobs.** **pg-boss** in the same Postgres database (separate schema). 13 jobs total: deadline reminders, recurring calendar items, status transitions, score recalc (overall + per-framework), notification dispatch, email digest batch, PDF generation, version pruning, audit-log archival, tenant provisioning, data export, failed-job dead-letter handling. Idempotency keys on every job. Transactional enqueue (`boss.send` inside the source mutation's transaction).
- **PDF.** xelatex + polyglossia (single engine per Tech-Concerns #3).
- **IaC.** Terraform (or equivalent) so the stack is reproducible across environments. State in a versioned, in-region storage bucket.
- **Migrations.** Prisma Migrate / Drizzle / Flyway — versioned in repo.

### Substituted (orchestrator decisions diverge from scope v3)

- **Auth.** Scope says **self-hosted GoTrue on Cloud Run** (with minimal Express fallback). **Orchestrator decision: Supabase Auth (managed).** This matches Tech-Concerns #1, which already pushes back on GoTrue ("designed as a building block of Supabase, not a standalone production auth service") and lists Ory Kratos / Keycloak / custom Express as better defaults. Supabase Auth is a fourth option that delivers the full feature surface (TOTP, refresh rotation, lockout, session revoke) without the self-host operational burden — but **the in-region residency question for Supabase needs explicit confirmation during Discovery** (Supabase's Frankfurt/Singapore regions don't satisfy SAMA; Supabase self-hosted on the in-region cloud account is the path if a Saudi-region managed Supabase isn't available).
- **Cloud provider.** Scope defaults to **GCP me-central2 (Dammam) via CNTXT** (Google's exclusive KSA reseller). Tech-Concerns #2 flags that GCP me-central2 access **requires a CNTXT contract** which can block M1. Alternatives on the table: **AWS me-central-2 (Riyadh, direct procurement)**, **STC Cloud (in-Kingdom)**. **Decision is open and must be locked during Discovery** with a one-page decision matrix before M1 pricing finalizes. The architectural patterns stay the same regardless.
- **Frontend scoring engine port.** Tech-Concerns #4: in single-tenant MVP, keeping the 585-line scoring engine on the client is "low risk". Once multi-tenant, **frontend must stop computing scores and read them from the API** to prevent any user with browser devtools from seeing the weights and thresholds driving every tenant's scores. Must be an **explicit M5 deliverable** when multi-tenant ships.

---

## 7. Risks called out (must respect)

From `ComplianceOS — Technical Concerns.txt`:

1. **GoTrue is the wrong auth choice.** Forked from Netlify as a Supabase building block, not a standalone service. The orchestrator's Supabase-Auth substitution sidesteps this — but the *feature surface contract* (TOTP, refresh rotation w/ theft detection, session revoke, lockout, audit hooks) must still be met, and Discovery must confirm Supabase Auth covers all of it (or supplement with custom code for any gaps).

2. **GCP me-central2 commercial path.** Access requires CNTXT contract (Google's exclusive KSA reseller). If CNTXT procurement is slow, M1 is blocked. **Have a decision matrix ready** comparing GCP/CNTXT, AWS me-central-2, STC Cloud before M1 pricing locks. Hosting choice may force changes to operational pieces (auth deployment, log sinks, storage SDKs) — but not the architectural patterns.

3. **One LaTeX engine, not two.** Use xelatex + polyglossia for *every* template, English and Arabic alike. Maintaining two engines means two preambles, two font pipelines, two CI caches, and two ways rendering can silently diverge. Compile-time delta is negligible. **The design doc's pdflatex preamble must be rewritten for xelatex.**

4. **Scoring engine: migrate, not copy.** Once server scoring port passes golden tests, the frontend **stops computing** and reads from the API. Otherwise weights leak via browser devtools — fine for single-tenant MVP, tenant-on-tenant confidentiality issue at Scale. Explicit M5 deliverable when multi-tenant lands. Discovery question: can the frontend team absorb this during M5, or is the frontend frozen by then?

5. **Audit log must be append-only at the database role level.** Writing rows is not enough — SAMA auditors will ask "can anyone with DB access modify or delete rows after the fact?" Mitigation (~2 lines): `REVOKE UPDATE, DELETE ON audit_log FROM application_role` (INSERT only). Retention purges run under a separate admin role invoked by a scheduled pg-boss job with its own audit trail. **M3 exit gate**, not a future polish item.

6. **Timeline pressure.** Scope went from 6 to 8 weeks for Build *and* simultaneously added the full GCP infrastructure surface + self-hosted auth on top of the application work. That's net scope expansion, not extension. 8 weeks for the combined load (14 modules, full Terraform across 3 envs, self-hosted auth to full feature surface, scoring engine port, bilingual PDF pipeline) is still tight for one engineer FT. Mitigation already in scope: **milestone-pinned delivery — if M1 runs long, calendar extends rather than ship incomplete work.**

### Additional open questions from scope §10

- **Saudization by classification level.** Current model tracks aggregate actual vs target by department. SAMA distinguishes Platinum / Gold / etc. levels. Product decision needed before finalizing HR-compliance schema.
- **Framework weight defaults per tenant.** Ship with equal defaults, or require admin to set during onboarding?
- **Realtime cross-device sync.** Frontend persists state in localStorage. Multi-device use will surface stale-state issues. Include realtime in this engagement or defer?
- **Arabic template rollout order.** Which of the 7 PDF templates ship with Arabic variants in M5 vs after UAT?
- **Audit type enum.** Currently an enum in the frontend. Must become an FK to a framework table before second tenant onboards. Known debt — plan migration early.
- **SAMA inspection / Sharia audit file formats are not standardized.** Do not parse automatically. Manual entry only.
- **Retention period.** Default 10 years uniform across `entity_versions` and `audit_log`, to be confirmed.
