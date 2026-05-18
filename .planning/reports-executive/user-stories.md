# Reports — Executive — User Stories

**Route:** `/reports/executive`
**Primary roles:** compliance manager · org admin · auditor (read)
**Domain entity:** cross-module aggregate (audits, risks, frameworks)

## What this page is for

The executive report is the page a compliance manager opens before a board meeting. It rolls up audits, risks, and per-framework compliance scores into a small number of headline numbers and charts that an executive can absorb in two minutes. Unlike the dashboard (always-on, persona-tuned), this page is print-shaped: it's designed to be exported as a PDF and dropped into a board pack.

## Primary user journeys

### Story 1 — See executive-level compliance health

**As a** compliance manager preparing a board pack
**I want to** see headline KPIs (open audits, high-severity risks, framework scores)
**So that** I can answer "how compliant are we?" in one slide.

**Acceptance criteria**:
- Landing at `/reports/executive` triggers `fetchAudits()` to hydrate audits
- KPI tiles show: open audits, in-progress audits, high+critical risks, framework-pinned scores
- The 6-month compliance score trend renders as a chart
- Hard-reload → the same KPIs return (server-backed)
- Empty state shows the layout with zero values, not an error

### Story 2 — Drill into a framework

**As a** compliance manager
**I want to** click a framework score chip and see what's driving it
**So that** I know which observations / circulars need attention.

**Acceptance criteria**:
- Framework score chips are clickable
- Clicking opens a drill-down view or navigates to the framework's detail elsewhere
- The framework list reads from `useFrameworkConfigStore` so only pinned frameworks appear

### Story 3 — Export the executive report as a PDF

**As a** compliance manager
**I want to** export the page as a PDF
**So that** I can attach it to my board update.

**Acceptance criteria**:
- An "Export" button is visible in the page header
- Clicking it calls `exportExecutiveReport(...)` (W4 walk confirmed client-side PDF, no server endpoint)
- The PDF reflects the current view (KPIs, chart, risk summary, framework scores)
- Errors during export surface inline
- The PDF respects the current locale (en / ar)

## Edge cases the page should handle

- Empty state: a fresh tenant shows zero-valued KPIs and an empty chart with axis labels
- Loading state: skeleton tiles while the three source stores hydrate
- Network failure: each KPI tile degrades to an "unavailable" state independently
- RBAC: managers + admins see the full export; auditors read; viewers may have a stripped subset
- RTL: chart axes and KPI labels mirror under Arabic

## Out of scope for this page

- Period filter / time-range picker (W4 walk confirmed not currently wired)
- Server-side scheduled PDF rendering (deferred — see HANDOFF §4 #10)
- Per-tenant brand-color theming of the chart (deferred)

## Open questions

- Should the page accept a `?period=` query param so a board-meeting link locks the snapshot to a specific quarter?
- Should the chart series come from the cached `compliance_scores_cache` table, and what's the recompute trigger?
- Should "Export" produce a server-rendered PDF (better fonts, Arabic support) or stay client-side?
