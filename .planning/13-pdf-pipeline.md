# Phase 7 — PDF generation pipeline

> Status: implemented 2026-05-15. Async-only via `jobs` table (BACKEND-API-MAP §13.2).

## 1. Engine — and why it isn't xelatex

The scope's Technical Concerns doc (§3) mandates **xelatex + polyglossia** as
the sole LaTeX engine for production. We are **deviating** for MVP:

- xelatex's TeXLive distribution is ~300 MB unpacked. The Vercel free-tier
  function bundle is capped at **50 MB unzipped** (Hobby: 50 MB; Pro: 250 MB).
  No combination of `texlive-base` + Arabic packages fits under 50 MB.
- Containerised Docker runtimes on Vercel Functions require Pro plan and
  Fluid Compute custom runtimes — not available on the pilot tier.
- Puppeteer/Chromium (the obvious alternative) is ~50 MB just for the
  headless binary, plus its own RTL/Arabic font issues.

The chosen engine is **`@react-pdf/renderer`** (~10 MB, pure JS, embeds
TTF fonts at render time). It supports:

- Arabic glyph shaping via embedded Amiri TTF.
- RTL layout via explicit `textAlign: 'right'` per locale.
- A4 / landscape, multi-page documents, page numbers, headers/footers.
- Inline SVG primitives (`Svg`, `Rect`, `Circle`, `Path`, `Text`) — used by
  the compliance-report bar chart and the risk-register 5×5 heat map.

**Migration path to xelatex (post-pilot, when we move off free tier):**
deploy a thin containerised LaTeX renderer (Cloud Run / Fly.io /
DigitalOcean App Platform — anywhere a ~500 MB image runs cheaply) that
exposes a single `POST /render` endpoint accepting `{ template, data,
locale }` and returning `application/pdf`. The cron worker in
`/api/cron/jobs-run` then branches on `job.kind`:

- `pdf.generate` (this phase, `@react-pdf/renderer`) — kept for back-compat.
- `pdf.generate.xelatex` (future) — POSTs the payload to the external
  service and uploads the returned bytes to Supabase Storage.

The template *data contracts* (Zod schemas in `src/lib/pdf/templates/*.tsx`)
are renderer-agnostic — they can be re-implemented as Handlebars `.tex`
sources without changing API callers or job payloads. A future
`renderXelatex.ts` mirrors `renderPdf.ts`; the API surface is unchanged.

## 2. Files added / modified

```
src/lib/pdf/
├── registry.ts                 — Font.register() + missing-file fallback
├── base.tsx                    — Page wrapper, headers, footers, tables, badges
├── types.ts                    — PdfTemplate<Data>, TemplateKey, RenderContext
├── render.ts                   — renderPdf(): lookup → Zod-validate → renderToBuffer
└── templates/
    ├── sama-letter.tsx          — formal letter, bilingual
    ├── audit-report.tsx         — metadata + findings + activity log
    ├── compliance-report.tsx    — overall score + per-framework + SVG bar chart
    ├── risk-register.tsx        — landscape, 5×5 SVG heat map + table
    ├── observation-list.tsx     — exec summary + observation table
    ├── policy-export.tsx        — policy text + versions + workflow steps
    ├── correspondence-tracker.tsx — generic columns/rows tabular export
    ├── training-report.tsx      — per-employee course-progress table
    └── calendar-export.tsx      — date-keyed event list

src/app/api/pdf/
├── generate/route.ts           — POST: enqueue pdf.generate job, returns { jobId }
└── download/[jobId]/route.ts   — GET: stream PDF from pdf-renders bucket

src/app/api/cron/jobs-run/route.ts
                                — Vercel Cron entry; claims+dispatches jobs

src/lib/pdf-client.ts           — requestPdf / pollJob / generatePdf / downloadPdf

vercel.json                     — cron config (every minute)
public/fonts/README.md          — TTF drop instructions (Amiri + Inter)

src/app/(dashboard)/correspondence/letters/page.tsx
                                — replaced html2canvas+jsPDF with downloadPdf()
```

## 3. Templates implemented (data shapes)

| Template key             | Required fields (summary)                                     | Locale support |
| ------------------------ | ------------------------------------------------------------- | -------------- |
| `sama-letter`            | organizationName, letterReference, letterDate, recipientName, subject, bodyParagraphs/body, signatoryName | en + ar        |
| `audit-report`           | organization, generatedBy, date, auditName, findings[], activityLogs[] | en + ar        |
| `compliance-report`      | organization, generatedBy, date, overallScore, frameworks[], deductions[], upcomingDeadlines[] | en + ar        |
| `risk-register`          | organization, generatedBy, date, risks[] (id, name, likelihood 1-5, impact 1-5, ...) | en + ar        |
| `observation-list`       | organization, generatedBy, date, observations[]               | en + ar        |
| `policy-export`          | organization, title, status, body, versions[], workflowSteps[] | en + ar        |
| `correspondence-tracker` | organization, title, columns[], rows[]                        | en + ar        |
| `training-report`        | organization, rows[] (employee, course, status, progress, dueDate) | en + ar        |
| `calendar-export`        | organization, events[]                                        | en + ar        |

