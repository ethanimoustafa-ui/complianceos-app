# ComplianceOS — Product Backlog

**Version:** 1.0
**Date:** February 2026
**Last Updated:** March 13, 2026

---

## How to Read This Backlog

- **Status:** `✅ Done` | `🔧 In Progress` | `📋 To Do` | `🗺️ Roadmap` | `💡 New Recommendation`
- **Priority:** `P0` (Critical — blocks launch) | `P1` (High — needed for launch) | `P2` (Medium — post-launch) | `P3` (Low — future phase)
- **Source:** `BRD` (from Business Requirements Doc) | `REC` (from architecture/strategy sessions) | `FEEDBACK` (from compliance team)
- **Arch:** `A` (Correspondence) | `B` (Framework) | `C` (Internal Governance) | `S` (Shared/Platform)

> **Sprint 6 complete:** Custom Review Frequency — `ReviewSchedule` type + `ReviewSchedulePicker` UI + `computeNextReview()` utility wired across Policies (POL-018), Risks (RSK-007), and Audits (AUD-004).
>
> **Sprint 3.3 complete (Mar 8 2026):** Policy workflow bug fixes (submit-for-review stays on step, chip labels corrected, undo clears stepState), Pending Approvals card scoped to managerial-only items with deep-link + enriched modal, workload drawer shows full cross-store item list with type badges, Saudization grid layout fix, and new Epic 22 (Smart Workload & Burnout Management System) defined.
>
> **Settings Page Overhaul Sprint complete (Mar 13 2026):** Settings page decomposed from 905-line monolith into 55-line orchestrator + 7 sub-components. New stores: `framework-config-store` (11 regulators, pinning UI, per-framework weights + threshold + dept assignment), `user-preferences-store` (date format, timezone, dashboard view, granular notification preferences), `audit-template-store` (6 seed templates, CRUD + `incrementUsage`, frequency schedules), `policy-template-store` (6 seeds, persist v2, `frequency` + `frequencySchedule`), `department-store` (10 canonical seeds, CRUD, `isDefault` guard). New utilities: `src/lib/date-format.ts` + `src/hooks/useFormattedDate.ts` wire date format preference across all pages. Downstream consumers (rules modals, RegDocFilterBar, observations, audits, policies) migrated to `useDepartmentStore()`. SET-001 through SET-006 all complete.

---

## Epic 1: Onboarding & Workspace Configuration

> New epic derived from architecture sessions. Enables multi-authority, multi-framework tenant setup.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| ONB-001 | Organization profile setup (company name, CR number, entity type, sector) | 💡 | P1 | S | REC | Step 1 of onboarding flow |
| ONB-002 | Entity type selector (Commercial Bank, Digital Bank, Fintech, Insurance, Investment, etc.) | 💡 | P1 | S | REC | 13 entity types defined. Drives pre-selection logic |
| ONB-003 | Archetype A: Regulatory authority selection (SAMA, CMA, IA, ZATCA, MISA, SAFIU) | 💡 | P1 | A | REC | Card-based UI with logos, AR/EN names, toggle on/off |
| ONB-004 | Pre-selection logic: auto-suggest authorities based on entity type | 💡 | P1 | S | REC | E.g., Bank → SAMA ✓, ZATCA ✓, SAFIU ✓ |
| ONB-005 | Per-authority configuration (letter types, submission frequencies, calendar import) | 💡 | P2 | A | REC | Expandable config panel per selected authority |
| ONB-006 | Archetype B: Framework selection (NCA ECC, SAMA CSF, PDPL, COSO, ISO, etc.) | 💡 | P1 | B | REC | Card-based UI. Tagged "Metadata Only (MVP)" vs "Full Assessment (Coming Soon)" |
| ONB-007 | Pre-selection logic: auto-suggest frameworks based on entity type | 💡 | P1 | S | REC | E.g., Bank → NCA ECC ✓, SAMA CSF ✓, PDPL ✓, COSO IC ✓ |
| ONB-008 | Constant C: Internal governance config (Internal Audit + Sharia — always on, config only) | 💡 | P1 | C | REC | Cannot disable. Configure members, reporting frequency |
| ONB-009 | Module activation summary (auto-configured from Steps 2-5) | 💡 | P2 | S | REC | Grouped by Correspondence / Assessment / Internal / Shared |
| ONB-010 | Team & roles setup during onboarding (invite members, assign roles + scope) | 💡 | P2 | S | REC | RBAC scoped to authorities + frameworks |
| ONB-011 | Review & launch screen (full config summary, edit-back, confirm) | 💡 | P2 | S | REC | Generates full workspace on confirm |
| ONB-012 | Entity type → pre-selection mapping table (backend data) | 💡 | P1 | S | REC | 13 entity types × 19 authorities/frameworks matrix |

---

## Epic 2: Correspondence Hub (Letters)

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| COR-001 | SAMA letter creation (type: Non-Objection, Inquiry, Submission, Notification) | ✅ | P0 | A | BRD | Done — store wired with Zustand + persist, seed data, sync CRUD actions; edit letter functionality removed (create-only flow) |
| COR-002 | Sub-category selection (Key Function Appointment, Product Launch, etc.) | ✅ | P0 | A | BRD | Done — `SAMASubCategory` type, persisted in letter model |
| COR-003 | Target SAMA department selection | ✅ | P0 | A | BRD | Done — `SAMADepartment` type, SAMA dept email map, recipient defaults per dept |
| COR-004 | Template databank with usage tracking, duplication, custom creation | ✅ | P1 | A | BRD | Done — `sama-template-store.ts` (Zustand + persist, 8 seed templates, CRUD + `incrementUsage`); `LetterTemplate` type extended with default subject/body/signer/recipient/signature fields; template edit form with Basic / Default Content / Signer & Signature / Recipient tabs |
| COR-005 | Approval routing (Draft → Send for Approval → Approved → Sent → Response Received) | ✅ | P0 | A | BRD | Done — `submitForApproval`, `approveStep`, `rejectStep`, `send`, `markResponseReceived` store actions fully wired; status values kebab-case; feed page fixed (`'closed'` → `'response-received'`) |
| COR-006 | Writer → Reviewer (Dept Head) → CEO approval chain | ✅ | P0 | A | BRD | Done — Three-step `SAMALetterApprovalStep[]` approval chain; `ApprovalStepActions` component; approve/reject with notes; all-steps-approved auto-transitions letter to `approved` status |
| COR-007 | Attachment management per letter | ✅ | P1 | A | BRD | Done — Attachment upload, display, zip download alongside PDF export using `fflate` |
| COR-008 | Activity timeline per letter | ✅ | P1 | A | BRD | Done — `SAMALetterTimelineEvent[]`; `translateTimelineTitle` helper with EXACT map, FIELD_UPDATED map, and prefix patterns for approval events; 16 new i18n keys (EN + AR); timeline simplified from IIFE-with-progress-bar to flat map |
| COR-009 | Reference number auto-generation | ✅ | P0 | A | BRD | Done — `getNextReference(type)` store action; prefixes NOB/INQ/SUB/NOT; year-scoped, zero-padded sequential numbering |
| COR-010 | Response deadline tracking with overdue alerts | ✅ | P1 | A | BRD | Done — Deadline auto-set on send per letter type (Non-Objection=30d, Inquiry=21d, Submission=45d, Notification=10d); `responseDeadline` stored as ISO string |
| COR-011 | Thread management (original → response → follow-up linked) | 📋 | P1 | A | BRD | |
| COR-012 | Email automation (Outlook popup with PDF letter + attachments) | ✅ | P2 | A | BRD | Done — "Send To SAMA" generates PDF via html2canvas + jsPDF (client-side), triggers zip of attachments via fflate, then opens mailto: with SAMA dept email + localized subject; `pendingSend` state navigates to detail view first then auto-fires flow via useEffect |
| COR-013 | Multi-authority generalization (extend workflow to CMA, IA) | 📋 | P2 | A | BRD | Same workflow, authority-specific letter types/templates |
| COR-014 | Template management per authority (separate template libraries) | 📋 | P2 | A | BRD | |
| COR-015 | CMA-specific: Prospectus review cycle (multi-round submission/feedback) | 🗺️ | P3 | A | REC | Unique workflow — not standard letter |
| COR-016 | CMA-specific: Disclosure filings (structured data, not letters) | 🗺️ | P3 | A | REC | |
| COR-017 | CMA-specific: Material event notifications (time-sensitive trigger) | 🗺️ | P3 | A | REC | |
| COR-018 | CMA-specific: License lifecycle management (10-year, annual fees) | 🗺️ | P3 | A | REC | |
| COR-019 | CMA-specific: Enforcement proceeding responses | 🗺️ | P3 | A | REC | Legal implications — special workflow |
| COR-020 | IA-specific: Actuarial submission templates | 🗺️ | P3 | A | REC | Technical documents, not standard letters |
| COR-021 | IA-specific: Solvency filing templates | 🗺️ | P3 | A | REC | Structured financial data |
| COR-022 | IA-specific: Insurance product approval workflow | 🗺️ | P3 | A | REC | Pricing, terms, coverage data |
| COR-023 | Correspondence store with persistence, archive field, reference number, assignee | ✅ | P1 | A | FEEDBACK | Done — Zustand + persist, `archived`, `reference`, `assignee` fields, seed data, `getNextReference()`. `Correspondence.type` expanded to 7 types: sama, cma, internal, external_auditor, sharia_board, vendor, other — aligned across store, add/edit modals, and feed filters |
| COR-024 | Correspondence hub feed page with live multi-module metric cards | ✅ | P1 | A | FEEDBACK | Done — SAMA submissions, audit observations, saudization rate, training completion; integrates 9 stores. Feed improvements: Team Capacity "View All" link to `/team`; Upcoming Submission card pulls from all three sources (registry, SAMA letters, observations) with source colour chips and per-item Review navigation; Regulatory Tracker rows clickable with deep-link; Policy Review card overdue logic fixed (active policies past `nextReviewDate`); Rules & Circulars section added with same stats pattern; Next Deadline footer clusters all requirements sharing the nearest calendar day |
| COR-025 | Letter list view with archive/unarchive workflow and CSV export | ✅ | P1 | A | FEEDBACK | Done — Active/archived/all filter, reply composer, letter detail modal, localized CSV export |
| COR-026 | Deep-link navigation: feed → registry / SAMA letters / observations with auto-open detail view | ✅ | P1 | A | FEEDBACK | Done — All three destination pages read `?id=` from `useSearchParams` on mount and auto-open the matching detail view (registry view modal, SAMA letters detail view, observations detail modal). Feed "Review" buttons and Regulatory Tracker rows push `?id=` param |
| COR-027 | Deep-link navigation: feed risk heatmap → risk register with auto-open drawer | ✅ | P1 | A | FEEDBACK | Done — Heatmap cell detail view risk cards converted to full-row `<button>` elements; clicking any risk navigates to `/reports/risks?id={risk.id}`. Risk register reads `?id=` via `useSearchParams` + `useRef` on mount and auto-opens the matching risk drawer. Closes heatmap panel and cell detail before navigating |
| COR-028 | SAMA letter page RTL cleanup — remove redundant conditional class interpolations | ✅ | P1 | A | FEEDBACK | Done — ~76 instances of `${isRTL ? 'flex-row-reverse' : ''}` and `${isRTL ? 'text-right' : ''}` removed from sama-letters page; layout driven by Tailwind RTL utilities instead; `dir` attribute on letter content wrapper overrides inherited RTL cascade for letter direction |
| COR-029 | Action dropdown smart upward flip in letter table | ✅ | P1 | A | FEEDBACK | Done — `menuPosition` state extended with `buttonTop`; portal computes `flipUp` when trigger is near bottom of viewport; dropdown repositions above trigger automatically |
| COR-030 | "Send To SAMA" from table auto-triggers after navigating to detail view | ✅ | P1 | A | FEEDBACK | Done — `pendingSend` ref/state pattern: table action navigates to detail view and sets flag; `useEffect` on detail view mount detects flag and auto-triggers full send flow |

