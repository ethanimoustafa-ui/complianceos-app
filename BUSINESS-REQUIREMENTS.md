# ComplianceOS — Business Requirements Document

**Version:** 1.0
**Date:** February 2026
**Classification:** Internal — Product Strategy
**Status:** Living Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Architecture Overview](#2-platform-architecture-overview)
3. [Regulatory Authority Patterns](#3-regulatory-authority-patterns)
4. [Module Requirements](#4-module-requirements)
5. [Framework Metadata Layer (Phase 1 MVP)](#5-framework-metadata-layer-phase-1-mvp)
6. [Product Roadmap — Specialized Modules](#6-product-roadmap--specialized-modules)
7. [Current Implementation Status](#7-current-implementation-status)

---

## 1. Executive Summary

### Product Vision

ComplianceOS is a unified Governance, Risk, and Compliance (GRC) platform purpose-built for Saudi Arabia's regulated industries. The platform consolidates compliance operations — from regulatory correspondence and audit management to risk monitoring and policy governance — into a single, scalable SaaS product.

The Saudi regulatory landscape is uniquely complex. Organizations must navigate overlapping obligations from multiple authorities (SAMA, CMA, NCA, SDAIA, ZATCA, MISA, SAFIU), each with distinct communication models, submission formats, and enforcement mechanisms. Today, most compliance teams manage these obligations through email threads, shared folders, spreadsheets, and manual tracking — a fragmented approach that introduces risk, consumes resources, and makes regulatory reporting an exercise in archaeology rather than analysis.

ComplianceOS eliminates this fragmentation by providing a platform that understands the Saudi regulatory ecosystem natively.

### Two Product Archetypes Under One Roof

ComplianceOS serves two distinct but interconnected compliance archetypes:

1. **Correspondence-Based Compliance** — Managing bidirectional communications with regulatory authorities (SAMA, CMA, Insurance Authority, MISA) through structured letter workflows, circular tracking, and submission management.

2. **Framework-Based Compliance** — Demonstrating adherence to prescriptive control frameworks (NCA ECC/CSCC/CCC, SDAIA PDPL, SAMA CSF, ISO 27001, COSO) through evidence collection, principle tagging, and gap analysis. In simple words, adding small lables throughout all audits, tasks, regulatory policies and rules with it's corresponding framework naming convention.

Most Saudi regulated entities operate in both models simultaneously. A bank, for example, manages SAMA correspondence (Pattern 1) while also demonstrating NCA ECC compliance (Framework model). ComplianceOS is the first platform to unify these models within a single product, using shared data (observations, audits, policies, risks) as the connective tissue between them.

### Current State

The application is approximately **40% complete** in terms of business logic:

- **Fully functional:** Observation Tracker, Audit Management, Compliance Engine
- **Mostly functional:** Reports & Analytics (compliance engine wired, some hardcoded data remains)
- **Partially built:** Team & Training (UI built, training tab functional), Risk Register (UI built, no persistent store), Calendar (UI built, store functional)
- **Placeholder:** Correspondence Hub, Rules & Circulars, Policies & Procedures, Settings & Frameworks
- **Not started:** ZATCA Compliance Tracker, SAFIU AML Case Management

This document captures the complete business requirements for all modules, both built and unbuilt, to serve as the definitive product specification.

---

## 2. Platform Architecture Overview

### Regulatory Model Mapping

ComplianceOS organizes the Saudi regulatory landscape into four communication patterns and one internal governance model. Every module in the platform maps to one or more of these patterns.

#### Pattern 1: Full Correspondence + Regulatory Oversight

**Authorities:** SAMA (Saudi Central Bank), CMA (Capital Market Authority), IA (Insurance Authority)

These authorities maintain active, bidirectional correspondence with regulated entities. Communication is formal (official letters), tracked by reference number, and subject to response deadlines. Inspections (on-site and remote) generate observations that require structured remediation.

**Modules required:** Correspondence Hub, Observation Tracker, Audit Management, Rules & Circulars, Reports & Analytics, Calendar

#### Pattern 2: Portal-Based Structured Submissions

**Authority:** ZATCA (Zakat, Tax and Customs Authority) — *Roadmap*

ZATCA operates through its own digital portals (Fatoorah, e-invoicing). Compliance interaction is primarily submission-based with defined filing windows. No bidirectional letter correspondence; instead, status tracking of structured data submissions. Refer to ([Fatoora SaaS Startup](http://fatooraonline.com/)), they have built a specific system only for ZATCA compliance.

**Modules required:** ZATCA Compliance Tracker (specialized), Calendar, Reports & Analytics

#### Pattern 3: One-Way Reporting via External Platform

**Authority:** SAFIU (Saudi Arabia Financial Intelligence Unit) — *Roadmap*

SAFIU requires one-way confidential reporting through the goAML platform. Communication is strictly outbound (Suspicious Transaction Reports), access must be restricted, and records must be retained for a minimum of 10 years.

**Modules required:** SAFIU AML Case Management (specialized), Audit Management (internal investigations), Reports & Analytics

#### Pattern 4: Periodic License Management

**Authority:** MISA (Ministry of Investment Saudi Arabia)

MISA interaction is periodic and document-centric — license renewals, permit updates, and compliance certificate submissions. No ongoing correspondence; primarily calendar-driven deadline management.

**Modules required:** Calendar, Settings (license document storage), Reports & Analytics

#### Internal Governance

**Functions:** Internal Audit, Sharia Board

Internal governance feeds into both the correspondence model (internal audit findings may surface during SAMA inspections) and the framework model (internal audits validate framework control implementation). The Sharia Board operates as an independent review body with its own audit cycle and observation pipeline.

**Modules required:** Audit Management, Observation Tracker, Reports & Analytics, Policies & Procedures

### Visual Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ComplianceOS Platform                        │
├──────────────────────────────┬──────────────────────────────────────┤
│  CORRESPONDENCE MODEL        │  FRAMEWORK MODEL                     │
│                              │                                      │
│  ┌─────────────────────┐     │  ┌──────────────────────────────┐    │
│  │ Correspondence Hub  │     │  │ Framework Metadata Layer     │    │
│  │ (Letters, Circulars)│     │  │ (Principle Tagging, Controls)│    │
│  └─────────┬───────────┘     │  └──────────────┬───────────────┘    │
│            │                 │                │                     │
│  ┌─────────▼───────────┐     │  ┌──────────────▼───────────────┐    │
│  │ SAMA / CMA / IA     │     │  │ NCA ECC / CSCC / CCC         │    │
│  │ Circular Tracker    │     │  │ SDAIA PDPL / SAMA CSF        │    │
│  └─────────────────────┘     │  │ CSTC / ISO 27001 / COSO      │    │
│                              │  └──────────────────────────────┘    │
├──────────────────────────────┴──────────────────────────────────────┤
│                      SHARED DATA LAYER                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ ┌────────────┐    │
│  │  Audits  │ │Observa-  │ │ Policies │ │ Risks │ │ Training   │    │
│  │          │ │tions     │ │          │ │       │ │            │    │
│  └──────────┘ └──────────┘ └──────────┘ └───────┘ └────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│  REPORTING & ANALYTICS │ CALENDAR │ TEAM MGMT │ SETTINGS            │
├─────────────────────────────────────────────────────────────────────┤
│  ROADMAP MODULES                                                    │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐      │
│  │ ZATCA Tracker        │  │ SAFIU AML Case Management       │      │
│  │ (Pattern 2)          │  │ (Pattern 3)                     │      │
│  └──────────────────────┘  └─────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Regulatory Authority Patterns

### Pattern 1: Full Correspondence + Regulatory Oversight

**Authorities:** SAMA, CMA, Insurance Authority

#### General Workflow

All Pattern 1 authorities share a common communication lifecycle:

1. **Inbound correspondence** — Authority issues circular, directive, or inspection notice
2. **Internal assessment** — Compliance team evaluates applicability and impact
3. **Response preparation** — Writer drafts response → Reviewer (Department Head) reviews → CEO signs
4. **Outbound submission** — Formal letter dispatched with attachments and evidence
5. **Follow-up tracking** — Response deadline monitoring, authority acknowledgment, and archival

**Inspections** (on-site or remote) generate observations that flow into the Observation Tracker. Each observation requires a remediation plan, evidence collection from the responsible department, and formal closure verification.

#### SAMA-Specific Variations

SAMA is the primary regulatory authority for banking and financial institutions. Key distinctions:

- **Terminology:** External regulatory reviews are called "SAMA Inspections," not "audits." The term "audit" is reserved for internal processes.
- **Letter types:** Non-Objection requests (hiring request, notice of resignation, product launches, equity participation), Inquiry (circular clarification), Submission (periodic reports), Notification (incidents, outages, structural changes)
- **Circular workflow:** SAMA issues circulars requiring implementation by a deadline. Each circular triggers a Corrective Action Plan (CAP) assessment, departmental assignment, and evidence-based completion tracking.
- **Target departments within SAMA:** Banking Supervision, Payment Systems, Compliance & AML — correspondence must be addressed to the correct department.

#### CMA-Specific Variations (Capital Market Authority)

CMA regulates capital markets and listed entities. Additional correspondence types beyond the general workflow:

- **Prospectus review cycle** — Multi-round submission and revision workflow for securities offerings
- **Disclosure filings** — Material event notifications, periodic financial disclosures, and ad-hoc announcements
- **License lifecycle** — Market participant licensing, renewal, and condition compliance
- **Enforcement proceedings** — Formal response to CMA inquiries, hearing preparation, and penalty correspondence

#### Insurance Authority-Specific Variations

The Insurance Authority oversees insurance and reinsurance companies. Additional correspondence types:

- **Actuarial submissions** — Periodic submission of actuarial reports and reserve adequacy assessments
- **Solvency filings** — Capital adequacy and solvency margin reports
- **Product approval** — New insurance product submission, pricing review, and terms approval workflow

### Pattern 2: Portal-Based Structured Submissions — ZATCA

**Status:** Roadmap

ZATCA (Zakat, Tax and Customs Authority) operates through dedicated digital portals rather than traditional correspondence. Organizations interact with ZATCA primarily through:

- **Fatoorah (e-invoicing):** Phased implementation waves requiring technical integration and ongoing compliance monitoring
- **Tax filings:** VAT returns, withholding tax submissions, and zakat declarations on defined schedules
- **Customs declarations:** Import/export documentation through FASAH platform

ComplianceOS's role is to track submission status, manage filing deadlines, and maintain an audit trail of all ZATCA-related compliance activities. The platform does not replace ZATCA's portals; it provides a compliance overlay for internal tracking and reporting.

**Requirements:**
- Compliance status tracker per ZATCA obligation type
- Filing calendar with recurring deadlines per submission type
- Integration concept for Fatoorah status monitoring
- Document management for ZATCA-related evidence and correspondence

### Pattern 3: One-Way Reporting via External Platform — SAFIU

**Status:** Roadmap

SAFIU (Saudi Arabia Financial Intelligence Unit) requires confidential, one-way reporting of suspicious activities through the goAML platform. This pattern is unique in several ways:

- **Confidentiality:** Access must be restricted to authorized AML personnel only. SAFIU reports are not visible to general compliance staff.
- **One-way communication:** Reports are filed outbound; SAFIU does not respond through the platform.
- **Retention:** All AML records, including investigations that did not result in a filing, must be retained for a minimum of 10 years.
- **Sensitivity:** The existence of a Suspicious Transaction Report (STR) filing must not be disclosed to the subject of the report.

**Requirements:**
- Alert escalation workflow (transaction monitoring → case creation → investigation → filing decision)
- STR preparation workspace with structured data entry matching goAML schema
- Confidential restricted-access log with role-based visibility controls
- goAML filing tracker (submitted, acknowledged, status)
- 10-year retention archive with immutable audit trail
- Investigation workflow supporting "no-file" decisions with documented rationale
Refer to ([Fatoora Online Startup](https://fatooraonline.com/))

### Pattern 4: Periodic License Management — MISA

**Authority:** MISA (Ministry of Investment Saudi Arabia)

MISA interaction is periodic and document-driven. Organizations must maintain valid investment licenses and comply with MISA's regulatory conditions.

**Requirements:**
- License tracker with expiry dates and renewal windows
- Automated renewal reminders (90, 60, 30 days before expiry)
- Document management for license certificates, permits, and compliance evidence
- Condition compliance tracker (Saudization ratios, operational requirements)

### Internal Governance

#### Internal Audit Lifecycle

Internal audit operates as an independent assurance function with its own audit cycle:

1. **Audit planning** — Annual audit plan creation, risk-based audit selection
2. **Fieldwork** — Evidence collection, testing, and documentation
3. **Reporting** — Draft report → Management response → Final report
4. **Observation creation** — Audit findings flow into the Observation Tracker as source "Internal Audit"
5. **Follow-up** — Periodic follow-up on open observations until closure
6. **Archiving** — Automated archiving of completed internal audits

Key requirement from compliance team: **Automated archiving for internal audits** — completed audits should be automatically archived after a configurable retention period, maintaining full audit trail accessibility while decluttering the active view.

#### Sharia Board Review Workflow

The Sharia Board operates as an independent review body providing assurance on Sharia compliance:

1. **Review scheduling** — Periodic Sharia audits per the Board's annual plan
2. **Fieldwork** — Product review, transaction sampling, fatwa compliance verification
3. **Observations** — Sharia findings flow into the Observation Tracker as source "Sharia Audit"
4. **Remediation** — Business units address Sharia observations with Board oversight
5. **Certification** — Annual Sharia compliance certification

Both Internal Audit and Sharia Board observations feed into the compliance engine's overall score and framework-specific scores, connecting internal governance to the broader compliance posture.

---

## 4. Module Requirements

### 4.1 Observation Tracker

**Status:** Fully Functional

#### Before (Manual Process)

Compliance teams tracked audit findings in spreadsheets or shared folders. Each regulatory inspection (SAMA, Internal, Sharia) produced a separate report with observations documented in PDF. Tracking remediation required manual email follow-ups with responsible departments. Evidence collection was ad-hoc — documents sent via email and filed in shared drives with inconsistent naming. There was no unified view of all open observations across sources, no severity-weighted prioritization, and no automated deadline tracking.

**Pain points:**
- No single source of truth for all observations across regulatory sources
- Manual follow-up via email for remediation status and evidence
- No visibility into overall compliance posture from observation data
- Difficulty filtering and reporting by source, severity, or department
- No structured remediation plan workflow with approval gates

#### After (ComplianceOS)

The Observation Tracker provides a unified registry for all findings from SAMA Inspections, Internal Audits, and Sharia Audits. Each observation has a structured lifecycle: creation → remediation plan submission → evidence collection → closure request → verification.

**Current capabilities:**
- **Multi-source tracking:** Observations tagged by source (SAMA Inspection, Internal Audit, Sharia Audit)
- **Severity classification:** Critical, High, Medium, Low — with severity-weighted scoring in the compliance engine
- **Status lifecycle:** Open → In Progress → Resolved → Closed with full timeline tracking
- **Remediation plans:** Structured submission with title, description, due date, and document uploads. Plans go through a submit → review → approve/reject workflow.
- **Evidence collection:** Document upload (PDF, DOC, images) with remediation plan association
- **Checklist management:** Per-observation remediation checklists with completion tracking
- **Dual deadlines:** Plan Submission Due Date (when remediation plan must be submitted) and Remediation Deadline (when observation must be closed)
- **Closure workflow:** Request closure → Leader/Manager review → Approve/Reject with notes
- **Leadership model:** Observation leader assignment with transfer capability
- **Role-based access:** Officers can view and create; Managers can manage; Leaders can perform all operations on their observations
- **Activity timeline:** Full audit trail of all actions (checklist changes, status changes, document uploads, comments, leadership transfers)
- **Department assignment:** Observations assigned to responsible departments (IT & Cybersecurity, HR, Risk Management, Operations, Legal, Compliance, Finance)
- **CSV export:** Exportable observation data for external reporting
- **Sub-classification system:** Each observation source can contain sub-classifications. The system should support filtering by subtitle/sub-finding. The `subTitle` field exists in the data model with full filtering support.

#### Compliance Feedback Items — Pending Implementation

The following items were identified during compliance team review and require implementation:

1. **Visit-type column:** Observations should track whether the originating inspection was conducted online or on-site (physical). This field is not yet in the data model and needs to be added.

2. **Evidence follow-up per department:** There should be a structured follow-up mechanism for evidence requested from responsible departments. Currently, evidence is uploaded as documents, but there is no request-and-track workflow for pending evidence items.

#### Framework Principle Tagging (Phase 1)

Observations should be taggable with framework principles (e.g., NCA ECC Domain 2, SAMA CSF Control 3.1). This is a metadata-only enhancement — no new workflows required. Tagging enables framework-aligned reporting: "Show all open observations mapped to NCA ECC Domain 2: Defense."

### 4.2 Correspondence Hub (Letters)

**Status:** Placeholder (SAMA Letters UI built with template management; generalized correspondence hub not started)

#### Before (Manual Process)

Regulatory correspondence followed a paper-based workflow: the compliance writer drafted a letter in Word, routed it via email to the Department Head (reviewer) for feedback, then obtained the CEO's signature. The signed letter was converted to PDF and dispatched. Tracking response deadlines relied on calendar reminders and manual follow-up. Reference numbers were assigned manually, and finding the history of a correspondence thread required searching through email archives and shared folders.

**Pain points:**
- No centralized registry of all regulatory correspondence
- Manual routing through email (Writer → Reviewer → CEO) with no visibility into where a letter is in the approval chain
- Inconsistent reference numbering across authorities
- No linkage between correspondence and related observations, audits, or circulars
- Template reuse required copying from previous letters with manual updates

#### After (ComplianceOS)

The Correspondence Hub provides a structured workflow for all regulatory letter management. Starting with SAMA (the primary use case), the system generalizes to support CMA, Insurance Authority, and other Pattern 1 regulators.

**SAMA Letters workflow (existing UI):**

1. **Draft creation** — Writer selects letter type (Non-Objection, Inquiry, Submission, Notification), chooses a sub-category (Key Function Appointment, Product Launch, Equity Participation, etc.), selects target SAMA department, and drafts content in English and Arabic.
2. **Template system** — Pre-built templates in a Template Databank with usage tracking, duplication, and custom template creation. Templates cover: Key Function Appointment, Product Launch Request, Circular Clarification, Regulatory Interpretation, Quarterly AML Report, Annual Compliance Report, Incident Notification, System Outage Report.
3. **Approval routing** — Draft → Send for Approval (internal compliance review) → Approved for Sending → Sent to SAMA → SAMA Response Received
4. **Attachment management** — Document uploads associated with each letter
5. **Activity timeline** — Full audit trail (Draft Created → Compliance Approved → Pending SAMA Reply)
6. **Metadata tracking** — Reference number, recipient department, created by, response deadline

**Sub-workflows to implement:**

- **Writer → Reviewer → CEO chain:** The three-step approval must be enforced in the system. The Writer creates; the Reviewer (Department Head) approves content; the CEO provides final signature authorization. Each step must capture the approver, timestamp, and any revision notes.
- **Multi-authority generalization:** The same workflow model should extend to CMA and Insurance Authority correspondence, with authority-specific letter types and templates.
- **Template management per authority:** Each regulatory authority should have its own template library with authority-specific fields and formatting requirements.
- **Response tracking:** When a letter is sent, the system should track expected response dates and generate alerts when responses are overdue.
- **Thread management:** Related correspondence (original letter → authority response → follow-up) should be linked as threads for complete history visibility.
- **Email Automation:** On submitting a letter, outlook pop-up should include the pdf letter as attached alongside all the attached items within

### 4.3 Rules & Circulars

**Status:** Placeholder (UI built with article breakdown, implementation tracking; business logic not wired)

#### Before (Manual Process)

When SAMA issued a new circular, the compliance team received it via email as a PDF attachment. The team would manually assess whether the circular was applicable to the organization and create a corrective action plan (CAP) in a Word document. The CAP was emailed to the responsible department (Business Owner) for implementation. Tracking progress required manual follow-up emails. Completion evidence was sent back as PDFs and filed in shared folders. There was no centralized view of all circulars, their implementation status, or overdue action items.

**Pain points:**
- Circulars tracked via email and PDF — no searchable registry
- CAP creation and tracking done manually in Word documents
- No notification system for Business Owners when action is required
- No standardized evidence collection for CAP completion
- No visibility into implementation progress across departments
- Risk of missed deadlines with no automated alerts

#### After (ComplianceOS)

The Rules & Circulars module transforms circular management from email-and-PDF into a structured digital workflow with accountability at every step.

**Full sub-workflow:**

1. **Circular registration** — Compliance team registers new circular with title, SAMA reference number, issuance date, implementation deadline, affected departments, and uploads the circular PDF.

2. **Applicability assessment** — Compliance team evaluates whether the circular applies to the organization. Assessment is documented with rationale. Non-applicable circulars are marked accordingly and archived.

3. **CAP creation** — For applicable circulars, compliance creates a Corrective Action Plan. The CAP breaks down into articles/requirements, each with:
   - Article number and title
   - Description of the requirement
   - Risk level assessment
   - Responsible department assignment
   - Compliance status tracking (Not Started → In Progress → Completed)
   - Individual article-level deadlines

4. **Business Owner assignment** — Each CAP item is assigned to a Business Owner (the department responsible for implementation). The system sends a **notification to the Business Owner** alerting them of the new assignment, deadline, and required actions.

5. **Evidence collection** — Business Owners upload evidence of implementation (policy documents, system screenshots, configuration reports, etc.) directly in the platform against each CAP item.

6. **Completion tracking** — Implementation progress is tracked at the article level with percentage completion. Overall circular implementation progress is aggregated from individual articles.

7. **Compliance review** — Once a Business Owner marks items as complete, the compliance team reviews the evidence and either approves or requests additional documentation.

8. **Submission to regulator** — When all CAP items are complete and evidence is verified, the compliance team prepares the formal submission to the regulator confirming implementation.

**Additional requirements:**
- Priority-level classification (High, Medium, Low) for each circular
- Department-based filtering (Compliance, IT/Cyber, Finance, Risk, Legal, Security)
- Internal notes/comments on each circular for team collaboration
- Documentation repository per circular for all related evidence
- Activity feed showing all actions taken on each circular
- Observation Tracker linkage — circular non-compliance items should be convertible to observations

### 4.4 Policies & Procedures

**Status:** Placeholder (UI built with policy listing, detail view, version history, and approval workflow visualization; no persistent store)

#### Before (Manual Process)

Policies were stored as Word documents in shared network drives. Tracking which policies were due for review required maintaining a separate spreadsheet with review dates. When a policy needed updating, the compliance team manually initiated the review process via email. Different policy types required different approval workflows — Board-level policies needed Board approval, management policies needed management and Sharia committee sign-off, and certain policies required AGM approval — but these workflows were managed informally through email chains with no enforced routing.

**Pain points:**
- No automated reminders for upcoming policy reviews
- Version control limited to filename conventions (Policy_v2_final_FINAL.docx)
- No enforced approval workflows — easy to bypass required sign-offs
- No audit trail of who reviewed, approved, or modified policies
- No visibility into overall policy health (how many are current vs. expired)

#### After (ComplianceOS)

The Policies & Procedures module provides automated lifecycle management for all organizational policies with version control, tiered approval workflows, and proactive review scheduling.

**Core capabilities:**

1. **Policy registry** — Centralized repository with metadata: name, version, status (Draft → Under Review → Approved → Expired), category (Compliance, IT, Operations, Risk, HR, Finance), owner, department, effective date, and next review date.

2. **Automated review notifications** — The system sends notifications **90 days before** a policy's next review date. This is both automated (system-generated) and configurable for manual override of review dates.

3. **Tiered approval workflows** — Three distinct approval chains based on policy classification:
   - **Board-level policies:** Draft → Department Review → Compliance Review → Board Approval → Published
   - **Management + Sharia policies:** Draft → Department Review → Management Approval → Sharia Committee Review → Published
   - **AGM policies:** Draft → Department Review → Management Review → Board Recommendation → AGM Approval → Published

4. **Version history** — Full version control with changelog tracking. Each version records: version number, author, change summary, approval chain, and effective date.

5. **Audit trail** — Complete timeline of all policy actions: creation, edits, review submissions, approvals, rejections, and publication events.

6. **Document management** — Policy documents (PDF, DOC) attached to each policy record with upload tracking.

7. **Status dashboard** — At-a-glance view of policy health: total policies, policies by status, upcoming reviews, overdue reviews.

**Integration with compliance engine:**
- Policy Currency is one of the five compliance score components (15% default weight)
- Calculated as: (Active policies with nextReviewDate in the future) / (Total active policies)
- Policies that pass their review date without renewal degrade the compliance score

### 4.5 Audit Management

**Status:** Fully Functional

#### Before (Manual Process)

Audit planning and execution were managed through a combination of spreadsheets, email, and shared folders. Internal audit teams maintained an annual audit plan in Excel, tracked fieldwork progress through email updates, and stored working papers in network drives. SAMA inspections were tracked separately from internal audits, making it difficult to get a unified view of all audit activities. Scheduling recurring audits (quarterly, annual) required manual calendar management.

**Pain points:**
- No unified view of all audit types (SAMA Inspection, Internal, Sharia)
- Manual progress tracking with no real-time visibility
- No automated scheduling for recurring audits
- Working paper storage fragmented across network drives
- No linkage between audits and their resulting observations

#### After (ComplianceOS)

Audit Management provides end-to-end lifecycle management for all audit types with real-time progress tracking, team collaboration, and direct integration with the Observation Tracker and Compliance Engine.

**Current capabilities:**

- **Multi-type support:** Internal Audit, SAMA Inspection, Sharia Audit — each with appropriate categorization and terminology
- **Terminology compliance:** External regulatory reviews display as "SAMA Inspection" (not "audit") per compliance team feedback
- **Lifecycle management:** Pending → In Progress → Completed (with Overdue auto-detection)
- **Priority classification:** Critical, High, Medium, Low
- **Category taxonomy:** Security Compliance, Financial Compliance, Regulatory Compliance, Operational Compliance, HR Compliance, Sharia Compliance
- **Frequency scheduling:** Annual, Semi-Annual, Quarterly, Monthly, Ad-hoc — enabling recurring audit scheduling
- **Team management:** Audit team assignment with role-based responsibilities and lead auditor designation
- **Document management:** Working paper uploads (PDF, DOC, images) with upload tracking
- **Comment system:** Threaded discussion on each audit with edit/delete permissions
- **Progress tracking:** Percentage-based progress with overdue detection
- **Late completion tracking:** Audits completed past their due date are flagged with `closedOverdue` and `completedAt` timestamps, enabling late-penalty calculations in the compliance engine
- **Audit log:** Comprehensive activity logs with timestamp, user, action type, and description — filterable by action type, date range, and user

**Compliance team feedback — pending implementation:**

1. **Automated archiving for internal audits:** Completed internal audits should be automatically archived after a configurable period, moving them from the active list to an archive view while maintaining full data accessibility and audit trail integrity.

2. **Recurring scheduling:** While the frequency field exists, the system should automatically generate the next audit instance when the current one is completed (e.g., completing a quarterly audit automatically creates the next quarter's audit).

**Integration with compliance engine:**
- Audit Completion is one of the five compliance score components (25% default weight)
- On-time completion earns full credit; late completion receives graduated penalties (85% credit if ≤7 days late, 70% if ≤14 days, 50% if ≤30 days, 25% if >30 days)
- Overdue audits generate -5 point deductions; late completions generate -2 point deductions

### 4.6 Reports & Analytics

**Status:** Mostly Functional (compliance engine fully wired; some dashboard elements use hardcoded data)

#### Before (Manual Process)

Compliance reporting was a quarterly exercise in data aggregation. Teams manually compiled data from spreadsheets, audit reports, and observation trackers to produce executive summaries. Calculating the organization's overall compliance posture required subjective assessment rather than data-driven scoring. Trend analysis was virtually impossible because historical data existed in disconnected formats across multiple periods.

**Pain points:**
- Quarterly reporting took days of manual compilation
- No objective, repeatable compliance score methodology
- No trend analysis or period-over-period comparison
- Reports were static snapshots with no drill-down capability
- No framework-specific reporting (e.g., "How are we doing against NCA ECC?")

#### After (ComplianceOS)

Reports & Analytics provides a data-driven compliance dashboard powered by a pure calculation engine that produces objective, reproducible scores.

**Compliance Engine — Currently Operational:**

The engine calculates a composite compliance score from five weighted components:

| Component | Default Weight | Data Source | Calculation |
|---|---|---|---|
| Audit Completion | 25% | Audit Store | (On-time credits + late-penalty credits) / total audits |
| Observation Closure | 25% | Observation Store | Severity-weighted closed observations / total weighted observations |
| Risk Posture | 20% | Risk Store* | Weighted resolved+accepted risks / total weighted risks |
| Policy Currency | 15% | Policy Store* | Active policies with current review date / total active policies |
| Training Completion | 15% | Training Store* | Average completion rate across training programs |

*\*Currently receives empty arrays — stores not yet implemented*

**Engine features:**
- **Period filtering:** 3 months, 6 months, 12 months, Fiscal year (Saudi fiscal = calendar year Jan-Dec)
- **Confidence levels:** Insufficient (≤2 data points), Low (≤5), Moderate (≤15), High (>15) — insufficient components are excluded from overall calculation with weights re-normalized
- **Per-framework scores:** Separate scores for SAMA, Internal, and Sharia — calculated from framework-specific audits and observations
- **Automated deductions:** Critical observation open (-8 pts), High observation open (-3 pts), Overdue audit (-5 pts), Late audit completion (-2 pts), Medium observation open (-1 pt), Insufficient data component (-2 pts), Component below 60% (-3 pts)
- **Trend generation:** Monthly data points for 3/6/12-month periods; quarterly data points for fiscal year
- **Period-over-period change:** Compares current period score against the equivalent previous period
- **Configurable weights:** Administrators can adjust component weights within defined bounds (must sum to 100%)
- **Target score:** Configurable target (default 90%) displayed as reference line on trend charts

**Report tabs:**
- **Executive View:** Overall compliance score, component breakdown, framework scores, trend chart, deduction analysis
- **Audits Tab:** Audit listing from store with CRUD operations, filtering, sorting, and CSV export
- **Detailed Logs Tab:** Audit activity logs with filtering by action type, date range, and search — with CSV export
- **Risks Tab:** Risk register view with 5x5 risk matrix visualization (currently hardcoded data)

**Items using hardcoded data (requiring store integration):**
- Risk distribution chart and risk register items in the Risks tab
- Some finding-level details in the executive view

### 4.7 Calendar

**Status:** Placeholder (UI built with Gregorian and Hijri calendar support, calendar store functional)

#### Before (Manual Process)

Compliance deadlines were tracked in personal calendars, shared Outlook calendars, or spreadsheets. Recurring submission dates (quarterly SAMA reports, annual license renewals, monthly filings) were manually entered each period. There was no centralized compliance calendar showing all regulatory deadlines across authorities.

**Pain points:**
- Deadline tracking scattered across individual calendars
- No recurring event automation — each deadline manually re-entered
- No multi-authority view showing all regulatory deadlines
- Missed deadlines discovered only when authority follows up
- No linkage between calendar events and related audits, observations, or submissions

#### After (ComplianceOS)

The Calendar provides a centralized, multi-authority compliance calendar with recurring event support and Hijri calendar integration (essential for Saudi regulatory dates).

**Current capabilities:**
- **Dual calendar:** Gregorian and Hijri calendar views with full month/year navigation
- **Hijri support:** Complete Hijri month names and navigation (1420-1530 H range)
- **Event types:** Deadline, Meeting, Submission, Review — with type-based filtering
- **Task creation:** Compliance tasks with title, due date, priority (Low, Medium, High, Critical), and assignee
- **Entity linkage:** Events linked to audits, observations, or letters
- **Reminder system:** Configurable reminders (email, notification, SMS)
- **View modes:** Month, Week, Day views with task detail panel
- **Overdue detection:** Visual indicators for overdue, due today, and upcoming tasks

**Requirements for full implementation:**
- **Recurring dates:** Specific regulatory dates that recur annually, quarterly, or monthly should be auto-generated. Examples: quarterly SAMA submission deadlines, annual license renewal dates, monthly AML reporting deadlines.
- **Multi-authority submission calendar:** A consolidated view showing all regulatory submission deadlines across SAMA, CMA, ZATCA, MISA, and other authorities with authority-based color coding.
- **Auto-population:** Calendar should auto-populate from audit due dates, observation deadlines, and policy review dates already in the system.

### 4.8 Risk Register

**Status:** UI Built, No Persistent Store

#### Before (Manual Process)

Risk management was conducted through spreadsheets with a basic likelihood × impact matrix. Risk owners were assigned informally, and there was no systematic process for tracking risk mitigation progress over time. Risk reviews were conducted ad-hoc rather than on a defined schedule.

**Pain points:**
- Static spreadsheet-based risk register with no real-time updates
- No structured mitigation tracking or progress measurement
- No historical audit trail of risk score changes
- No automated review scheduling
- No integration with compliance scoring

#### After (ComplianceOS)

The Risk Register provides a structured risk management framework with a 5×5 risk matrix, mitigation tracking, and audit trail.

**Current UI capabilities (requiring store implementation):**
- **5×5 risk matrix:** Visual heat map with likelihood (1-5: Rare → Almost Certain) × impact (1-5: Negligible → Catastrophic) scoring
- **Risk categories:** Operational, Financial, Compliance, Strategic, Reputational
- **Status lifecycle:** Open → Mitigating → Accepted → Closed
- **Mitigation tracking:** Mitigation plan documentation with percentage-based progress tracking
- **Risk owner assignment:** Named owner with department affiliation
- **Monitoring frequency:** Weekly, Monthly, Quarterly, Semi-Annual, Annual — with review date tracking
- **Audit trail:** History of all risk changes (status changes, score updates, mitigation updates, reviews, assignments, notes)
- **Filtering and search:** By category, status, and keyword

**Required for completion:**
- Zustand store with persistence (Risk Store) following the existing store patterns
- Integration with compliance engine (Risk Posture component — currently receives empty array)
- Dashboard widget integration for risk summary statistics

### 4.9 Team & Training

**Status:** Partially Built (Active Directory and User Logs functional; Training tab with saudization metrics built)

#### Before (Manual Process)

Team management relied on HR systems with no compliance-specific view. Training compliance was tracked in spreadsheets with manual deadline management. Saudization metrics were calculated manually from HR data. User activity logs were either nonexistent or buried in IT system logs inaccessible to compliance teams.

**Pain points:**
- No compliance-specific team view with workload and assignment visibility
- Training completion tracking disconnected from compliance scoring
- Manual saudization metric calculation
- No user activity audit trail accessible to compliance teams
- No role-based access control visible to compliance managers

#### After (ComplianceOS)

Team & Training provides compliance-specific workforce management with three functional areas:

**Active Directory (functional):**
- Team member listing with role, department, workload, and status
- Member detail view with current assignments, bandwidth analysis, and access control
- Team statistics: total members, admin accounts, assigned tasks, security coverage (SSO status)
- Invite new member workflow with role assignment and access level configuration
- Pagination and search

**User Logs (functional):**
- Comprehensive activity log: Sign In, Sign Out, Session Timeout, Password Change, Profile Update, Permission Change, MFA Enabled, Failed Login
- Filterable by user, action type, and status (Success, Warning, Failed, Info)
- Device and location tracking
- Log detail view with full context, IP address
- Export capability

**Training (built, requires store integration):**
- **Overall training dashboard:** Completion rates, courses assigned, overdue courses, in-progress courses
- **Department-level progress:** Completion tracking broken down by department
- **Saudization metrics:** Saudi vs. Non-Saudi employee breakdown with actual/target/gap analysis
- **Employee training records:** Per-employee view with assigned courses, progress, due dates, and scores
- **Course management:** Add courses, set deadlines, assign to employees, remove courses
- **Course categories:** Compliance, AML, Cybersecurity, Sharia, Risk
- **Training assignment:** Bulk assignment of courses to employees
- **Report export:** Training completion reports

**Required for completion:**
- Training store with persistence for course and completion data
- Integration with compliance engine (Training Completion component — currently receives empty array)
- Saudization data integration with MISA requirements (Pattern 4)

### 4.10 Settings & Frameworks

**Status:** UI Only (framework listing, notification settings, integration marketplace, audit templates — all with placeholder data)

#### Before (Manual Process)

Framework configuration was handled through static documents mapping regulatory requirements to internal controls. Adding a new framework or updating an existing one required manual documentation and redistribution to all relevant teams.

#### After (ComplianceOS)

Settings provides platform-wide configuration for compliance frameworks, notifications, integrations, and user preferences.

**Framework configuration (UI built):**
- **Supported frameworks:** NCA ECC-1:2018, SAMA CSF, NDMO PDPL (displayed in settings); NCA CSCC, NCA CCC, CITC Standards (available during onboarding)
- **Per-framework settings:** Enable/disable, sync frequency (Real-time, Hourly, Daily, Weekly, Manual), compliance threshold (90% Strict, 80% Standard, 70% Relaxed), alert on non-compliance toggle
- **Add framework:** Custom framework registration with name, type (NCA, SAMA, NDMO, International, Custom), description, and auto-sync controls toggle

**Notification settings (UI built):**
- Email digests (weekly compliance summary)
- Critical alerts (instant push for failures)
- Slack integration (real-time activity in #compliance-feed)

**Integration marketplace (UI built):**
- Communication: Slack, Microsoft Teams
- Storage: Google Drive, SharePoint, Dropbox, Box
- Development: GitHub, Azure DevOps, Jira, Confluence
- Connection methods: OAuth 2.0, API Key, Personal Access Token

**Audit templates (UI built):**
- Template listing with category (Technical Control, Legal/Privacy, Financial Compliance, Operational, Custom)
- Template creation with name, associated framework, and description
- Usage tracking per template

**Compliance settings (functional):**
- Component weight configuration with bounds enforcement (must sum to 100%)
- Target score configuration (default 90%)
- Persisted via Zustand store

**Required for full implementation:**
- Principle/control library per framework (the data backbone for framework tagging)
- Framework-to-module mapping (which observations, policies, and risks map to which framework controls)
- Integration API connections (currently all placeholder)
- Notification delivery system (currently UI only)

---

## 5. Framework Metadata Layer (Phase 1 MVP)

### Concept

The Framework Metadata Layer is a Phase 1 enhancement that adds framework principle tagging to existing data records. It requires **no new modules** — instead, it adds metadata fields to existing entities (observations, audits, policies, risks) that link them to specific framework principles and controls.

### Why Metadata First

Building full framework compliance modules (with control libraries, evidence workflows, and gap analysis) is a significant undertaking. The metadata approach delivers 80% of the reporting value at 20% of the implementation cost:

- **Tag existing records** with framework references (e.g., "This observation relates to NCA ECC Domain 2, Control 2-3-1")
- **Generate framework-aligned reports** by filtering and aggregating tagged records
- **Identify coverage gaps** by showing which framework controls have no associated records
- **No workflow changes** — users continue using the same observation, audit, and policy workflows

### Supported Frameworks

| Framework | Authority | Type |
|---|---|---|
| NCA ECC-1:2018 | National Cybersecurity Authority | Essential Cybersecurity Controls |
| NCA CSCC | National Cybersecurity Authority | Critical Systems Cybersecurity Controls |
| NCA CCC | National Cybersecurity Authority | Cloud Cybersecurity Controls |
| SDAIA PDPL | Saudi Data & AI Authority | Personal Data Protection Law |
| SAMA CSF | Saudi Central Bank | Cyber Security Framework |
| CSTC | Communications, Space & Technology Commission | Telecom regulatory framework |
| ISO 27001 | International | Information Security Management |
| COSO | International | Enterprise Risk Management |

### Implementation Requirements

1. **Principle/control library** — A structured data model for each framework's control hierarchy (domains → subdomains → controls → sub-controls). Stored in the Settings module and managed by administrators.

2. **Tagging fields on existing entities:**
   - Observations: `frameworkTags: { frameworkId, controlId, controlRef }[]`
   - Audits: `frameworkTags: { frameworkId, controlId, controlRef }[]`
   - Policies: `frameworkTags: { frameworkId, controlId, controlRef }[]`
   - Risks: `frameworkTags: { frameworkId, controlId, controlRef }[]`

3. **Tag selection UI** — A reusable component for selecting framework → domain → control when creating or editing any taggable entity.

4. **Framework-aligned reporting** — Reports page enhancement showing:
   - Per-framework coverage (% of controls with at least one tagged record)
   - Control-level drill-down (all observations, audits, and policies tagged to a specific control)
   - Gap analysis (controls with no associated records)

5. **No new compliance engine changes** — The engine already calculates per-framework scores (SAMA, Internal, Sharia). Framework tagging enhances the granularity of these scores but does not require engine architecture changes.

---

## 6. Product Roadmap — Specialized Modules

### 6.1 ZATCA Compliance Tracker

**Pattern:** Portal-Based Structured Submissions (Pattern 2)
**Status:** Not Started — Roadmap

ZATCA compliance requires a specialized module because its interaction model (portal-based submissions) differs fundamentally from the correspondence model used by other authorities.

**Feature specifications:**

1. **Portal submission status tracker**
   - Track submission status per ZATCA obligation (VAT returns, Zakat declarations, Withholding tax, etc.)
   - Status lifecycle: Preparing → Submitted → Under Review → Accepted / Rejected
   - Historical submission log with dates and reference numbers

2. **Fatoorah wave tracking**
   - Track e-invoicing implementation phases (Wave 1, Wave 2, etc.)
   - Per-wave compliance checklist
   - Integration readiness assessment (technical requirements, system compatibility, testing status)

3. **Filing calendar**
   - Recurring filing deadlines per ZATCA obligation type
   - Auto-generated calendar events with configurable reminders
   - Visual timeline showing all upcoming ZATCA deadlines

4. **API integration concept**
   - Specification for future integration with ZATCA's Fatoorah platform
   - Read-only status synchronization (submission status pulled from ZATCA portal)
   - Invoice validation pre-check capability

5. **Document management**
   - Tax computation worksheets
   - ZATCA correspondence and notifications
   - Submission receipts and acknowledgments

### 6.2 SAFIU AML Case Management

**Pattern:** One-Way Reporting via External Platform (Pattern 3)
**Status:** Not Started — Roadmap

The SAFIU module requires a dedicated, access-restricted workspace for managing AML compliance activities. Due to the confidential nature of suspicious activity reporting, this module operates with heightened security controls.

**Feature specifications:**

1. **Alert escalation workflow**
   - Transaction monitoring alerts ingested from core banking/transaction systems
   - Alert triage: False Positive → Close | Suspicious → Escalate to Case
   - Escalation routing to designated AML officers

2. **Investigation workflow**
   - Case creation with subject details, transaction history, and supporting evidence
   - Investigation timeline with all actions documented
   - Collaborative investigation with multi-analyst support
   - Decision point: File STR | Close as No Action | Escalate Internally
   - "No-file" decisions must be documented with rationale and retained

3. **STR preparation**
   - Structured data entry matching goAML reporting schema
   - Draft → Review → Approve → Submit workflow
   - Quality assurance checklist before submission
   - Supporting document attachment

4. **Confidential restricted-access log**
   - Separate access control layer — only authorized AML personnel can view
   - All access logged and auditable
   - No cross-reference visible from other modules (e.g., observations or audits cannot link to STR cases)
   - Screen-level access restrictions with session-based authentication

5. **goAML filing tracker**
   - Submitted reports with goAML reference numbers
   - Status tracking: Submitted → Acknowledged → Under Review → Closed
   - Filing statistics and reporting metrics

6. **10-year retention archive**
   - All case files (including no-file decisions) retained for minimum 10 years
   - Immutable audit trail — records cannot be deleted or modified after case closure
   - Archive search with advanced filtering
   - Configurable retention policy (10-year minimum, extendable)

---

## 7. Current Implementation Status

### Module Status Matrix

| Module | Status | Store | Engine Integration | Hardcoded Data |
|---|---|---|---|---|
| **Observation Tracker** | Fully Functional | `observation-store` | Yes (Observation Closure) | None |
| **Audit Management** | Fully Functional | `audit-store`, `audit-log-store`, `audit-task-store` | Yes (Audit Completion) | None |
| **Reports & Analytics** | Mostly Functional | Uses audit/observation stores | Yes (all 5 components) | Risk tab data, some executive details |
| **Compliance Engine** | Fully Functional | `compliance-settings-store` | Core engine | N/A |
| **Calendar** | UI Built | `calendar-store` | No | Some placeholder events |
| **SAMA Letters** | UI Built | `sama-letter-store` | No | Template data |
| **Correspondence** | UI Built | `correspondence-store` | No | Placeholder data |
| **Regulatory Updates** | UI Built | `regulatory-store` | No | Placeholder data |
| **Policies & Procedures** | UI Built | No dedicated store | No (Policy Currency = 0) | All data hardcoded |
| **Risk Register** | UI Built | No dedicated store | No (Risk Posture = 0) | All data hardcoded in reports page |
| **Team Management** | Partially Built | `team-store`, `auth-store` | No | Some member data |
| **Training** | UI Built | No dedicated store | No (Training Completion = 0) | All data hardcoded |
| **Settings** | UI Built | Partial (`compliance-settings-store`) | Partial (weights/target only) | Framework, integration, template data |
| **ZATCA Tracker** | Not Started | — | — | — |
| **SAFIU AML** | Not Started | — | — | — |

### Existing Stores

| Store | File | Persistence | Notes |
|---|---|---|---|
| `audit-store` | `src/stores/audit-store.ts` | Yes (persist) | Full CRUD for audits |
| `audit-log-store` | `src/stores/audit-log-store.ts` | — | Activity logs |
| `audit-task-store` | `src/stores/audit-task-store.ts` | — | Task management |
| `observation-store` | `src/stores/observation-store.ts` | No | Full CRUD for observations |
| `compliance-settings-store` | `src/stores/compliance-settings-store.ts` | Yes (persist) | Weights + target score |
| `calendar-store` | `src/stores/calendar-store.ts` | — | Calendar events |
| `sama-letter-store` | `src/stores/sama-letter-store.ts` | — | SAMA letter management |
| `correspondence-store` | `src/stores/correspondence-store.ts` | — | General correspondence |
| `regulatory-store` | `src/stores/regulatory-store.ts` | — | Rules & circulars |
| `team-store` | `src/stores/team-store.ts` | — | Team members |
| `auth-store` | `src/stores/auth-store.ts` | — | Authentication state |
| `notification-store` | `src/stores/notification-store.ts` | — | Notifications |
| `report-store` | `src/stores/report-store.ts` | — | Report metadata |
| `sidebar-store` | `src/stores/sidebar-store.ts` | — | UI state |
| `language-store` | `src/stores/language-store.ts` | — | i18n language selection |

### Missing Stores (Required for Engine Integration)

| Store Needed | Engine Component | Current State |
|---|---|---|
| **Risk Store** | Risk Posture (20% weight) | `risks: []` passed to engine |
| **Policy Store** | Policy Currency (15% weight) | `policies: []` passed to engine |
| **Training Store** | Training Completion (15% weight) | `trainings: []` passed to engine |

### What the Compliance Engine Calculates Today

With only audit and observation data available, the engine currently calculates:

- **Overall compliance score** — Based on Audit Completion and Observation Closure only (weights re-normalized to 50/50 since other components have insufficient data)
- **Framework scores** — SAMA, Internal, Sharia — based on framework-specific audit and observation data
- **Deductions** — All observation-based and audit-based deductions are functional
- **Trend data** — Monthly or quarterly trend lines based on audit/observation creation dates
- **Period-over-period change** — Comparison against equivalent previous period
- **Risk Posture, Policy Currency, Training Completion** — All return 0 with "insufficient" confidence and generate -2 point "insufficient data" deductions

### RBAC Implementation

The platform implements a three-tier role hierarchy:

| Role | Level | Capabilities |
|---|---|---|
| **Officer** | Base | View all modules, full observation CRUD, export |
| **Manager** | Mid | Officer + audit CRUD, report creation, team visibility |
| **Admin** | Full | Manager + delete operations, settings management, team management (invite, edit, remove) |

Specialized permission logic exists for observations: leader-based access (observation leaders can manage their observations regardless of role), assignee-based access (assignees can submit remediation plans and request closure), and comment ownership (users can edit/delete their own comments).

### Internationalization

The platform supports full bilingual operation (English and Arabic) with:
- Complete translation dictionaries (`en.json`, `ar.json`)
- RTL layout support for Arabic
- `{{param}}` interpolation for dynamic content in translations
- Translation keys organized by module namespace
- All user-facing strings externalized — no hardcoded English in components

---

*This document serves as the definitive product specification for ComplianceOS. It should be updated as modules are implemented, requirements are refined, and new regulatory patterns are identified.*
