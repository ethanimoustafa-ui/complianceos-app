# Observations — User Stories

**Route:** `/correspondence/observations`
**Primary roles:** compliance officer · compliance manager · business owner · auditor · org admin
**Domain entity:** `observations` (regulator-raised findings, internal audit findings, supervisory observations)

## What this page is for

Observations are the day-to-day workload of a Saudi compliance department: every finding raised by SAMA, CMA, internal audit, or an inspector lands here, gets a severity and a source-authority tag, is assigned to a business owner, given a due date, and tracked through remediation to closure. The observations tracker is what compliance staff have in front of them most of the day. The W2 walk confirmed `/observations` redirects here and there is no separate `/observations/new` route — creation is modal-driven.

## Primary user journeys

### Story 1 — Register a new observation

**As a** compliance officer who just received a SAMA finding letter
**I want to** register the observation with reference, severity, source, due date, and assignee
**So that** remediation tracking starts immediately.

**Acceptance criteria**:
- A "New Observation" / "Add Observation" button is visible on the page header
- Clicking it opens `AddObservationModal`
- Required fields marked with red asterisks: title, severity, source authority, status, assignee, due date
- A "Missing required: …" hint surfaces below the form when any required field is empty (HANDOFF recent commit `36b0acc` shipped this)
- Save is disabled until all required fields are filled
- After save, the modal closes, a success toast appears, and the new observation appears at the top of the list with a server-assigned reference
- The reference comes from the server (NOT from a client `getNextReference()` shim — same anti-pattern as letters)
- Hard-reload → the observation is still there
- An `audit_logs` row records the creation

### Story 2 — Deep-link to an observation

**As a** business owner notified by email
**I want to** click `/correspondence/observations?id=<observationId>` and land on the observation detail view
**So that** I can update remediation status without searching.

**Acceptance criteria**:
- Visiting with `?id=<id>` auto-opens the observation detail panel
- An unknown id degrades to the list view (no crash)
- Removing the param returns to the list

### Story 3 — Transition an observation through statuses

**As a** business owner assigned a remediation
**I want to** mark progress from `open` → `in_progress` → `resolved` and finally `closed`
**So that** compliance sees the live state of every finding.

**Acceptance criteria**:
- The detail panel exposes a status changer with valid transitions only (cannot jump from `open` straight to `closed`)
- Each status change writes through the observation API and appends to the observation timeline with actor + timestamp
- Status chips on the list update immediately
- An overdue indicator appears when status is not `closed` and `due_date < today`
- Closure requires at least one remediation evidence attachment (deferred — currently optional)

### Story 4 — Add a remediation comment

**As a** compliance officer following up
**I want to** add a comment to an observation
**So that** the back-and-forth with the business owner is recorded inside the platform.

**Acceptance criteria**:
- The detail panel has a comments section with a "Add comment" input
- Submitting writes through the observation-comments API (`/api/observations/[id]/comments/`)
- The new comment appears in the comments list immediately
- Editing or deleting a comment is restricted to the comment author + managers
- Hard-reload → comments persist

### Story 5 — Attach remediation evidence

**As a** business owner who has fixed the issue
**I want to** attach evidence (PDF, screenshot, signed memo) to the observation
**So that** the auditor can close it without asking for more documents.

**Acceptance criteria**:
- The detail panel has an "Attachments" section with an upload affordance
- Uploading writes to the `observation_documents` storage bucket (note: HANDOFF §4 #3 flags the bucket as not yet created — uploads will 404 until Agent S creates it)
- Allowed MIME types: PDF, common images, common Office MIME types
- Size limit per file: 20 MB default, 50 MB for evidence buckets
- A successful upload creates an `observation_documents` row and surfaces the file in the list with name + size
- Files can be downloaded; deletion requires confirmation

## Edge cases the page should handle

- Empty state: a fresh tenant shows "No observations yet" with a CTA to add the first one
- Loading state: skeleton list rows while `useObservationStore.fetchAll()` resolves
- Mutation in flight: Save / Status / Delete buttons disable during requests
- Network failure: failed mutations surface inline; the optimistic UI reverts
- RBAC: officers + assigned business owners can edit; viewers see read-only; auditors get read-only with export
- RTL: Arabic observation titles render right-to-left

## Out of scope for this page

- Bulk import of observations from a spreadsheet (deferred per scope §1 — manual entry from day one)
- Auto-classification of observation severity (out of scope per concerns doc)
- PDF export of the observation list (lives via `/reports` export modal)

## Open questions

- Should closing an observation be reversible after, say, 30 days? Currently unclear.
- When the assignee resigns (team member soft-deleted), who is the observation reassigned to?
- Remediation evidence — is closing an observation blocked if no attachment is present?
