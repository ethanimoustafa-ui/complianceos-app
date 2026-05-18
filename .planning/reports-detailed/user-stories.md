# Reports — Detailed (Audit Log) — User Stories

**Route:** `/reports/detailed`
**Primary roles:** auditor · org admin · compliance manager
**Domain entity:** `audit_logs` (the platform-wide append-only audit trail)

## What this page is for

This is the institution's tamper-proof activity log. Every mutation in the platform writes an `audit_logs` row with actor, action, entity, before/after JSON, and request metadata. SAMA auditors ask for this log directly during inspections; PDPL also requires it for personal-data access tracking. The page is a viewer over the log — readable, exportable, filterable, but never editable. The append-only nature is enforced at the DB role level (`REVOKE UPDATE, DELETE`) so even with DB access nobody can modify a row.

## Primary user journeys

### Story 1 — Review recent platform activity

**As an** auditor preparing for an inspection
**I want to** see every action taken in the platform in the inspection window
**So that** I can hand the regulator a complete activity trail.

**Acceptance criteria**:
- Landing at `/reports/detailed` shows the audit log table sorted newest-first
- Columns: timestamp, actor (name + email), action, entity type, entity reference, optional summary
- The store `useAuditLogStore` hydrates from `/api/audit-logs` on mount
- Hard-reload → the same entries return
- The page is read-only (no edit / delete UI exposed)

### Story 2 — Filter the log to a window or actor

**As an** auditor scoping to "last quarter"
**I want to** filter by date range, actor, action type, or entity
**So that** I narrow to the inspection's scope.

**Acceptance criteria**:
- Filter controls are visible above the table (date range, actor, action type, entity type)
- Toggling a filter narrows the visible rows
- A row count caption updates with the filter
- A clear-filters affordance restores the full log

### Story 3 — Drill into the before/after of a single event

**As an** auditor investigating a suspicious edit
**I want to** click a log row and see the before/after JSON of the change
**So that** I can verify what exactly changed.

**Acceptance criteria**:
- Each row is clickable / expandable to a detail view
- The detail shows actor, timestamp, action, entity reference, request IP / device (when captured), and the before / after JSON diff
- The diff highlights changed fields
- Closing the detail returns to the filtered list

### Story 4 — Export the filtered log

**As an** auditor producing inspection evidence
**I want to** export the filtered log to CSV / PDF
**So that** I hand the regulator an immutable snapshot.

**Acceptance criteria**:
- An export affordance is visible in the header
- The export respects the current filters (only filtered rows are exported)
- The PDF / CSV is generated client-side via the export helpers (the W4 walk confirmed no `/api/reports/pdf` endpoint exists for this page)
- The export includes the actor, action, entity, timestamp, and (in PDF) summarized diff per row

## Edge cases the page should handle

- Empty state: a brand-new tenant shows the table with header but no rows
- Loading state: skeleton rows while `useAuditLogStore` hydrates
- Network failure: a failed fetch shows an error panel with retry
- RBAC: org admin + auditor see the full log; managers see filtered (their department / actions); other roles cannot reach the page
- RTL: Arabic locale renders the table mirrored; the JSON diff stays left-to-right (technical content)

## Out of scope for this page

- Editing or deleting log rows (intentionally impossible — DB role lockdown)
- Real-time log streaming (poll-on-mount only)
- Cross-tenant log views (single-tenant MVP)

## Open questions

- Retention: scope §5 says default 10 years uniform for `audit_logs` — is the UI surfacing retention status on each row?
- Should the page warn when filtering crosses the retention boundary (i.e. some rows have been archived)?
- Does the detail view need to show request IP / device, or is that PII to be redacted in the UI? (HANDOFF §4 #11 notes IP/device capture as a TODO.)