---

## Epic 3: Rules & Circulars

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RUL-001 | Circular registration (title, reference, dates, departments, PDF upload) | 🔧 | P0 | A | BRD | UI built, logic not wired |
| RUL-002 | Applicability assessment (applicable/not-applicable with rationale) | 📋 | P0 | A | BRD | |
| RUL-003 | CAP creation (articles breakdown with risk level, department, status, deadlines) | 📋 | P0 | A | BRD | |
| RUL-004 | Business Owner assignment with notification | 📋 | P0 | A | BRD | Notification to dept owner on assignment |
| RUL-005 | Evidence collection per CAP item (upload by Business Owners) | 📋 | P1 | A | BRD | |
| RUL-006 | Article-level completion tracking with percentage aggregation | 📋 | P1 | A | BRD | |
| RUL-007 | Compliance review of evidence (approve or request additional docs) | 📋 | P1 | A | BRD | |
| RUL-008 | Submission preparation to regulator (formal confirmation) | 📋 | P2 | A | BRD | |
| RUL-009 | Priority classification (High, Medium, Low) | 🔧 | P1 | A | BRD | UI built |
| RUL-010 | Department-based filtering | 🔧 | P1 | A | BRD | UI built |
| RUL-011 | Internal notes/comments per circular | 📋 | P1 | A | BRD | |
| RUL-012 | Documentation repository per circular | 📋 | P1 | A | BRD | |
| RUL-013 | Activity feed per circular | 📋 | P2 | A | BRD | |
| RUL-014 | Convert non-compliance items to observations | 📋 | P2 | A | BRD | Link to Observation Tracker (Epic 6) |
| RUL-015 | Multi-authority circular support (SAMA, CMA, IA circulars) | 💡 | P2 | A | REC | Filter by authority |
| RUL-016 | Circular store (Zustand + persist, CRUD, 5 seed circulars, authority-aware ref gen) | ✅ | P1 | A | FEEDBACK | Done — `circular-store.ts`; `getNextReference(authority)` produces `SAMA-2026-001` format; full CRUD + advanceStep, setApplicability, setBusinessOwner, addArticle, updateArticle, removeArticle, requestEdit, approveEdit, rejectEdit actions; seed circulars span all statuses and CAP phases |
| RUL-016b | Requirement registry store (Zustand + persist, CRUD, 15 seed items, pagination) | ✅ | P1 | A | FEEDBACK | Done — migrated: `requirement-store.ts` removed; `Requirement.linkedCircularId` field added to `types/index.ts` linking requirements to circulars; feed page switched from requirement-store to circular-store |
| RUL-017 | Registry page: sortable/filterable table (name, category, date, status, due date, progress) | ✅ | P1 | A | FEEDBACK | Done — Asc/desc sort with clear button on all 6 columns, search + category + status filters |
| RUL-018 | Compliance checklist per requirement with auto-computed progress | ✅ | P1 | A | FEEDBACK | Done — `ChecklistItem[]` on Requirement, toggle in view modal = instant store update, progress bar auto-derived |
| RUL-019 | Reference URL per requirement (external link to source document) | ✅ | P1 | A | FEEDBACK | Done — `referenceUrl` field, protocol guard on href, "View Reference" link in view modal |
| RUL-020 | Affected department field with color-coded department chips | ✅ | P1 | A | FEEDBACK | Done — 7 predefined departments (Compliance, IT, Finance, Operations, Risk Management, HR, Legal), each with distinct color |
| RUL-021 | Color-coded category badges (Cybersecurity=blue, AML/CTF=rose, Risk=amber, etc.) | ✅ | P1 | A | FEEDBACK | Done — 6 category colors + fallback, department chip stacked below in table |
| RUL-022 | CSV export for requirements | ✅ | P1 | A | FEEDBACK | Done — `exportRequirementsLocalized()`, UTF-8 BOM, localized headers, i18n values, enriched with ID, Affected Department, Type, Checklist Progress, Checklist Items, Reference URL columns; checklist-derived progress overrides raw progress field |
| RUL-023 | Requirement type classification (Rule/Circular vs Policy/Procedure) | ✅ | P1 | A | FEEDBACK | Done — `kind?: 'rule' | 'policy'` field on `Requirement` type and `RequirementFilters`; kind selector in create modal and edit form; "Type" column with colored badges in registry table; kind filter dropdown (All / Rule / Policy) in registry filter bar; all 15 seed items tagged `kind: 'rule'`; i18n keys added (EN + AR) |
| RUL-024 | Registry cross-navigation links (to Regulatory Updates and Policies pages) | ✅ | P2 | A | FEEDBACK | Done — Quick-nav link buttons in registry header: "View Regulatory Updates" → `/correspondence/regulatory-updates/rules`, "View Policies" → `/correspondence/regulatory-updates/policies`; reciprocal "View Registry" link added to both regulatory-updates sub-pages |

---