Each template's Zod schema is the source of truth for the request `data`
payload — `renderPdf()` validates against it and returns
`ValidationFailed` on mismatch, surfaced to clients as
`{ error: { code: 'validation_failed', details: {...} } }`.

## 4. Templates remaining (button wiring)

This phase ships **rendered** templates; the table below lists where
the existing client-side CSV / PDF exports still call legacy code that
needs migrating to `downloadPdf()` from `src/lib/pdf-client.ts`:

| Page                              | Current export                          | Target template             |
| --------------------------------- | --------------------------------------- | --------------------------- |
| `/correspondence/letters` (page.tsx) | **migrated** (this phase)            | `sama-letter`               |
| `/observations`                   | `exportObservations()` CSV              | `observation-list`          |
| `/audits`                         | `exportAuditFindings()` CSV             | `audit-report`              |
| `/audits/[id]`                    | `exportAuditLogs()` CSV                 | `audit-report`              |
| `/reports`                        | `generatePrintableReport()` HTML        | dynamic (per report type)   |
| `/correspondence`                 | toast only                              | `correspondence-tracker`    |
| `/risk-register`                  | (not yet implemented)                   | `risk-register`             |
| `/calendar`                       | (not yet implemented)                   | `calendar-export`           |
| `/team` (training)                | CSV                                     | `training-report`           |
| `/dashboard`                      | `dashboard-pdf.ts` (jsPDF)              | `compliance-report`         |
| `/policies/[id]`                  | docx                                    | `policy-export`             |

Polish-phase work: replace those buttons with one call to
`downloadPdf({ template, data, locale }, filename)`. The cron worker and
storage bucket are already in place — no further infra needed.

## 5. Storage bucket

Bucket: **`pdf-renders`**, private (Supabase Storage).
- Key per render: `<jobId>.pdf`.
- RLS policy: `authenticated_read_pdfs` — any authenticated user can
  `SELECT` (download) from this bucket. Suitable for the single-tenant
  MVP per BACKEND-API-MAP §13.2. When tenancy is added, scope by
  `auth.uid()` or extract the org from the storage path.
- Writes are done by the cron worker via the **service-role** client —
  bypasses RLS.

Bucket and policy installed via Supabase MCP at provisioning time:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-renders', 'pdf-renders', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "authenticated_read_pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pdf-renders');
```

## 6. Cron worker

- **Path:** `/api/cron/jobs-run`
- **Schedule:** every 1 minute (see `vercel.json`). On Vercel Hobby the
  effective minimum is 1/day; the `*/1 * * * *` schedule is pre-configured
  for the upgrade to Pro and as a guide for local poking.
- **Auth header:** `Authorization: Bearer ${CRON_SECRET}` —
  must match the `CRON_SECRET` env var (refuses to run if unset). Also
  accepts `x-cron-secret: <CRON_SECRET>` for manual `curl` tests.
- **Batch size:** `CLAIM_BATCH_SIZE = 5` (constant in
  `src/app/api/cron/jobs-run/route.ts`). Tune up once function timeout
  budget is known.
- **Function timeout:** `maxDuration = 60` seconds. Each pdf.generate
  job typically completes in 1-5 seconds; the 60 s ceiling absorbs
  the worst case (50+ page risk register).
- **Failure handling:** per job, exponential backoff (30 s, 1 m, 2 m, …)
  capped at 30 m, re-queued until `attempts >= max_attempts` (default 3),
  then marked `failed`. One bad job never aborts the rest of the batch.
- **Dispatch:** `kind = 'pdf.generate'` routes to `runPdfGenerate(job)`.
  Future kinds (compliance.score.recalculate, notification.generate,
  etc.) plug into the `dispatch()` switch.

## 7. Env vars required

| Name                          | Used by                                       |
| ----------------------------- | --------------------------------------------- |
| `CRON_SECRET`                 | `/api/cron/jobs-run` — refuses to run if absent |
| `SUPABASE_SERVICE_ROLE_KEY`   | cron worker (claims jobs + uploads to Storage; bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_URL`    | existing — service-role client URL            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing — user-context client (download endpoint) |

## 8. Open questions

1. **Cron tier**: Vercel Hobby caps cron at 1/day. The current
   `*/1 * * * *` schedule pre-supposes Pro. If MVP ships on Hobby we
   need an external pinger (Upstash Cron, Better-Stack heartbeats) or
   accept 24-hour PDF latency.
2. **Fonts shipment**: `public/fonts/*.ttf` are not yet committed (per
   the no-binary-fetch constraint). Someone must drop the five TTFs
   listed in `public/fonts/README.md` before any non-trivial render
   produces glyph-shaped output for Arabic. The renderer falls back to
   bundled Helvetica when files are absent, which renders Arabic as
   replacement boxes.
