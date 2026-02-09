# ComplianceOS — Product Backlog

**Version:** 1.0
**Date:** February 2026
**Last Updated:** February 9, 2026

---

## How to Read This Backlog

- **Status:** `✅ Done` | `🔧 In Progress` | `📋 To Do` | `🗺️ Roadmap` | `💡 New Recommendation`
- **Priority:** `P0` (Critical — blocks launch) | `P1` (High — needed for launch) | `P2` (Medium — post-launch) | `P3` (Low — future phase)
- **Source:** `BRD` (from Business Requirements Doc) | `REC` (from architecture/strategy sessions) | `FEEDBACK` (from compliance team)
- **Arch:** `A` (Correspondence) | `B` (Framework) | `C` (Internal Governance) | `S` (Shared/Platform)

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

## Epic 2: Observation Tracker

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
| OBS-017 | Framework principle tagging on observations | 📋 | P1 | B | BRD | `frameworkTags[]` metadata field. See Epic 11 |
| OBS-018 | Expand source types to include CMA, IA observations | 💡 | P2 | A | REC | When onboarding adds CMA/IA authorities |

---

## Epic 3: Correspondence Hub (Letters)

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| COR-001 | SAMA letter creation (type: Non-Objection, Inquiry, Submission, Notification) | 🔧 | P0 | A | BRD | UI built, business logic not wired |
| COR-002 | Sub-category selection (Key Function Appointment, Product Launch, etc.) | 🔧 | P0 | A | BRD | UI built |
| COR-003 | Target SAMA department selection | 🔧 | P0 | A | BRD | UI built |
| COR-004 | Template databank with usage tracking, duplication, custom creation | 🔧 | P1 | A | BRD | UI built, template data placeholder |
| COR-005 | Approval routing (Draft → Send for Approval → Approved → Sent → Response Received) | 📋 | P0 | A | BRD | Workflow not enforced in logic |
| COR-006 | Writer → Reviewer (Dept Head) → CEO approval chain | 📋 | P0 | A | BRD | Three-step approval with timestamp + revision notes |
| COR-007 | Attachment management per letter | 🔧 | P1 | A | BRD | UI built |
| COR-008 | Activity timeline per letter | 🔧 | P1 | A | BRD | UI built |
| COR-009 | Reference number auto-generation | 📋 | P0 | A | BRD | Manual currently |
| COR-010 | Response deadline tracking with overdue alerts | 📋 | P1 | A | BRD | |
| COR-011 | Thread management (original → response → follow-up linked) | 📋 | P1 | A | BRD | |
| COR-012 | Email automation (Outlook popup with PDF letter + attachments) | 📋 | P2 | A | BRD | |
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

---

## Epic 4: Rules & Circulars

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
| RUL-014 | Convert non-compliance items to observations | 📋 | P2 | A | BRD | Link to Observation Tracker |
| RUL-015 | Multi-authority circular support (SAMA, CMA, IA circulars) | 💡 | P2 | A | REC | Filter by authority |

---

## Epic 5: Policies & Procedures

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| POL-001 | Policy registry (name, version, status, category, owner, dates) | 🔧 | P1 | S | BRD | UI built, no store |
| POL-002 | Policy store (Zustand with persistence) | 📋 | P0 | S | BRD | Required for compliance engine |
| POL-003 | Automated review notifications (90 days before next review) | 📋 | P1 | S | BRD | |
| POL-004 | Tiered approval workflows (Board / Management+Sharia / AGM) | 📋 | P1 | S | BRD | Three distinct chains |
| POL-005 | Version history with changelog | 🔧 | P1 | S | BRD | UI built |
| POL-006 | Audit trail (creation, edits, approvals, rejections, publication) | 📋 | P1 | S | BRD | |
| POL-007 | Document management (PDF, DOC uploads per policy) | 📋 | P1 | S | BRD | |
| POL-008 | Status dashboard (total, by status, upcoming/overdue reviews) | 🔧 | P1 | S | BRD | UI built, needs live data |
| POL-009 | Compliance engine integration (Policy Currency = 15% weight) | 📋 | P0 | S | BRD | Currently returns 0 |
| POL-010 | Framework principle tagging on policies | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 11 |

---