## Epic 4: Policies & Procedures

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| POL-001 | Policy registry (name, version, status, category, owner, dates) | ✅ | P1 | S | BRD | Done — rewritten to consume `policy-store`; sortable/filterable table with search, category, status, approvalTier filters; RegDocCard list view; detail drawer with version history + workflow timeline |
| POL-002 | Policy store (Zustand with persistence) | ✅ | P0 | S | BRD | Done — full rewrite: sync CRUD actions, 5 seed policies (POL-001..005), `getNextId()`, `submitForReview`, `approve`, `initiateReview`, `reviewAlerts()` (90-day window + expired), persist v1 migration |
| POL-003 | Automated review notifications (90 days before next review) | ✅ | P1 | S | BRD | Done — `reviewAlerts()` store action returns policies with `nextReviewDate ≤ 90 days` or `status === 'expired'`; policies page shows alert banner with count |
| POL-004 | Tiered approval workflows (Board / Management+Sharia / AGM) | ✅ | P1 | S | BRD | Done — `PolicyApprovalTier` type; `approvalTier` field on Policy; tier badge in RegDocCard and detail drawer; `submitForReview` / `approve` / `initiateReview` store actions |
| POL-005 | Version history with changelog | ✅ | P1 | S | BRD | Done — `PolicyVersionEntry[]` on Policy model; rendered in detail drawer with version, date, author, changes columns |
| POL-006 | Audit trail (creation, edits, approvals, rejections, publication) | 📋 | P1 | S | BRD | |
| POL-007 | Document management (PDF, DOC uploads per policy) | 📋 | P1 | S | BRD | |
| POL-018 | Custom review schedule (cadence + day-of-month anchor) | ✅ | P1 | S | FEEDBACK | Done — `ReviewSchedule` type (`cadence: monthly\|quarterly\|semi-annual\|yearly\|adhoc`, `dayOfMonth: 1–28`, `adhocDate`); `ReviewSchedulePicker` UI component (cadence select + 4×7 day grid + ad-hoc date input, RTL-aware); `computeNextReview()` utility in `src/lib/review-schedule.ts`; policy create/edit modals and `initiateReview()` store action all derive `nextReviewDate` from schedule |
| POL-008 | Status dashboard (total, by status, upcoming/overdue reviews) | ✅ | P1 | S | BRD | Done — stat cards driven by live `policy-store` data; counts for approved/under-review/draft/expired and overdue review alerts |
| POL-009 | Compliance engine integration (Policy Currency = 15% weight) | ✅ | P0 | S | BRD | Done — engine filter widened from `status === 'active'` to `status === 'approved' || 'active'`; `PolicySlice.status` widened to `string` in compliance-engine.types.ts; policy-store seeds provide real data |
| POL-010 | Framework principle tagging on policies | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 12 |
| POL-011 | Shared RegDocCard component (circular + policy variants) | ✅ | P1 | A | FEEDBACK | Done — moved to `src/components/correspondence/regulatory-updates/RegDocCard.tsx`; circular variant: authority badge, priority, status, business owner, progress bar, days left, phase chip; policy variant: category icon, status badge, tier badge, owner avatar, next review urgency; `overdue`/`requires-review` status handling added (Sprint 5) |
| POL-012 | Shared RegDocFilterBar component | ✅ | P1 | A | FEEDBACK | Done — moved to `src/components/correspondence/regulatory-updates/RegDocFilterBar.tsx`; reusable filter bar for both circulars and policies pages |
| POL-013 | In-app system notification when manager review is requested on a policy step | ✅ | P1 | S | FEEDBACK | Done (Sprint 5) — `PolicyDetailsContent` wires `notify-manager-prompt` confirmation → `notification-store.addNotification()`; notification title/body localized, links back to policies page |
| POL-014 | Email notification to policy owner when status becomes `requires-review` | 📋 | P2 | S | BRD | Requires server-side scheduler (cron/job queue) + email service (SendGrid, Resend). The `checkAndUpdateStatuses()` action in `policy-store.ts` sets client-side status; a server equivalent would send email at the 90-day threshold |
| POL-015 | Evidence filter across all review cycles | ✅ | P1 | S | FEEDBACK | Done (Sprint 5) — `Policy` type gains `reviewCycleHistory[]`; `initiateReview()` pushes the outgoing cycle to history before creating the new one; evidence `useMemo` in PolicyDetailsContent merges current + history cycles so all past uploads remain filterable |
| POL-016 | Status auto-derive on workflow-step drag (reorder + drag-to-bin) | ✅ | P1 | S | FEEDBACK | Done (Sprint 5) — `deriveStatusFromTimeline()` helper evaluates the updated timeline after every drag operation (reorder and bin-drop) and writes the correct `PolicyStatus` back to the store; drag-reorder and drag-to-bin both also clear `stepState` from non-completed steps to prevent stale approval-flow button states |
| POL-017 | Evidence cycle filter always visible (single-cycle policies) | ✅ | P1 | S | FEEDBACK | Done (Sprint 5) — guard changed from `evidenceCycles.size > 1` to `> 0`; dropdown now renders for first-cycle policies with the current cycle as the sole option; `lucide:filter` icon added for visual affordance; no logic changes to cycle data or display |
| POL-019 | Submit for Review — stay on step, enter pending-approval state (not advance) | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — `PolicyDetailsContent` submit branch sets `stepState: 'pending-approval'` on the current step without advancing; `policy-store.submitForReview` no longer calls `advanceTimeline()`, mirrors same in-place state change |
| POL-020 | Workflow chip labels corrected and guarded to current step only | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — `awaiting-response` chip uses `policies.awaitingResponse` key ("Awaiting Response"); `awaiting-manager` chip uses `policies.awaitingManagerResponse` key ("Awaiting Manager Response"); all chips gated on `step.status === 'current'` to prevent stale chips after undo; `awaitingResponse` key added to en.json and ar.json |
| POL-021 | Next-step auto-derives stepState on Complete (request-approval, send-email, notify-manager) | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — when a step is completed and the next pending step is activated, its `stepState` is auto-set based on `actionType`: `request-approval`/`send-for-review` → `pending-approval`; `send-email` → `awaiting-response`; `notify-manager` → `awaiting-manager` |
| POL-022 | Undo step clears stepState on both reverted and demoted steps | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — undo branch sets `stepState: undefined` on the step being reverted to `current` AND on any step being pushed back to `pending`; eliminates stuck approval-flow chips after undo |
| POL-023 | policy-store `approve()` accepts optional notes and approvedBy, logs activity entry | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — `approve(id, notes?, approvedBy?)` signature extended; current step note and `stepState: undefined` written on all completed steps; `workflow_approved` activity entry appended with localized EN/AR text |
| POL-024 | PolicyDetailsContent accepts `initialTab` prop for deep-link tab targeting | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — `initialTab?: DetailTab` prop added; `useState` initializes from `initialTab ?? 'overview'` allowing external callers (e.g., Pending Approvals modal) to open directly on the workflow tab |

---

## Epic 5: Circular AI & Backend Features

> Deferred from Sprint 2 (Circular Detail Overhaul). All items require ML/LLM backend or auth infrastructure not yet available in the frontend-only build.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| CIRC-AI-001 | PDF auto-parse to fill title + authority on upload | 📋 | P2 | A | FEEDBACK | Requires ML/backend OCR service |
| CIRC-AI-002 | AI-powered CAP applicability analysis | 📋 | P2 | A | FEEDBACK | Requires LLM backend; analyzes circular text vs entity profile |
| CIRC-AI-003 | AI article extraction from circular PDF | 📋 | P2 | A | FEEDBACK | Requires LLM backend; auto-populates article breakdown |
| CIRC-AI-004 | Auto-suggest business owner dept based on circular content | 📋 | P3 | A | FEEDBACK | Requires ML classification model |
| CIRC-AI-005 | "Pending AI Review" initial state + officer approval flow | 📋 | P2 | A | FEEDBACK | Depends on AI backend; CO reviews AI applicability suggestion |
| CIRC-BE-001 | Formal CR approval flow (Compliance Officer → Compliance Manager) with real notifications | 📋 | P1 | A | FEEDBACK | Requires backend + auth roles; replaces simulate-only advance step |
| CIRC-BE-002 | Real email sending for BO notification and authority correspondence | 📋 | P1 | A | FEEDBACK | Requires backend email service (SES / SendGrid) |
| CIRC-BE-003 | Authority correspondence: auto-download CAP/Remediation PDF and send to authority | 📋 | P2 | A | FEEDBACK | Requires backend + PDF generation service |

---

