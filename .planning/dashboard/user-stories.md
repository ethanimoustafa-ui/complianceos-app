# Dashboard — User Stories

**Route:** `/dashboard`
**Primary roles:** compliance officer · compliance manager · org admin · auditor · viewer
**Domain entity:** cross-module aggregate (audits, observations, risks, policies, training, letters, correspondence, circulars, team)

## What this page is for

The dashboard is the single landing page after sign-in. It aggregates headline KPIs across every GRC module — open observations, overdue circulars, audit health, risk exposure, training completion, letter volume — so a compliance lead can answer "are we OK today?" without opening any module. The page renders one of three persona-tuned layouts (`ExecutiveView`, `ManagerialView`, `OfficerView`) chosen by the user's saved `dashboardView` preference, so the same data shows at the right altitude for the right role.

## Primary user journeys

### Story 1 — See today's compliance posture at a glance

**As a** compliance manager
**I want to** see open observations, overdue items, and audit/risk health within seconds of signing in
**So that** I can decide what to escalate before my standup.

**Acceptance criteria**:
- Landing at `/dashboard` shows the persona view matching `userPreferences.dashboardView` (executive | managerial | officer)
- While any of the 9 aggregated stores has `lastFetched === null`, a persona-shaped skeleton renders (no zero-flash KPIs)
- Once *any* store hydrates, the real view replaces the skeleton — individual widgets handle their own empty states beyond that
- KPI tiles reflect counts from the actual stores: audits, observations, risks, policies, training, letters, correspondence, circulars, team
- Hard-reload the page → the same numbers come back (data is server-backed, not client-seeded)
- Coming from `/welcome` (sessionStorage flag `fromWelcome`) plays a one-shot fade-in animation; reloading after that does not replay it

### Story 2 — Switch between executive, managerial, and officer altitude

**As a** compliance officer who occasionally needs the manager view
**I want to** switch between dashboard altitudes
**So that** I see fewer charts when I'm doing operational work and more rollups when I'm reporting up.

**Acceptance criteria**:
- The current view is read from `userPreferences.dashboardView` (persisted server-side per user)
- Changing the preference in `/settings` (or via the in-header switcher if surfaced) re-renders the dashboard on next navigation
- Each view (executive/managerial/officer) has its own skeleton shape that matches the real layout shipped after hydration
- The page title and subtitle change with the view (`dashboard.title`/`titleManagerial`/`titleOfficer` i18n keys)
- The selected view persists across reloads and across devices for the same account

### Story 3 — Export the current dashboard as a PDF

**As a** compliance manager preparing a board update
**I want to** click "Export" once and get a PDF of the current dashboard
**So that** I can attach it to my report without retyping the numbers.

**Acceptance criteria**:
- An "Export PDF" button is visible in the page header
- Clicking it triggers `generateDashboardPdf(metrics, dashboardView, t)` with the currently rendered metrics
- The download starts within a few seconds (client-side render via `@react-pdf/renderer`)
- The PDF reflects the *current* view (executive/managerial/officer), not all three
- The export does not refetch data — it uses the metrics already on screen

## Edge cases the page should handle

- Empty state: a brand-new tenant with zero records still renders the dashboard chrome; widgets show their own per-module empty states
- Loading state: persona-matched skeletons show until at least one source store reports `lastFetched != null`
- Network failure: if a source `fetchAll()` rejects, the widget for that slice falls back to its empty state rather than blocking the whole page
- RBAC: every authenticated role can view the dashboard; widgets within may scope themselves further
- RTL: Arabic dashboardView mirrors the layout; KPI tile order and chart axes flip

## Out of scope for this page

- Detailed drill-downs (audits, observations, risks etc. live under their own routes)
- Editing any record — dashboard is read-only
- Period / framework filtering (the W4 walk confirmed no period dropdown is currently wired here)
- Server-side scheduled PDF reports — those live under `/reports/*`

## Open questions

- Should clicking a KPI tile deep-link into the matching module list filtered to the matching status? (Currently undefined — tiles appear non-interactive.)
- Should there be a period selector (last 30/90 days) on the executive view? W4 walk could not find one.
- Should the framework chips on the executive view filter the KPI numbers, or are they decorative?
