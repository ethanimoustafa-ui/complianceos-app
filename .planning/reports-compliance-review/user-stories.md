# Reports — Compliance Review — User Stories

**Route:** `/reports/compliance-review`
**Primary roles:** compliance officer · compliance manager · auditor · org admin
**Domain entity:** `compliance_evaluations` (per-circular / per-policy compliance verdicts: compliant / partial / non-compliant)

## What this page is for

This is the default landing tab under `/reports` (which redirects here). The page asks the compliance team to give an explicit verdict — compliant / partial / non-compliant — against every circular and every policy in their registry. Those verdicts feed scoring and are what an auditor inspects when they ask "show me your self-assessment". The page hosts a paginated list with inline verdict-setting and per-department filtering.

## Primary user journeys

### Story 1 — See every item awaiting a verdict

**As a** compliance officer
**I want to** see every circular and policy that still needs a compliance verdict
**So that** I know what to assess next.

**Acceptance criteria**:
- Landing at `/reports/compliance-review` shows a paginated list of circulars + policies with their current verdict (or "Not assessed")
- The "Showing X–Y of Z" caption uses `PAGE_SIZE = 10`
- Pagination chevrons navigate filtered results
- Hard-reload → the same items and verdicts return
- The page also reads `useDepartmentStore` so department filters are available

### Story 2 — Set a verdict on a circular or policy

**As a** compliance manager doing the quarterly review
**I want to** set a verdict (compliant / partial / non-compliant) with a short justification
**So that** the institution has a defensible self-assessment.

**Acceptance criteria**:
- Each row exposes a verdict selector (compliant / partial / non-compliant)
- Changing the verdict calls `useComplianceEvaluationStore.setVerdict(...)` which writes to the API
- A justification field accompanies the verdict
- Setting a verdict appends to the evaluation timeline with actor + timestamp
- The 4-status color chip on the row updates immediately
- Hard-reload → the verdict and justification persist

### Story 3 — Filter by department or framework

**As an** auditor sampling
**I want to** filter the list to a specific department or framework
**So that** I can review one slice at a time.

**Acceptance criteria**:
- Filter controls are visible above the list (department, framework, verdict status)
- Toggling a filter narrows the visible list
- The result count caption updates accordingly
- A clear-filters affordance restores the full view

### Story 4 — Drill into the source circular or policy

**As a** compliance officer who needs to verify the underlying obligation before setting a verdict
**I want to** click into the source item from this page
**So that** I read the full circular / policy text without losing my place.

**Acceptance criteria**:
- Each row provides a link / button to open the source on its detail page
- Returning via browser back restores the page + pagination state
- The destination page opens with the right item pre-selected

## Edge cases the page should handle

- Empty state: a tenant with zero circulars and zero policies shows a clear "nothing to review yet"
- Loading state: skeleton rows while the four stores hydrate (`useCircularStore`, `usePolicyStore`, `useDepartmentStore`, `useComplianceEvaluationStore`)
- Mutation in flight: verdict selector shows a spinner during the API call
- Network failure: failed verdict-set reverts the chip and surfaces inline
- RBAC: managers can set verdicts; officers can suggest; viewers see read-only
- RTL: Arabic justification text renders right-to-left

## Out of scope for this page

- PDF export of the compliance review (lives in `/reports/executive` or `/reports/detailed`)
- Auto-suggestion of a verdict (out of scope per concerns doc — no AI assessment)
- Bulk verdict-setting across many items (deferred)

## Open questions

- Should partial / non-compliant verdicts auto-create an observation, or just flag the item?
- Is there a "next review date" obligation tied to a verdict, and does it appear on `/calendar`?
- When a circular is updated (new version), does the prior verdict reset or carry forward?