## Epic 6: Observation Tracker

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| OBS-001 | Multi-source tracking (SAMA Inspection, Internal Audit, Sharia Audit) | ✅ | P0 | S | BRD | Done |
| OBS-002 | Severity classification (Critical, High, Medium, Low) with weighted scoring | ✅ | P0 | S | BRD | Done |
| OBS-003 | Status lifecycle (Open → In Progress → Resolved → Closed) | ✅ | P0 | S | BRD | Done |
| OBS-004 | Remediation plan workflow (submit → review → approve/reject) | ✅ | P0 | S | BRD | Done |
| OBS-005 | Evidence collection (document upload with remediation plan association) | ✅ | P0 | S | BRD | Done |
| OBS-006 | Checklist management (per-observation remediation checklists) | ✅ | P0 | S | BRD | Done |
| OBS-007 | Dual deadlines (Plan Submission Due + Remediation Deadline) | ✅ | P0 | S | BRD | Done |
| OBS-008 | Closure workflow (Request → Leader/Manager review → Approve/Reject) | ✅ | P0 | S | BRD | Done |
| OBS-009 | Leadership model with transfer capability | ✅ | P0 | S | BRD | Done |
| OBS-010 | Role-based access (Officers view/create, Managers manage, Leaders manage their own) | ✅ | P0 | S | BRD | Done |
| OBS-011 | Activity timeline (full audit trail) | ✅ | P0 | S | BRD | Done |
| OBS-012 | Department assignment | ✅ | P0 | S | BRD | Done |
| OBS-013 | CSV export | ✅ | P0 | S | BRD | Done |
| OBS-014 | Sub-classification system (subTitle field with filtering) | ✅ | P0 | S | BRD | Done |
| OBS-015 | Visit-type column (online vs. on-site inspection) | 📋 | P1 | S | FEEDBACK | Field not yet in data model |
| OBS-016 | Evidence follow-up per department (request-and-track workflow) | 📋 | P1 | S | FEEDBACK | Currently upload-only, no request tracking |
| OBS-017 | Framework principle tagging on observations | 📋 | P1 | B | BRD | `frameworkTags[]` metadata field. See Epic 12 |
| OBS-018 | Expand source types to include CMA, IA observations | 💡 | P2 | A | REC | When onboarding adds CMA/IA authorities |

---

## Epic 7: Audit Management

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| AUD-001 | Multi-type support (Internal Audit, SAMA Inspection, Sharia Audit) | ✅ | P0 | S | BRD | Done |
| AUD-002 | Terminology compliance ("SAMA Inspection" not "audit") | ✅ | P0 | A | BRD | Done |
| AUD-003 | Lifecycle management (Pending → In Progress → Completed + Overdue) | ✅ | P0 | S | BRD | Done |
| AUD-004 | Priority, category, frequency classification | ✅ | P0 | S | BRD | Done; frequency field now supplemented by `ReviewSchedulePicker` in add/edit modals (Sprint 6) — cadence + day-of-month drives `dueDate` via `computeNextReview()`; computed date shown read-only; `reviewSchedule` persisted on `Audit` |
| AUD-005 | Team management with lead auditor designation | ✅ | P0 | S | BRD | Done |
| AUD-006 | Document management (working papers) | ✅ | P0 | S | BRD | Done |
| AUD-007 | Comment system (threaded, with edit/delete permissions) | ✅ | P0 | S | BRD | Done |
| AUD-008 | Progress tracking with overdue detection | ✅ | P0 | S | BRD | Done |
| AUD-009 | Late completion tracking (closedOverdue, completedAt) | ✅ | P0 | S | BRD | Done |
| AUD-010 | Audit log (activity logs, filterable) | ✅ | P0 | S | BRD | Done |
| AUD-011 | Compliance engine integration (Audit Completion = 25% weight) | ✅ | P0 | S | BRD | Done |
| AUD-012 | Automated archiving for completed internal audits | 📋 | P1 | C | FEEDBACK | Configurable retention period, archive view |
| AUD-013 | Recurring scheduling (auto-create next instance on completion) | 📋 | P1 | S | FEEDBACK | E.g., complete Q1 → auto-create Q2 |
| AUD-014 | Framework principle tagging on audits | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 12 |
| AUD-015 | Expand audit types to include CMA Inspection, IA Inspection | 💡 | P2 | A | REC | When onboarding adds CMA/IA |

---

## Epic 8: Reports & Analytics

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RPT-001 | Compliance engine (5-component weighted score) | ✅ | P0 | S | BRD | Done |
| RPT-002 | Period filtering (3m, 6m, 12m, fiscal year) | ✅ | P0 | S | BRD | Done |
| RPT-003 | Confidence levels (Insufficient/Low/Moderate/High) | ✅ | P0 | S | BRD | Done |
| RPT-004 | Per-framework scores (SAMA, Internal, Sharia) | ✅ | P0 | S | BRD | Done |
| RPT-005 | Automated deductions | ✅ | P0 | S | BRD | Done |
| RPT-006 | Trend generation (monthly/quarterly data points) | ✅ | P0 | S | BRD | Done |
| RPT-007 | Period-over-period change | ✅ | P0 | S | BRD | Done |
| RPT-008 | Configurable weights (admin, must sum to 100%) | ✅ | P0 | S | BRD | Done |
| RPT-009 | Executive view tab | ✅ | P0 | S | BRD | Done |
| RPT-010 | Audits tab (CRUD, filtering, sorting, CSV export) | ✅ | P0 | S | BRD | Done |
| RPT-011 | Detailed logs tab (activity logs, CSV export) | ✅ | P0 | S | BRD | Done |
| RPT-012 | Replace hardcoded risk data in Risks tab with Risk Store | ✅ | P0 | S | BRD | Done — `risks` useMemo maps store data to page format, all UI driven by `useRiskStore` |
| RPT-013 | Replace hardcoded executive view details with live data | 📋 | P1 | S | BRD | |
| RPT-014 | Framework-aligned reporting (per-framework coverage %) | 📋 | P1 | B | BRD | See Epic 12. Show coverage per control |
| RPT-015 | Control-level drill-down (all tagged entities per control) | 📋 | P2 | B | BRD | |
| RPT-016 | Gap analysis report (controls with no associated records) | 📋 | P2 | B | BRD | |

---

## Epic 9: Calendar

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| CAL-001 | Dual calendar (Gregorian + Hijri) with month/year navigation | ✅ | P0 | S | BRD | Done |
| CAL-002 | Event types (Deadline, Meeting, Submission, Review) with filtering | ✅ | P0 | S | BRD | Done |
| CAL-003 | Task creation with priority and assignee | ✅ | P0 | S | BRD | Done |
| CAL-004 | Entity linkage (to audits, observations, letters) | ✅ | P0 | S | BRD | Done |
| CAL-005 | Reminder system (email, notification, SMS) | 🔧 | P1 | S | BRD | UI built, delivery not implemented |
| CAL-006 | View modes (Month, Week, Day) | ✅ | P0 | S | BRD | Done |
| CAL-007 | Overdue detection with visual indicators | ✅ | P0 | S | BRD | Done |
| CAL-008 | Recurring regulatory dates (auto-generate annually/quarterly/monthly) | 📋 | P1 | S | BRD | |
| CAL-009 | Multi-authority submission calendar with authority color coding | 📋 | P1 | A | BRD | Consolidated view across SAMA, CMA, ZATCA, MISA |
| CAL-010 | Auto-population from audit due dates, observation deadlines, policy reviews | 📋 | P1 | S | BRD | |
| CAL-011 | Public holiday calendar (Saudi) with working day calculations | 💡 | P1 | S | REC | From onboarding. Affects deadline calculations |

---

