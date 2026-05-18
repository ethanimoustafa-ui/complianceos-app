# Regulatory Updates — Policies — User Stories

**Route:** `/correspondence/regulatory-updates/policies`
**Primary roles:** compliance officer · compliance manager · org admin
**Domain entity:** `policies` + `policy_versions` (internal policies, governance documents)

## What this page is for

Internal policies are the institution's own version of the regulator's circulars: AML, KYC, ICT, IT security, board governance, code of conduct. Every policy lives here with its category, approval tier, current version, owner, review cycle, and full version history. The page hosts the full policy lifecycle — create, submit for review, approve, publish a new version, archive — plus inline policy-template, department, and category management. The recent commit `774596b` opened up closed enums on policies.category and approval_tier (no longer hard-coded).

## Primary user journeys

### Story 1 — Create a new policy from a template

**As a** compliance officer drafting an AML policy
**I want to** start a new policy from a vetted template
**So that** structure and headings are consistent with what compliance has approved.

**Acceptance criteria**:
- A "Create Policy" button is visible on the page header (Gated by `Approve Policy Reviews`)
- Clicking it opens the create-policy modal
- Required fields marked with red asterisks: name, description, category, approval tier, policy document file (PDF) (HANDOFF recent commit `36b0acc` shipped missing-field hints)
- A "Missing required: …" hint surfaces below the form when any required field is empty
- Selecting a template increments `policyTemplate.usage` (per page.tsx behaviour) and pre-fills the description
- Save is disabled until all required fields are filled (**known bug from W3 walk: clicking EditableSelect placeholders headlessly didn't open the menu → `createFormValid` stayed false**)
- After save, the modal closes, a success toast appears, and the new policy appears at the top of the list with `version = 1`
- Hard-reload → the policy is still there

### Story 2 — Deep-link to a policy + tab

**As a** compliance manager who got a Slack link to a specific policy's approval tab
**I want to** click `/correspondence/regulatory-updates/policies?policyId=<id>&tab=approval` and land there
**So that** I can act without navigating.

**Acceptance criteria**:
- Visiting with `?policyId=<id>&tab=<tabName>` auto-opens the policy detail panel on the requested tab
- An unknown id degrades to the list view (no crash)
- Tab choices include at least: overview, approval, versions
- Removing the params returns to the list

### Story 3 — Submit a draft for review and route through approval

**As a** compliance officer
**I want to** submit my draft policy for review by the approval chain
**So that** the right approvers can sign off.

**Acceptance criteria**:
- The detail panel shows "Submit for Review" when status is `draft`
- After submission the status changes to `pending_review` and the workflow advances through the configured phases
- Each approver sees "Approve" / "Reject" actions on their step only
- Approving the final step changes the policy status to `active` and creates / increments `policy_versions`
- Hard-reload → the workflow state persists

### Story 4 — Publish a new version of an existing policy

**As a** compliance manager updating an outdated policy
**I want to** publish a new version while keeping the old version readable for audit
**So that** the policy stays current and historical record is preserved.

**Acceptance criteria**:
- The detail panel exposes "Edit" → editing creates a new draft version on top of the latest published one
- The new version goes through review / approval before becoming the active version
- Older versions remain visible under a "Versions" tab with their published-at date and approver
- A diff between two versions is available (per `/api/policies/[policyId]/versions/`)
- The active version's number increments (1 → 2 → 3 …)
- **Known gap (W3 walk B7):** there's no explicit "Publish version" button — version publish is implicit through the Edit flow; product decision pending

### Story 5 — Archive a retired policy

**As an** org admin retiring a superseded policy
**I want to** archive a policy without deleting its history
**So that** auditors can still see what was in force at the time of an inspection.

**Acceptance criteria**:
- The detail panel exposes "Archive" for users with the right permission
- Archiving sets status to `archived` and removes the policy from the active list
- An archived policy is still reachable via direct deep-link and via a "show archived" filter
- The archive action appends a timeline entry
- Hard-reload → the archive sticks

### Story 6 — Manage policy templates, categories, and departments inline

**As an** org admin tidying up the vocabulary
**I want to** add or rename policy templates, categories, and the affected departments from this page
**So that** I don't have to leave for `/settings`.

**Acceptance criteria**:
- Inline-CRUD widgets for templates, categories, and departments are reachable from the policies page
- Adding writes through the matching API and persists
- The new value appears in the create / edit modal dropdowns immediately
- The same vocabulary is visible on `/settings` and other modules sharing `useDepartmentStore` / `usePolicyCategoryStore`

## Edge cases the page should handle

- Empty state: a fresh tenant shows "No policies yet" with a "Create your first policy" CTA
- Loading state: skeleton rows while `usePolicyStore.fetchAll()` resolves
- Pagination: PAGE_SIZE = 10; "Showing X–Y of Z" surface
- Mutation in flight: Submit / Approve / Edit / Archive / Delete disable during requests
- Network failure: failed mutations surface inline; the optimistic UI reverts
- RBAC: officers create drafts; managers approve; only managers + admins archive; viewers read-only
- RTL: Arabic policy names and descriptions render right-to-left

## Out of scope for this page

- The actual policy PDF rendering engine (lives in the PDF service)
- Cross-policy linkage (e.g. "this AML policy references KYC policy v3") — currently free-text
- E-signature for policy approvals (deferred — see letters page open question)

## Open questions

- Should "Publish version" be its own explicit action, or stay implicit through the Edit + Approve flow? (W3 walk B7)
- When a category is renamed, do existing policies surface the new name or the historical name they were created under?
- Should archived policies appear in the framework score calculation?