## Epic 6: Audit Management

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| AUD-001 | Multi-type support (Internal Audit, SAMA Inspection, Sharia Audit) | ✅ | P0 | S | BRD | Done |
| AUD-002 | Terminology compliance ("SAMA Inspection" not "audit") | ✅ | P0 | A | BRD | Done |
| AUD-003 | Lifecycle management (Pending → In Progress → Completed + Overdue) | ✅ | P0 | S | BRD | Done |
| AUD-004 | Priority, category, frequency classification | ✅ | P0 | S | BRD | Done |
| AUD-005 | Team management with lead auditor designation | ✅ | P0 | S | BRD | Done |
| AUD-006 | Document management (working papers) | ✅ | P0 | S | BRD | Done |
| AUD-007 | Comment system (threaded, with edit/delete permissions) | ✅ | P0 | S | BRD | Done |
| AUD-008 | Progress tracking with overdue detection | ✅ | P0 | S | BRD | Done |
| AUD-009 | Late completion tracking (closedOverdue, completedAt) | ✅ | P0 | S | BRD | Done |
| AUD-010 | Audit log (activity logs, filterable) | ✅ | P0 | S | BRD | Done |
| AUD-011 | Compliance engine integration (Audit Completion = 25% weight) | ✅ | P0 | S | BRD | Done |
| AUD-012 | Automated archiving for completed internal audits | 📋 | P1 | C | FEEDBACK | Configurable retention period, archive view |
| AUD-013 | Recurring scheduling (auto-create next instance on completion) | 📋 | P1 | S | FEEDBACK | E.g., complete Q1 → auto-create Q2 |
| AUD-014 | Framework principle tagging on audits | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 11 |
| AUD-015 | Expand audit types to include CMA Inspection, IA Inspection | 💡 | P2 | A | REC | When onboarding adds CMA/IA |

---

## Epic 7: Reports & Analytics

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
| RPT-012 | Replace hardcoded risk data in Risks tab with Risk Store | 📋 | P0 | S | BRD | Blocked by RSK-001 |
| RPT-013 | Replace hardcoded executive view details with live data | 📋 | P1 | S | BRD | |
| RPT-014 | Framework-aligned reporting (per-framework coverage %) | 📋 | P1 | B | BRD | See Epic 11. Show coverage per control |
| RPT-015 | Control-level drill-down (all tagged entities per control) | 📋 | P2 | B | BRD | |
| RPT-016 | Gap analysis report (controls with no associated records) | 📋 | P2 | B | BRD | |

---

## Epic 8: Calendar

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

## Epic 9: Risk Register

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RSK-001 | Risk store (Zustand with persistence) | 📋 | P0 | S | BRD | Required for compliance engine |
| RSK-002 | 5×5 risk matrix (likelihood × impact) | 🔧 | P1 | S | BRD | UI built, needs live data |
| RSK-003 | Risk categories (Operational, Financial, Compliance, Strategic, Reputational) | 🔧 | P1 | S | BRD | UI built |
| RSK-004 | Status lifecycle (Open → Mitigating → Accepted → Closed) | 🔧 | P1 | S | BRD | UI built |
| RSK-005 | Mitigation tracking (plan + percentage progress) | 🔧 | P1 | S | BRD | UI built |
| RSK-006 | Risk owner assignment | 🔧 | P1 | S | BRD | UI built |
| RSK-007 | Monitoring frequency with review date tracking | 🔧 | P1 | S | BRD | UI built |
| RSK-008 | Audit trail (status, score, mitigation, review, assignment changes) | 📋 | P1 | S | BRD | |
| RSK-009 | Compliance engine integration (Risk Posture = 20% weight) | 📋 | P0 | S | BRD | Currently returns 0 |
| RSK-010 | Dashboard widget integration | 📋 | P1 | S | BRD | |
| RSK-011 | Framework principle tagging on risks | 📋 | P1 | B | BRD | `frameworkTags[]` field. See Epic 11 |

---