## Epic 10: Risk Register

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RSK-001 | Risk store (Zustand with persistence) | ✅ | P0 | S | BRD | Done — `risk-store.ts` with create, update, updateStatus, delete actions + localStorage persistence |
| RSK-002 | 5×5 risk matrix (likelihood × impact) | ✅ | P1 | S | BRD | Done — Interactive matrix driven by live store data, click-to-select with multi-risk cell cycling |
| RSK-003 | Risk categories (Operational, Financial, Compliance, Strategic, Reputational) | ✅ | P1 | S | BRD | Done — Category filtering, i18n labels (EN/AR), category distribution card with monitoring stats |
| RSK-004 | Status lifecycle (Open → Mitigating → Accepted → Closed) | ✅ | P1 | S | BRD | Done — Status dropdown in drawer calls `updateStatus`, maps UI↔store statuses, i18n labels |
| RSK-005 | Mitigation tracking (plan + checklist-driven progress) | ✅ | P1 | S | BRD | Done — Hybrid: free-text plan for context + action item checklist (add/edit/toggle/remove), progress auto-computed from completed/total items, reuses `ChecklistSection` component with domain-agnostic label overrides |
| RSK-006 | Risk owner assignment | ✅ | P1 | S | BRD | Done — Owner from team store, selectable in add/edit modal, displayed with avatar/department |
| RSK-007 | Monitoring frequency with auto-computed review dates | ✅ | P1 | S | BRD | Done — `nextReviewDate = lastReviewDate + monitoringFrequency` (7d/1mo/3mo/6mo/1yr), "Mark as Reviewed" button resets cycle, dates auto-set on risk creation, category card filters by frequency; enhanced (Sprint 6) with `ReviewSchedulePicker` in add/edit modal: cadence + day-of-month anchor drives `nextReviewDate` via `computeNextReview()`; `markReviewed()` advances by schedule cadence when set, falls back to legacy `monitoringFrequency` offset |
| RSK-008 | Audit trail (status, score, mitigation, review, checklist changes) | ✅ | P1 | S | BRD | Done — History timeline in drawer with colored dots, 11 action types including 4 checklist actions (added/toggled/edited/removed), all changes append entries automatically |
| RSK-009 | Compliance engine integration (Risk Posture = 20% weight) | 📋 | P0 | S | BRD | Currently returns 0 — engine receives empty arrays for risk data |
| RSK-010 | Dashboard widget integration | 📋 | P1 | S | BRD | |
| RSK-011 | Framework principle tagging on risks | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 12 |
| RSK-012 | Risk list search (name, description, category, owner) | ✅ | P1 | S | BRD | Done — Search input in risk list card header, case-insensitive across 4 fields |
| RSK-013 | Risk list sorting (name, category, score, status, owner) | ✅ | P1 | S | BRD | Done — Clickable column headers with asc/desc chevron indicators, clear button |
| RSK-014 | Edit risk (populate modal from existing risk, update via store) | ✅ | P1 | S | BRD | Done — Edit button in drawer pre-fills all 8 form fields, saves via `update` action, appends history entry |
| RSK-015 | Export single risk to CSV | ✅ | P1 | S | BRD | Done — Export button in drawer, filename: `risk-{name}-{date}.csv`, uses `exportRisksLocalized` |
| RSK-016 | Bulk risk list CSV export | ✅ | P1 | S | BRD | Done — Header export button exports sorted/filtered risk list via `exportRisksLocalized` with i18n |
| RSK-017 | Sequential human-readable risk IDs (RSK-001, RSK-002, ...) | ✅ | P1 | S | BRD | Done — Auto-incrementing from highest existing ID, zero-padded to 3 digits |
| RSK-018 | Full i18n for risk labels (categories, statuses, likelihood/impact scales) | ✅ | P0 | S | BRD | Done — All labels use `t()` with `reports.*` / `riskRegister.*` keys, Arabic translations verified |
| RSK-019 | Review reminder notifications (email risk owners when review date approaches) | 📋 | P2 | S | REC | Depends on notification delivery system (SET-009) |
| RSK-020 | Delete risk from list and drawer (with confirmation dialog) | ✅ | P1 | S | BRD | Done — Trash icon in risk list rows + delete button in drawer, uses `DeleteConfirmationDialog`, calls store `delete` action, closes drawer if deleted risk was selected |
| RSK-021 | Risk list pagination (10 per page) | ✅ | P1 | S | BRD | Done — Page controls below table (prev/next, page X/Y, range display), resets to page 1 on filter/search change, follows audit logs pagination pattern |

---

## Epic 11: Team & Training

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| TRN-001 | Active Directory (team listing, detail view, stats) | ✅ | P0 | S | BRD | Done — wired to `team-store`; `SortHeader<T>` column sorting; `DirectoryStatCards`, `MemberDetailDrawer`, `PendingApprovalsCard`, `BurnoutDetectionCard` components; `selectedMemberId: string | null` derived from store to fix stale drawer bug |
| TRN-002 | User Logs (activity log, filterable, exportable) | ✅ | P0 | S | BRD | Done — `user-log-store.ts` (Zustand + persist, 15 seed logs); zero `isRTL` conditionals; logical CSS throughout; `logSort` state + `sortedLogs` useMemo for timestamp/user asc/desc; localized CSV export via `exportUserLogsLocalized` |
| TRN-003 | Invite new member workflow with role assignment | ✅ | P0 | S | BRD | Done — multi-invite modal with per-row `permissions: Record<string, boolean>` and `accessDuration`; "Add Another" row; `STANDARD_PERMISSIONS` + `perms()` helper in team-store |
| TRN-004 | Training store (Zustand with persistence) | ✅ | P0 | S | BRD | Done — `training-store.ts` persist v3 with seed migration (4 employees, 4 courses, dept progress, overview stats, saudization); empty seeds on v2 reset; `TrainingCategory` expanded with 8 new categories (data-privacy, ethics, fraud-prevention, governance, operational-risk, business-continuity, sanctions, internal-audit); `CourseProgress.progress` field added |
| TRN-005 | Overall training dashboard (completion rates, assigned, overdue) | ✅ | P1 | S | BRD | Done — `TrainingOverviewStats` component driven by live store data; manual entry and upload populate real numbers |
| TRN-006 | Department-level progress tracking | ✅ | P1 | S | BRD | Done — `DepartmentProgressCard` reads dept progress from training store |
| TRN-007 | Saudization metrics (Saudi vs Non-Saudi, actual/target/gap) | ✅ | P1 | S | BRD | Done — `SaudizationCard` component; dept name grid layout fixed with `grid-cols-[8rem_2.5rem_1fr_2.5rem]` to guarantee visible truncated department names (Sprint 3.3) |
| TRN-008 | Employee training records (per-employee view) | ✅ | P1 | S | BRD | Done — `EmployeeTable` + `EmployeeDetailModal` with per-employee course progress |
| TRN-009 | Course management (add, set deadlines, assign, remove) | ✅ | P1 | S | BRD | Done — `AssignTrainingModal` + `TrainingManageModal` wired to training store |
| TRN-010 | Course categories (Compliance, AML, Cybersecurity, Sharia, Risk, + 8 new) | ✅ | P1 | S | BRD | Done — 13 categories total; i18n keys added for all 8 new categories in en.json + ar.json |
| TRN-011 | Bulk assignment of courses | 📋 | P2 | S | BRD | |
| TRN-012 | Training report export | ✅ | P2 | S | BRD | Done — `exportTrainingDataLocalized` in `export.ts`; wired to both download buttons in `EmployeeTable` via `onExport` prop |
| TRN-013 | Compliance engine integration (Training Completion = 15% weight) | 📋 | P0 | S | BRD | Currently returns 0 |
| TRN-014 | Saudization data integration with MISA requirements | 💡 | P3 | A | BRD | Pattern 4 linkage |
| TRN-015 | File upload with category checkboxes sends file to AI API for parsing | 📋 | P2 | S | REC | Upload modal already has file + category selection UI (`TrainingUploadModal`) |
| TRN-016 | AI returns structured data (employees, saudization metrics, training records) | 📋 | P2 | S | REC | Requires: API endpoint, file parsing service |
| TRN-017 | Confidence scoring on parsed fields (highlight low-confidence values in amber) | 📋 | P3 | S | REC | UX: let user correct before confirming |
| TRN-018 | Support for .xlsx, .csv, .pdf, .docx input formats | 📋 | P2 | S | REC | PDF/DOCX need OCR or text extraction |
| TRN-019 | Pending Approvals card — managerial-only, enriched modal, deep-links | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — audits removed (no manager approval loop); policies: only `notify-manager` steps with `awaiting-manager` stepState flagged; SAMA: only Department Head (step 2) pending; stat count and card list use identical filter; urgency = deadline within 30 days or requires-review/urgent status; modal shows mini workflow timeline (policies) or approval chain (SAMA), evidence + attachment downloads; deep-links with `?id=`; fixed i18n keys (`navigation.samaLetters`, `policies.approvalWorkflow`) |
| TRN-020 | Burnout Detection card — suggest reassignment with workload targets | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — "Suggest Reassignment" expands to show ALL cross-store assignments as individual cards with color-coded type badges; clicking an item reveals 3 lowest-workload reassignment targets; `useBurnoutDetection` hook in `useWorkload.ts` drives escalation tier display |
| TRN-021 | Member detail drawer — full cross-store workload item list | ✅ | P1 | S | FEEDBACK | Done (Sprint 3.3) — `useWorkload` returns `items: WorkloadItem[]`; drawer renders individual item cards per observation/audit/policy/correspondence with color-coded type badges (observation=rose, audit=amber, policy=blue, correspondence=violet); manual task assignments retain unassign + "Clear All" buttons |
| TRN-022 | `SortHeader<T>` reusable sort component | ✅ | P1 | S | FEEDBACK | Done — `src/components/ui/sort-header.tsx` with `SortState<T>` generic type; used across directory, logs, and training pages |
| TRN-023 | Team member export | ✅ | P1 | S | FEEDBACK | Done — `exportTeamMembersLocalized` in `export.ts` |

> **TRN-015–018 Dependencies:** Backend API endpoint for file upload + AI parsing service (e.g., OpenAI structured output, Claude tool use, or custom NLP pipeline). Frontend upload modal (`TrainingUploadModal`) is ready — currently uses hardcoded default values as placeholder.

---

## Epic 12: Framework Metadata Layer

