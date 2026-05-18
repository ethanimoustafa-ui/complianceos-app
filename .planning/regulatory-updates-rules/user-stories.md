# Regulatory Updates — Rules (Circulars) — User Stories

**Route:** `/correspondence/regulatory-updates/rules`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** `circulars` (SAMA / CMA / IA / etc. regulator-issued circulars, plus per-department implementations and CAPs)

## What this page is for

This is the heart of regulator-rule tracking. Every circular issued by SAMA / CMA / IA / ZATCA / etc. is registered here with its reference, authority, issue date, and affected departments. The page tracks each circular from issuance through department-level implementation tracking, corrective action plans (CAPs), checklist items, and remediation evidence to closure. The recent commit history confirms this is heavily exercised: missing-field hints, authority enum opening, RegisterCircular modal, EditCircular modal, ArticleDetail modal, and implementation/CAP/checklist routes all in active development.

## Primary user journeys

### Story 1 — Register a new circular

**As a** compliance officer who has just received SAMA circular 41100-12345
**I want to** register the circular with its reference, authority, issue date, and affected departments
**So that** the affected departments are notified and implementation tracking starts immediately.

**Acceptance criteria**:
- A "Register New Circular" button is visible on the page header (Gated by `Manage Audit Findings`)
- Clicking it opens `RegisterCircularModal`
- Required fields marked with red asterisks: title, reference, authority (SAMA / CMA / IA / etc.), issue date, affected departments (one or more), status
- A "Missing required: …" hint surfaces below the form when any required field is empty (per recent commit `36b0acc`)
- Save is disabled until all required fields are filled
- After save, the modal closes, a success toast appears, and the new circular appears at the top of the list
- The new circular's `created_at` is set server-side from the request (recent commit `25cbc7d` fixed the create-date issue)
- Hard-reload → the circular is still there
- An `audit_logs` row records the creation

### Story 2 — Open a specific circular via deep link

**As a** business owner notified by email about a new circular
**I want to** click `/correspondence/regulatory-updates/rules?id=<circularId>` and land on that circular's detail
**So that** I can see exactly what's required.

**Acceptance criteria**:
- Visiting with `?id=<id>` auto-opens the detail panel for that circular
- An unknown id degrades to the list view (no crash)
- Removing the param returns to the unfiltered list

### Story 3 — Filter circulars by authority and department

**As a** compliance officer focused on SAMA-only work this week
**I want to** filter the list to SAMA + my department only
**So that** I see what I need without scrolling.

**Acceptance criteria**:
- Filter controls are visible above the list: search by title/reference, authority selector, department selector
- The result count text reads "Showing X–Y of Z" using `paginate(filteredCirculars, currentPage, PAGE_SIZE=10)`
- Changing any filter resets `currentPage` to 1
- Pagination chevrons navigate through pages of filtered results
- The 4 StatCards (total / in-progress / completed / overdue) reflect the *unfiltered* counts

### Story 4 — Assign business owner and track implementation

**As a** compliance manager
**I want to** assign each affected department a business owner and a target implementation date
**So that** I have someone accountable for the CAP.

**Acceptance criteria**:
- The detail panel exposes a "Business Owner" action that opens `BusinessOwnerModal`
- The modal allows selecting a team member (per affected department) and a target date
- Saving writes to `/api/circulars/[circularId]/implementations/[implementationId]/`
- The business owner sees the circular in their queue
- Implementation status (`pending` / `in_progress` / `completed`) shows on the circular detail
- Hard-reload → the assignment persists

### Story 5 — Track CAP checklist progress

**As a** business owner implementing a circular
**I want to** check off CAP checklist items as I complete them
**So that** compliance sees my progress without me writing a status email.

**Acceptance criteria**:
- The implementation detail surfaces a checklist (per `/api/circulars/[circularId]/implementations/[implementationId]/checklist/`)
- Each checklist item can be toggled (open / completed) with optional evidence note
- Toggling writes through the checklist API and appends to the timeline
- When all items are complete, the implementation status auto-advances to `completed`
- A circular with every implementation `completed` rolls up to status `completed` on the list view

### Story 6 — Edit / delete a circular

**As an** org admin who registered a circular with a typo
**I want to** edit or delete a circular
**So that** the registry stays accurate.

**Acceptance criteria**:
- The detail panel exposes "Edit" and "Delete" actions for users with the right permission
- Edit opens `EditCircularModal` with all fields pre-filled
- Save updates the circular and appends to its timeline
- Delete opens `DeleteConfirmModal` requiring explicit confirmation
- Confirmed delete removes the circular from the list and writes an `audit_logs` entry for the deletion
- Hard-reload → the deletion sticks

### Story 7 — Export filtered circulars

**As an** auditor preparing an inspection brief
**I want to** export the currently filtered circular list
**So that** I can hand the inspector a snapshot of what's tracked.

**Acceptance criteria**:
- An export icon is visible in the page header
- Clicking it calls `exportRulesLocalized(filteredCirculars, 'rules', t, isRTL)` and triggers a localized download
- The export respects the current filters (authority / department / search) — only what's visible is exported
- The export language follows the current locale (en / ar)

## Edge cases the page should handle

- Empty state: a fresh tenant shows the 4 StatCards at zero and a `NoResultsEmptyState` panel
- Loading state: skeleton rows while `useCircularStore.fetchAll()` resolves
- Pagination: PAGE_SIZE = 10; "Showing X–Y of Z" surface (per page.tsx:53)
- Mutation in flight: Save / Edit / Delete buttons disable during requests
- Network failure: a failed save surfaces inline; the optimistic UI reverts
- RBAC: officers + managers can register; business owners can update implementation; viewers read-only
- RTL: full RTL — the page already adds `rtl` class to the root container (per page.tsx:109)

## Out of scope for this page

- Linking a circular to its source PDF on a regulator portal (manual entry only)
- Automatic parsing of circular text to extract obligations (out of scope per concerns doc)
- Cross-tenant sharing of CAP templates (single-tenant MVP)

## Open questions

- Should the framework-pin filter (in `/settings`) hide non-pinned-authority circulars by default, or surface them with a warning?
- CAP completion: should it auto-create observations for any overdue items, or just flag the implementation status?
- Is there a notion of "supersedes" between circulars (e.g. 2025 circular supersedes 2023 one), and is it modeled?