## Epic 10: Team & Training

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| TRN-001 | Active Directory (team listing, detail view, stats) | ✅ | P0 | S | BRD | Done |
| TRN-002 | User Logs (activity log, filterable, exportable) | ✅ | P0 | S | BRD | Done |
| TRN-003 | Invite new member workflow with role assignment | ✅ | P0 | S | BRD | Done |
| TRN-004 | Training store (Zustand with persistence) | 📋 | P0 | S | BRD | Required for compliance engine |
| TRN-005 | Overall training dashboard (completion rates, assigned, overdue) | 🔧 | P1 | S | BRD | UI built, needs live data |
| TRN-006 | Department-level progress tracking | 🔧 | P1 | S | BRD | UI built |
| TRN-007 | Saudization metrics (Saudi vs Non-Saudi, actual/target/gap) | 🔧 | P1 | S | BRD | UI built |
| TRN-008 | Employee training records (per-employee view) | 🔧 | P1 | S | BRD | UI built |
| TRN-009 | Course management (add, set deadlines, assign, remove) | 🔧 | P1 | S | BRD | UI built |
| TRN-010 | Course categories (Compliance, AML, Cybersecurity, Sharia, Risk) | 🔧 | P1 | S | BRD | UI built |
| TRN-011 | Bulk assignment of courses | 📋 | P2 | S | BRD | |
| TRN-012 | Training report export | 📋 | P2 | S | BRD | |
| TRN-013 | Compliance engine integration (Training Completion = 15% weight) | 📋 | P0 | S | BRD | Currently returns 0 |
| TRN-014 | Saudization data integration with MISA requirements | 💡 | P3 | A | BRD | Pattern 4 linkage |

---

## Epic 11: Framework Metadata Layer

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

## Epic 12: Framework Versioning & Migration

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

## Epic 13: Settings & Configuration

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| SET-001 | Framework listing with enable/disable per framework | 🔧 | P1 | B | BRD | UI built, placeholder data |
| SET-002 | Per-framework settings (sync frequency, compliance threshold, alerts) | 🔧 | P2 | B | BRD | UI built |
| SET-003 | Add custom framework (name, type, description, auto-sync) | 🔧 | P2 | B | BRD | UI built |
| SET-004 | Notification settings (email digests, critical alerts, Slack) | 🔧 | P2 | S | BRD | UI built, delivery not implemented |
| SET-005 | Integration marketplace (Slack, Teams, Drive, SharePoint, Jira, etc.) | 🔧 | P3 | S | BRD | UI built, all placeholder |
| SET-006 | Audit templates (listing, creation, usage tracking) | 🔧 | P2 | S | BRD | UI built |
| SET-007 | Compliance weight configuration (bounds enforcement, sum=100%) | ✅ | P0 | S | BRD | Done |
| SET-008 | Target score configuration | ✅ | P0 | S | BRD | Done |
| SET-009 | Notification delivery system (backend) | 📋 | P2 | S | BRD | Currently UI only |
| SET-010 | Integration API connections (backend) | 🗺️ | P3 | S | BRD | Currently all placeholder |

---

## Epic 14: RBAC & Permissions

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| RBAC-001 | Three-tier role hierarchy (Officer, Manager, Admin) | ✅ | P0 | S | BRD | Done |
| RBAC-002 | Observation-specific permissions (leader, assignee, comment ownership) | ✅ | P0 | S | BRD | Done |
| RBAC-003 | Authority-scoped permissions (user assigned to specific authorities) | 💡 | P2 | A | REC | From onboarding — e.g., Sarah → SAMA, ZATCA only |
| RBAC-004 | Framework-scoped permissions (user assigned to specific frameworks) | 💡 | P2 | B | REC | E.g., Ahmed → NCA ECC, SAMA CSF only |
| RBAC-005 | SAFIU restricted-access (separate access layer for AML module) | 🗺️ | P3 | A | BRD | Only authorized AML personnel |

---

## Epic 15: Internationalization

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

---

## Epic 16: ZATCA Compliance Tracker

> Specialized module — Pattern 2 (Portal-Based). No letter correspondence.

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| ZAT-001 | Portal submission status tracker (per obligation type) | 🗺️ | P3 | A | BRD | Preparing → Submitted → Under Review → Accepted/Rejected |
| ZAT-002 | Fatoorah wave tracking (phase/wave compliance checklists) | 🗺️ | P3 | A | BRD | |
| ZAT-003 | Filing calendar (recurring deadlines per obligation) | 🗺️ | P3 | A | BRD | |
| ZAT-004 | API integration concept (Fatoorah status sync, pre-check) | 🗺️ | P3 | A | BRD | Spec only for now |
| ZAT-005 | Document management (tax worksheets, receipts, notifications) | 🗺️ | P3 | A | BRD | |

---