> Core Archetype B infrastructure. Adds tagging capability across all existing modules without new workflows.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| FRM-001 | Framework data model (versioned: framework → domains → subdomains → controls) | 📋 | P1 | B | BRD | Versioned object. See FRM-010 |
| FRM-002 | Control/principle library — NCA ECC-2:2024 (108 controls, 4 domains) | 📋 | P1 | B | BRD+REC | Latest version |
| FRM-003 | Control/principle library — NCA CSCC (105+ controls) | 📋 | P2 | B | BRD | |
| FRM-004 | Control/principle library — NCA CCC (60+ controls) | 📋 | P2 | B | BRD | |
| FRM-005 | Control/principle library — SAMA CSF (4 domains, multiple subdomains) | 📋 | P1 | B | BRD | |
| FRM-006 | Control/principle library — SDAIA PDPL (~43 articles) | 📋 | P1 | B | BRD+REC | |
| FRM-007 | Control/principle library — COSO IC (5 components, 17 principles) | 📋 | P2 | B | REC | |
| FRM-008 | Control/principle library — COSO ERM (5 components, 20 principles) | 📋 | P2 | B | REC | |
| FRM-009 | Control/principle library — ISO 27001:2022 (93 Annex A controls) | 📋 | P2 | B | BRD | |
| FRM-010 | Framework versioning model (version field, stable internal IDs, status per article) | 💡 | P1 | B | REC | Controls never use authority numbering as PK |
| FRM-011 | Applicability declaration (SoA model — mark which articles apply per tenant) | 💡 | P1 | B | REC | Like ISO 27001 Statement of Applicability |
| FRM-012 | `frameworkTags[]` field on observations | 📋 | P1 | B | BRD | `{ frameworkId, controlId, controlRef }[]` |
| FRM-013 | `frameworkTags[]` field on audits | 📋 | P1 | B | BRD | |
| FRM-014 | `frameworkTags[]` field on policies | 📋 | P1 | B | BRD | |
| FRM-015 | `frameworkTags[]` field on risks | 📋 | P1 | B | BRD | |
| FRM-016 | Tag selection UI component (reusable: framework → domain → control picker) | 📋 | P1 | B | BRD | Used across OBS, AUD, POL, RSK modules |
| FRM-017 | Framework view / dashboard (per-framework coverage %, gap analysis) | 📋 | P2 | B | BRD | Filtered view across all tagged entities |
| FRM-018 | Framework store (Zustand, persisted) | 📋 | P1 | B | BRD | |
| FRM-019 | Control/principle library — CSTC standards | 📋 | P3 | B | BRD | |
| FRM-020 | Control/principle library — ISO 22301 (10 clauses) | 📋 | P3 | B | REC | |
| FRM-021 | Control/principle library — ISO 31000 (guidelines, not certifiable) | 📋 | P3 | B | REC | |
| FRM-022 | Control/principle library — SASO standards | 📋 | P3 | B | REC | Varies by standard |

---

## Epic 13: Framework Versioning & Migration

> Handles framework updates (e.g., NCA ECC v1→v2). Infrequent but critical.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| VER-001 | Version field on every framework (current_version, status: active/deprecated) | 💡 | P1 | B | REC | |
| VER-002 | Stable internal IDs for controls (never changes across versions) | 💡 | P1 | B | REC | Authority reference stored as display field only |
| VER-003 | Status field on articles/controls (active/deprecated/new/modified) | 💡 | P1 | B | REC | Handles removals without data loss |
| VER-004 | Audit trail on tag changes (timestamp, reason, old→new) | 💡 | P1 | B | REC | Critical for compliance evidence |
| VER-005 | Migration map data model (old_control → new_control, change_type) | 💡 | P2 | B | REC | change_type: unchanged/modified/merged/split/new/removed |
| VER-006 | Auto-migration for unchanged + modified controls | 💡 | P2 | B | REC | Tags auto-remapped |
| VER-007 | User review queue for merges, splits, removals | 💡 | P3 | B | REC | Side-by-side old vs. new |
| VER-008 | Gap identification for new controls (zero-coverage alerts) | 💡 | P2 | B | REC | |
| VER-009 | Version lock + archive (old version read-only, historical reports preserved) | 💡 | P3 | B | REC | |
| VER-010 | Central taxonomy management (ComplianceOS maintains, customers configure applicability) | 💡 | P2 | B | REC | Hybrid model — official read-only + custom overlay |

---

## Epic 14: Settings & Configuration

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| SET-001 | Framework listing with enable/disable per framework | ✅ | P1 | B | BRD | Done — `FrameworksSection` component; pinned frameworks grid (max 3) with pin/unpin/replace UI; "View All" modal with search + per-framework enable toggle; wired to `framework-config-store` (11 regulators, `pinnedIds`) |
| SET-002 | Per-framework settings (sync frequency, compliance threshold, alerts) | ✅ | P2 | B | BRD | Done — `FrameworkConfigModal`; enable/disable toggle, compliance threshold (strict/standard/relaxed/custom), alert on non-compliance toggle, dept multi-select from `department-store`; `SyncFrequency` field removed (persist v2 migration strips it) |
| SET-003 | Add custom framework (name, type, description, auto-sync) | 🔧 | P2 | B | BRD | Partial — framework config and enable/disable fully wired; custom framework creation form not yet built |
| SET-004 | Notification settings (email digests, critical alerts, Slack) | ✅ | P2 | S | BRD | Done — `NotificationsSection` + `useUserPreferencesStore`; granular `NotificationPreferences` (6 modules, 5 events, 3 scope options); master on/off toggle; email digest address input; Slack marked "Coming Later"; no longer imports 5 data stores |
| SET-005 | Integration marketplace (Slack, Teams, Drive, SharePoint, Jira, etc.) | ✅ | P3 | S | BRD | Done — `ConnectedAppsSection` shows Jira / Drive / Slack / GitHub cards behind a "Coming Soon" frosted overlay; marketplace placeholder link visible |
| SET-006 | Audit templates (listing, creation, usage tracking) | ✅ | P2 | S | BRD | Done — `AuditTemplatesSection` + `useAuditTemplateStore`; sortable table (name/category/updatedAt/usageCount); create/edit modal with frequency schedule picker (quarterly/semi-annual/annual/monthly/ad-hoc); 6 seed templates; `incrementUsage` action |
| SET-007 | Compliance weight configuration (bounds enforcement, sum=100%) | ✅ | P0 | S | BRD | Done — `FrameworkConfigModal` weight sliders; 7 dimensions (audits, observations, letters, policies, circulars, riskPosture, training); total shown in red when ≠ 100%; reset-to-defaults button |
| SET-008 | Target score configuration | ✅ | P0 | S | BRD | Done |
| SET-009 | Notification delivery system (backend) | 📋 | P2 | S | BRD | Currently UI only |
| SET-010 | Integration API connections (backend) | 🗺️ | P3 | S | BRD | Currently all placeholder |
| SET-011 | Policy templates store and management UI | ✅ | P2 | S | FEEDBACK | Done — `PolicyTemplatesSection` + `usePolicyTemplateStore`; 6 seed templates with `defaultWorkflowSteps[]`, `versionPattern`, `framework`; sortable table; create/edit modal with approval tier + review frequency + frequency schedule picker; persist v2 migration adds `frequency` + `frequencySchedule` |
| SET-012 | Department store (canonical list, CRUD, default-guard) | ✅ | P1 | S | FEEDBACK | Done — `useDepartmentStore`; 10 canonical seed departments (EN + AR names); `addDepartment`, `removeDepartment` (blocks `isDefault`), `updateDepartment`; all downstream consumers (rules modals, RegDocFilterBar, observations, audits, policies) migrated from hardcoded arrays to this store |
| SET-013 | User preferences store (dashboard view, timezone, date format, notification prefs) | ✅ | P1 | S | FEEDBACK | Done — `useUserPreferencesStore`; `dashboardView`, `timezone`, `dateFormat: DateFormatPreference`; `notificationPreferences: NotificationPreferences`; persist v2 migration maps old `criticalAlertsEnabled` → new structure; `UserPreferencesSection` with profile edit modal |
| SET-014 | Settings page decomposition (monolith → orchestrator + sub-components) | ✅ | P1 | S | FEEDBACK | Done — 905-line `settings/page.tsx` replaced with 55-line orchestrator importing 7 sub-components from `src/components/settings/`; auto-save indicator retained in header |
| SET-015 | Date format preference with locale-aware rendering across all pages | ✅ | P2 | S | FEEDBACK | Done — `DateFormatPreference` type (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD); `formatDateWithPreference()` in `src/lib/date-format.ts` handles Arabic numerals; `useFormattedDate()` hook in `src/hooks/useFormattedDate.ts`; wired to correspondence feed, policies, and reports pages |

---

## Epic 15: RBAC & Permissions

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RBAC-001 | Three-tier role hierarchy (Officer, Manager, Admin) | ✅ | P0 | S | BRD | Done |
| RBAC-002 | Observation-specific permissions (leader, assignee, comment ownership) | ✅ | P0 | S | BRD | Done |
| RBAC-003 | Authority-scoped permissions (user assigned to specific authorities) | 💡 | P2 | A | REC | From onboarding — e.g., Sarah → SAMA, ZATCA only |
| RBAC-004 | Framework-scoped permissions (user assigned to specific frameworks) | 💡 | P2 | B | REC | E.g., Ahmed → NCA ECC, SAMA CSF only |
| RBAC-005 | SAFIU restricted-access (separate access layer for AML module) | 🗺️ | P3 | A | BRD | Only authorized AML personnel |

