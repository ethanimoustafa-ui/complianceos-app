# Reports — Audits — User Stories

**Route:** `/reports/audits`
**Primary roles:** compliance officer · compliance manager · auditor · org admin
**Domain entity:** `audits` (audit engagements: scope, lead auditor, period, findings count, status)

## What this page is for

This is the audit-engagement list. It enumerates every audit (internal, SAMA inspection, external, Sharia, IT) with its scope, lead auditor, period, current status, and finding counts. Each row links into `/reports/[auditId]` for the full audit workspace. The W2 walk confirmed there is *no* standalone `/audits` route — audits UI lives only under `/reports/audits` and the detail page.

## Primary user journeys

### Story 1 — Browse all audits

**As a** compliance manager
**I want to** see every audit engagement with its status and finding counts
**So that** I know which audits are running, at risk, or closed.

**Acceptance criteria**:
- Landing at `/reports/audits` shows the audits table with columns: reference, title, lead auditor, period, status, findings count, actions
- `fetchAudits()` is called on mount to hydrate the list
- Each row is clickable and routes to `/reports/[auditId]` for that audit
- Hard-reload → the same audits return (server-backed)
- W2 walk confirmed `GET /rest/v1/audits → 200` succeeds against Supabase

### Story 2 — Create a new audit engagement

**As a** compliance manager kicking off a new audit
**I want to** create a new audit with scope, lead auditor, period, and category
**So that** the engagement is tracked from day one.

**Acceptance criteria**:
- A "New Audit" / "Add Audit" button is visible on the page header
- Clicking it opens `AddAuditModal`
- Required fields marked with red asterisks: title, scope, lead auditor (assignee), period start, period end, category
- Save is disabled until all required fields are filled
- After save, the modal closes, a success toast appears, and the new audit appears in the list with a server-assigned reference
- The new audit's `created_at` and `created_by` are set server-side
- Hard-reload → the audit is still there

### Story 3 — Delete an audit

**As an** org admin who created a duplicate audit
**I want to** delete an unused audit
**So that** the list stays clean.

**Acceptance criteria**:
- Each row has a trash icon in its actions dropdown (per W2 walk note `reports/audits/page.tsx:537-571`)
- Clicking delete opens a confirmation modal requiring explicit confirmation
- Confirmed delete removes the audit from the list
- The delete writes an `audit_logs` entry
- Hard-reload → the deletion sticks
- Deleting an audit with findings either cascades or is blocked with a clear message

### Story 4 — Filter / search audits

**As an** auditor browsing
**I want to** filter audits by status, category, or year
**So that** I find the right engagement quickly.

**Acceptance criteria**:
- Filter controls are visible above the table (status, category, period)
- Toggling a filter narrows the visible list
- Audit-category options come from `useAuditCategoryStore`
- A clear-filters affordance restores the full list

## Edge cases the page should handle

- Empty state: a fresh tenant shows "No audits yet" with a "Create your first audit" CTA
- Loading state: skeleton rows while `useAuditStore.fetchAll()` resolves
- Mutation in flight: Add / Delete disable during requests
- Network failure: failed mutations surface inline
- RBAC: managers + admins create / delete; officers + auditors read; viewers read-only
- RTL: Arabic audit titles render right-to-left
- **Known issue (W2 walk):** the list rendered with 0 detail-shaped links — either RLS hides rows or `fetchAll` hadn't resolved before the page assertion ran. Add a `data-testid` on detail-link anchors so walkers can find them deterministically.

## Out of scope for this page

- The audit detail / workspace (lives at `/reports/[auditId]`)
- PDF export of an individual audit report (lives on the detail page)
- Cross-audit comparison views (deferred)

## Open questions

- Add-audit form (W2 walk #4): `assigneeId` is required by zod — should it default to the current user, or stay required?
- Audit-category enum: the page widens `AuditCategory` to `string` to use the store. What's the desired UX when a category is renamed mid-audit?
- Should completed audits roll off the default list after, say, 12 months?