## Epic 17: SAFIU AML Case Management

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

## Epic 18: MISA License Management

> Lightweight module — Pattern 4 (Periodic License Management).

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| MISA-001 | License tracker with expiry dates and renewal windows | 🗺️ | P3 | A | BRD | |
| MISA-002 | Automated renewal reminders (90, 60, 30 days) | 🗺️ | P3 | A | BRD | |
| MISA-003 | Document management (certificates, permits, compliance evidence) | 🗺️ | P3 | A | BRD | |
| MISA-004 | Condition compliance tracker (Saudization ratios, operational requirements) | 🗺️ | P3 | A | BRD | |

---

## Epic 19: Internal Governance (Constant C)

| ID | Feature | Status | Priority | Arch | Source | Notes |
|---|---|---|---|---|---|---|
| GOV-001 | Internal Audit lifecycle (plan → fieldwork → reporting → observations → follow-up) | ✅ | P0 | C | BRD | Done via Audit Management |
| GOV-002 | Automated archiving for internal audits | 📋 | P1 | C | FEEDBACK | See AUD-012 |
| GOV-003 | Sharia Board review scheduling | 📋 | P2 | C | BRD | Per annual plan |
| GOV-004 | Sharia product review workflow | 📋 | P2 | C | BRD | |
| GOV-005 | Sharia transaction sampling and fatwa verification | 🗺️ | P3 | C | BRD | |
| GOV-006 | Annual Sharia compliance certification | 🗺️ | P3 | C | BRD | |
| GOV-007 | Advisory log (internal advisories per department) | 📋 | P2 | C | BRD | Marketing materials, product approvals |
| GOV-008 | Internal weekly/monthly task tracker | 📋 | P2 | C | BRD | From Compliance_Processes.xlsx |
| GOV-009 | Link Internal Audit to both Archetype A observations and Archetype B assessments | 💡 | P1 | C | REC | Bridges correspondence and framework models |
| GOV-010 | Link Sharia to SAMA annual Sharia report + product approvals | 💡 | P2 | C | REC | |

---

## Summary Dashboard

### By Status

| Status | Count | % |
|---|---|---|
| ✅ Done | 47 | 28% |
| 🔧 In Progress (UI built, logic pending) | 32 | 19% |
| 📋 To Do (defined, not started) | 50 | 30% |
| 💡 New Recommendation | 24 | 14% |
| 🗺️ Roadmap (future phase) | 16 | 9% |
| **Total** | **169** | **100%** |

### By Priority

| Priority | Count | Description |
|---|---|---|
| P0 — Critical | 30 | Blocks launch. Stores, engine integration, core workflows |
| P1 — High | 62 | Needed for launch. Onboarding, framework layer, correspondence logic |
| P2 — Medium | 47 | Post-launch. Multi-authority, advanced features, Sharia workflows |
| P3 — Low | 30 | Future phase. ZATCA, SAFIU, MISA, advanced versioning |

### By Archetype

| Archetype | Count | Description |
|---|---|---|
| A — Correspondence | 47 | Authority communication, letters, circulars, submissions |
| B — Framework | 35 | Framework metadata, tagging, versioning, assessments |
| C — Internal Governance | 10 | Internal audit, Sharia compliance |
| S — Shared/Platform | 77 | Core modules, engine, calendar, settings, RBAC, i18n |

### Critical Path (P0 items)

These 30 items must be completed before launch:

1. **Stores:** Risk Store (RSK-001), Policy Store (POL-002), Training Store (TRN-004), Framework Store (FRM-018)
2. **Engine Integration:** Risk Posture (RSK-009), Policy Currency (POL-009), Training Completion (TRN-013)
3. **Live Data:** Replace hardcoded risk data (RPT-012)
4. **Correspondence:** Letter approval chain (COR-005, COR-006), reference numbering (COR-009)
5. **Rules & Circulars:** Registration logic (RUL-001), applicability (RUL-002), CAP creation (RUL-003), Business Owner assignment (RUL-004)
6. **Onboarding:** Org profile (ONB-001), entity type (ONB-002), authority selection (ONB-003), framework selection (ONB-006), pre-selection logic (ONB-004, ONB-007), Constant C (ONB-008), entity map data (ONB-012)

---

*This backlog is a living document. Update status as features are implemented. Add new items as requirements emerge. Review priorities quarterly.*