---

## Epic 16: Internationalization

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| I18N-001 | Full bilingual operation (EN/AR) | ✅ | P0 | S | BRD | Done |
| I18N-002 | RTL layout support | ✅ | P0 | S | BRD | Done |
| I18N-003 | Translation dictionaries (en.json, ar.json) | ✅ | P0 | S | BRD | Done |
| I18N-004 | Parameterized interpolation (`{{param}}`) | ✅ | P0 | S | BRD | Done |
| I18N-005 | Module-namespaced translation keys | ✅ | P0 | S | BRD | Done |
| I18N-006 | No hardcoded English in components | ✅ | P0 | S | BRD | Done |
| I18N-007 | Arabic translations for new onboarding screens | 💡 | P2 | S | REC | New authority/framework names in AR |
| I18N-008 | Arabic translations for framework control libraries | 💡 | P2 | B | REC | NCA ECC, PDPL etc. article names in AR |
| I18N-009 | Circular & Policy i18n keys (EN + AR) | ✅ | P1 | A | FEEDBACK | Done — authority labels, CAP status labels, applicability, autoReference, reviewAlert, phase labels (`phaseCAP`, `phaseCorrectiveActionPlan`, `phaseRemediation`, `currentPhase`), policy status/tier keys, `viewFullDetail`, and 80+ circular workflow keys added to both `en.json` and `ar.json` |

---

## Epic 17: ZATCA Compliance Tracker

> Specialized module — Pattern 2 (Portal-Based). No letter correspondence.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| ZAT-001 | Portal submission status tracker (per obligation type) | 🗺️ | P3 | A | BRD | Preparing → Submitted → Under Review → Accepted/Rejected |
| ZAT-002 | Fatoorah wave tracking (phase/wave compliance checklists) | 🗺️ | P3 | A | BRD | |
| ZAT-003 | Filing calendar (recurring deadlines per obligation) | 🗺️ | P3 | A | BRD | |
| ZAT-004 | API integration concept (Fatoorah status sync, pre-check) | 🗺️ | P3 | A | BRD | Spec only for now |
| ZAT-005 | Document management (tax worksheets, receipts, notifications) | 🗺️ | P3 | A | BRD | |

---

## Epic 18: SAFIU AML Case Management

> Specialized module — Pattern 3 (One-Way Reporting). Highly restricted access.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| AML-001 | Alert escalation workflow (alert → triage → escalate/close) | 🗺️ | P3 | A | BRD | Ingests from transaction monitoring systems |
| AML-002 | Investigation workflow (case creation, timeline, multi-analyst, decision point) | 🗺️ | P3 | A | BRD | File STR / Close / Escalate |
| AML-003 | "No-file" decision documentation with rationale retention | 🗺️ | P3 | A | BRD | Must be retained for audit |
| AML-004 | STR preparation workspace (goAML schema, draft→review→approve→submit) | 🗺️ | P3 | A | BRD | |
| AML-005 | QA checklist before submission | 🗺️ | P3 | A | BRD | |
| AML-006 | Confidential restricted-access log (separate access layer, all access logged) | 🗺️ | P3 | A | BRD | No cross-reference from other modules |
| AML-007 | goAML filing tracker (submitted, acknowledged, under review, closed) | 🗺️ | P3 | A | BRD | |
| AML-008 | 10-year retention archive (immutable, non-deletable after closure) | 🗺️ | P3 | A | BRD | |
| AML-009 | Archive search with advanced filtering | 🗺️ | P3 | A | BRD | |

---

## Epic 19: MISA License Management

> Lightweight module — Pattern 4 (Periodic License Management).

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| MISA-001 | License tracker with expiry dates and renewal windows | 🗺️ | P3 | A | BRD | |
| MISA-002 | Automated renewal reminders (90, 60, 30 days) | 🗺️ | P3 | A | BRD | |
| MISA-003 | Document management (certificates, permits, compliance evidence) | 🗺️ | P3 | A | BRD | |
| MISA-004 | Condition compliance tracker (Saudization ratios, operational requirements) | 🗺️ | P3 | A | BRD | |

---

## Epic 20: Internal Governance (Constant C)

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| GOV-001 | Internal Audit lifecycle (plan → fieldwork → reporting → observations → follow-up) | ✅ | P0 | C | BRD | Done via Audit Management |
| GOV-002 | Automated archiving for internal audits | 📋 | P1 | C | FEEDBACK | See AUD-012 |
| GOV-003 | Sharia Board review scheduling | 📋 | P2 | C | BRD | Per annual plan |
| GOV-004 | Sharia product review workflow | 📋 | P2 | C | BRD | |
| GOV-005 | Sharia transaction sampling and fatwa verification | 🗺️ | P3 | C | BRD | |
| GOV-006 | Annual Sharia compliance certification | 🗺️ | P3 | C | BRD | |
| GOV-007 | Advisory log (internal advisories per department) | ✅ | P2 | C | BRD | Done — `advisory-store.ts` (Zustand + persist, CRUD, note threads, reassignment), full advisory page with multi-filter, pagination, status/priority/business-unit filters, localized CSV export; new advisory form extended with editable "Requested By" field (pre-filled from auth user) and "Assigned To" team member dropdown; note refresh bug fixed using `useAdvisoryStore.getState()` instead of stale closure |
| GOV-008 | Internal weekly/monthly task tracker | 📋 | P2 | C | BRD | From Compliance_Processes.xlsx |
| GOV-009 | Link Internal Audit to both Archetype A observations and Archetype B assessments | 💡 | P1 | C | REC | Bridges correspondence and framework models |
| GOV-010 | Link Sharia to SAMA annual Sharia report + product approvals | 💡 | P2 | C | REC | |

---

## Epic 21: LaTeX PDF Generation System

> Universal export system — every page offers CSV or styled PDF via server-side LaTeX compilation. Design doc: `latex-pdf-generation-design.md`.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| PDF-001 | Backend LaTeX compilation service (Handlebars → .tex → pdflatex → PDF) | 📋 | P1 | S | REC | Node.js service with temp dir lifecycle, Docker-ready. See design doc §5.1 |
| PDF-002 | LaTeX input sanitization (escape special chars, block command injection) | 📋 | P1 | S | REC | Security-critical. `sanitizeForLatex()` + recursive `sanitizeData()`. See design doc §5.3 |
| PDF-003 | POST /api/export/pdf endpoint (template + data + meta + options) | 📋 | P1 | S | REC | Returns PDF binary. Auth middleware + audit logging. See design doc §5.2 |
| PDF-004 | Shared LaTeX preamble (base.tex — brand colors, page layout, severity/status badges) | 📋 | P1 | S | REC | ComplianceOS visual identity in LaTeX matching Tailwind design system |
| PDF-005 | Cover page component (cover.tex — title, org, author, date, classification) | 📋 | P1 | S | REC | Reusable across all templates |
| PDF-006 | Template: observation-list.tex (executive summary + severity chart + detail table) | 📋 | P1 | S | REC | pgfplots bar chart + longtable |
| PDF-007 | Template: compliance-report.tex (framework scores + trend chart + open observations) | 📋 | P1 | S | REC | Executive dashboard export |
| PDF-008 | Template: audit-report.tex (metadata + findings summary + detail + activity log) | 📋 | P1 | S | REC | |
| PDF-009 | Template: risk-register.tex (landscape, summary + longtable + 5×5 TikZ heat map) | 📋 | P1 | S | REC | Plots actual risks as dots on heat map |
| PDF-010 | Template: sama-letter.tex (formal letterhead format matching SAMA correspondence standards) | 📋 | P1 | A | REC | Letterhead, metadata, body paragraphs, attachments, signature block |
| PDF-011 | Template: generic-table.tex (fallback for any tabular data) | 📋 | P2 | S | REC | Dynamic column count/widths |
| PDF-012 | Frontend ExportModal component (shared CSV/PDF chooser) | 📋 | P1 | S | REC | Two-card UI, wired to every page with export |
| PDF-013 | Frontend export-service.ts (API client for PDF endpoint + blob download) | 📋 | P1 | S | REC | |
| PDF-014 | Wire ExportModal to all pages (observations, audits, reports, correspondence, risk register, calendar, team/training, dashboard) | 📋 | P2 | S | REC | 9 pages listed in design doc §3.3 |
| PDF-015 | Watermark support (DRAFT, CONFIDENTIAL) | 📋 | P2 | S | REC | `draftwatermark` package, conditional rendering |
| PDF-016 | Company logo upload and inclusion in templates | 📋 | P2 | S | REC | Base64 → logo.png in temp dir |
| PDF-017 | Arabic/RTL template variants (xelatex + polyglossia + Amiri font) | 📋 | P3 | S | REC | Swap pdflatex → xelatex, add `\begin{Arabic}` wrappers |
| PDF-018 | Template: correspondence-tracker.tex | 📋 | P2 | A | REC | |
| PDF-019 | Template: training-report.tex | 📋 | P2 | S | REC | |
| PDF-020 | Template: calendar-export.tex | 📋 | P2 | S | REC | |
| PDF-021 | Email delivery of generated reports (for scheduled reports) | 🗺️ | P3 | S | REC | |
| PDF-022 | Performance optimization (template caching, pre-compiled Handlebars) | 🗺️ | P3 | S | REC | |

---

## Epic 22: Smart Workload & Burnout Management System

> Cross-store capacity tracking that connects every ComplianceOS module (observations, audits, policies, correspondence, manual tasks) to each team member's workload, with escalating sensitivity the longer someone stays overloaded.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| WRK-001 | Cross-store workload aggregation per member (observations, audits, policies, correspondence, manual tasks) | ✅ | P1 | S | FEEDBACK | Done — `useWorkload(memberId, member, memberName)` hook in `src/hooks/useWorkload.ts`; queries observation-store, audit-store, policy-store, correspondence-store; open/active items only (excludes closed obs, completed audits, non-review policies, archived correspondence) |
| WRK-002 | Workload percentage calculation — base 10% per task, reduced to 5% for tasks >= 75% progress | ✅ | P1 | S | FEEDBACK | Done — `base = total * ratePerAssignment`; discount of 5% per manual assignment that has `progress >= 75`; result clamped 0–100 |
| WRK-003 | Escalating workload rate based on burnout duration | ✅ | P1 | S | FEEDBACK | Done — `ratePerAssignment` escalates from 10% (default) → 20% (overloaded 3+ days) → 30% (overloaded 7+ days) based on `member.burnoutSince` ISO timestamp; makes burnout detection increasingly sensitive the longer someone is overloaded |
| WRK-004 | `burnoutSince` timestamp tracking on TeamMember | ✅ | P1 | S | FEEDBACK | Done — `TeamMember.burnoutSince?: string` field in `src/types/index.ts`; `updateBurnoutTimestamps()` store action sets/clears the field when a member crosses the 75% threshold; called by `useBurnoutDetection` hook |
| WRK-005 | Burnout detection hook with escalation tier classification | ✅ | P1 | S | FEEDBACK | Done — `useBurnoutDetection` in `src/hooks/useWorkload.ts`; tiers: mild (>75%), moderate (>75% for 3+ days), severe (>75% for 7+ days); returns `{ member, workload, tier, daysSince }[]` for all overloaded members |
| WRK-006 | BurnoutDetectionCard UI — overloaded members with escalation tier badges | ✅ | P1 | S | FEEDBACK | Done — `src/components/team/directory/burnout-detection-card.tsx`; shows all overloaded members with tier badge and days-overloaded count; "Suggest Reassignment" expands to show full cross-store item list with color-coded type badges (observation=rose, audit=amber, policy=blue, correspondence=violet, task=slate); clicking an item reveals 3 lowest-workload reassignment targets |
| WRK-007 | WorkloadResult `items[]` — individual typed cross-store items | ✅ | P1 | S | FEEDBACK | Done — `WorkloadItem { type, id, title }` interface; `useWorkload` returns `items: WorkloadItem[]`; used by burnout card and member detail drawer to render per-item cards |
| WRK-008 | Member detail drawer — full item list with type badges and unassign/reassign actions | ✅ | P1 | S | FEEDBACK | Done — `src/components/team/directory/member-detail-drawer.tsx`; renders individual item cards with type badges; manual task assignments have unassign button + "Clear All"; staged permissions pattern (changes only apply on "Update Permissions" click) |
| WRK-009 | `useTeamWorkloads` bulk hook (all members in one useMemo) | ✅ | P1 | S | FEEDBACK | Done — `useTeamWorkloads(members[])` computes all members' workloads in a single `useMemo`; used by BurnoutDetectionCard and PendingApprovalsCard for ranking by workload |
| WRK-010 | Unassign / Reassign task store actions | ✅ | P1 | S | FEEDBACK | Done — `unassignTask(memberId, taskTitle)` and `reassignTask(fromId, toId, taskTitle)` actions in `team-store.ts`; drawer wires "Unassign" per item and reassign targets |
| WRK-011 | Capacity bar in directory table with tooltip breakdown | ✅ | P1 | S | FEEDBACK | Done — `WorkloadBar` component in directory page renders a 128px bar with percentage; color: green (<75%) / amber (>=75%); tooltip shows `obs N, audits N, policies N` breakdown |
| WRK-012 | Manual task progress field for discount calculation | 📋 | P2 | S | FEEDBACK | `TeamMember.assignments[].progress` exists on type but is not yet surfaced in the UI for editing; currently used only for the 75%-discount calculation |
| WRK-013 | Real-time workload recalculation on store changes | 📋 | P2 | S | FEEDBACK | `useWorkload` already subscribes to all four stores via Zustand selectors; any store mutation auto-triggers re-render; no polling needed |
| WRK-014 | Workload widget on compliance feed / dashboard | 📋 | P2 | S | REC | Surface top-3 overloaded members on the correspondence feed page capacity card |
| WRK-015 | Reassignment audit trail (log when task is reassigned, who approved) | 📋 | P2 | S | REC | Append to `user-log-store` when `reassignTask` is called; requires `actingUser` from auth store |
| WRK-016 | Configurable capacity threshold (default 75%, admin-adjustable) | 📋 | P3 | S | REC | Move threshold from hardcoded to `compliance-settings-store`; affects burnout detection, workload bar color, and escalation trigger |
| WRK-017 | Configurable escalation schedule (3-day / 7-day thresholds admin-adjustable) | 📋 | P3 | S | REC | Currently hardcoded in `useWorkload.ts`; expose in Settings → Team Configuration |

---

## Summary Dashboard

> **Settings Page Overhaul Sprint complete (Mar 13 2026)** — Settings page decomposed into 7 sub-components; 5 new Zustand stores (framework-config, user-preferences, audit-template, policy-template, department); granular notification preferences; per-framework weight sliders + dept multi-select; policy templates management UI; date format preference wired across the app. SET-001 through SET-006 + SET-011 through SET-015 all complete.

### By Status

| Status | Count | % |
|---|---|---|
| ✅ Done | 141 | 50% |
| 🔧 In Progress (UI built, logic pending) | 6 | 2% |
| 📋 To Do (defined, not started) | 65 | 23% |
| 💡 New Recommendation | 24 | 9% |
| 🗺️ Roadmap (future phase) | 18 | 6% |
| **Total** | **254** | **100%** |

### By Priority

| Priority | Count | Description |
|---|---|---|
| P0 — Critical | 31 | Blocks launch. Stores, engine integration, core workflows |
| P1 — High | 97 | Needed for launch. Onboarding, framework layer, correspondence logic, PDF export, workload |
| P2 — Medium | 64 | Post-launch. Multi-authority, advanced features, Sharia workflows |
| P3 — Low | 36 | Future phase. ZATCA, SAFIU, MISA, advanced versioning, Arabic PDF |

### By Archetype

| Archetype | Count | Description |
|---|---|---|
| A — Correspondence | 49 | Authority communication, letters, circulars, submissions |
| B — Framework | 35 | Framework metadata, tagging, versioning, assessments |
| C — Internal Governance | 10 | Internal audit, Sharia compliance |
| S — Shared/Platform | 117 | Core modules, engine, calendar, settings, RBAC, i18n, PDF export, workload |

### Critical Path (P0 items)

These 31 items must be completed before launch:

1. **Stores:** ~~Risk Store (RSK-001)~~ ✅, ~~Policy Store (POL-002)~~ ✅, ~~Training Store (TRN-004)~~ ✅, Framework Store (FRM-018)
2. **Engine Integration:** Risk Posture (RSK-009), ~~Policy Currency (POL-009)~~ ✅, Training Completion (TRN-013)
3. **Live Data:** ~~Replace hardcoded risk data (RPT-012)~~ ✅
4. **Correspondence:** ~~Letter approval chain (COR-005, COR-006)~~ ✅, ~~Reference numbering (COR-009)~~ ✅
5. **Rules & Circulars:** Registration logic (RUL-001), applicability (RUL-002), CAP creation (RUL-003), Business Owner assignment (RUL-004)
6. **Onboarding:** Org profile (ONB-001), entity type (ONB-002), authority selection (ONB-003), framework selection (ONB-006), pre-selection logic (ONB-004, ONB-007), Constant C (ONB-008), entity map data (ONB-012)

---

*This backlog is a living document. Update status as features are implemented. Add new items as requirements emerge. Review priorities quarterly.*

