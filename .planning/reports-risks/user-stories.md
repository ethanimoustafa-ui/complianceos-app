# Reports — Risks — User Stories

**Route:** `/reports/risks`
**Primary roles:** compliance officer · compliance manager · business owner · org admin · auditor (read)
**Domain entity:** `risks` + `risk_mitigations` + per-department risk plans (5×5 likelihood × impact register)

## What this page is for

The risk register is where the institution lists its compliance + operational risks, plots them on a 5×5 likelihood × impact matrix, and tracks each risk's mitigation owner, treatment strategy, and current status. The W2 walk confirmed there is no standalone `/risks` route — risk UI lives only as this report tab. Despite the "report" routing, this is a heavy CRUD + workflow page: create / update / status-change risks, manage mitigations, and route per-department risk plans through send-to-department / submit-plan / accept-plan / toggle-item flows.

## Primary user journeys

### Story 1 — Browse and filter the risk register

**As a** compliance manager
**I want to** see every risk on the 5×5 heat map with severity / category / department filters
**So that** I can sample what's high+likely.

**Acceptance criteria**:
- Landing at `/reports/risks` shows two views: a list and a 5×5 heat map
- Each risk is plotted on the matrix by its likelihood × impact
- Filter controls are visible (category, department, status, severity)
- Risk-category options come from `useRiskCategoryStore`; departments from `useDepartmentStore`
- Hard-reload → the same risks return

### Story 2 — Create a new risk

**As a** compliance officer logging a newly identified risk
**I want to** register it with category, likelihood, impact, owner, treatment, and mitigation steps
**So that** the register stays current.

**Acceptance criteria**:
- A "New Risk" button is visible on the page header
- Required fields: title, category, likelihood (1–5), impact (1–5), owner, treatment strategy (accept / mitigate / transfer / avoid), department
- Save is disabled until all required fields are filled
- The new risk plots on the heat map at its (likelihood, impact) cell
- Hard-reload → the risk persists

### Story 3 — Deep-link to a specific risk

**As a** business owner notified of a risk assignment
**I want to** click `/reports/risks?id=<riskId>` and land on the risk detail
**So that** I can review and act.

**Acceptance criteria**:
- Visiting with `?id=<id>` auto-opens the risk detail panel (per page.tsx:268 `deepLinkIdRef`)
- An unknown id degrades to the list view (no crash)
- Removing the param returns to the list

### Story 4 — Update risk status and add mitigation steps

**As a** business owner reducing a risk's likelihood
**I want to** update the risk status and add a mitigation step
**So that** the heat map and register reflect reality.

**Acceptance criteria**:
- The detail panel exposes status changer (open / in-treatment / accepted / closed) and a mitigations CRUD section
- Status changes write through `useRiskStore.updateStatus`
- Adding a mitigation writes through `useRiskStore.create/update/delete-mitigation`
- The risk's plotted dot on the heat map moves if likelihood / impact change
- Hard-reload → all changes persist

### Story 5 — Send a risk to a department for a plan

**As a** compliance manager who needs a department to propose mitigation
**I want to** "send to department" and have the BO submit a per-department plan with checklist items
**So that** ownership is explicit.

**Acceptance criteria**:
- The detail panel exposes `sendToDepartment` action
- The receiving department's BO sees the risk in their queue and can submit a plan with checklist items via `submitDepartmentPlan`
- The compliance manager reviews and either accepts (`acceptDepartmentPlan`) or returns for revision
- BO can toggle checklist items as completed via `toggleDepartmentPlanItem`
- Every action appends to the risk timeline
- Hard-reload → workflow state persists

### Story 6 — Manage risk categories and departments inline

**As an** org admin
**I want to** create / rename risk categories and departments from this page
**So that** I can fix vocabulary on the fly.

**Acceptance criteria**:
- Inline CRUD widgets for risk categories and departments are reachable from the risks page
- Adding writes via the matching API and persists
- The new value appears in the create / edit dropdowns immediately

## Edge cases the page should handle

- Empty state: a fresh tenant shows an empty heat map and an empty list with a "Register your first risk" CTA
- Loading state: skeleton heat map + list rows while `useRiskStore.fetchAll()` resolves
- Mutation in flight: Save / Status / Mitigation buttons disable during requests
- Network failure: failed mutations surface inline; optimistic UI reverts
- RBAC: officers + managers create / edit; BOs submit department plans; viewers read-only
- RTL: full RTL — heat map axis labels mirror

## Out of scope for this page

- Quantitative risk modeling (Value at Risk, Monte Carlo) — out of scope
- Cross-risk dependency graph (deferred)
- Linking risks directly to circulars (use observations as the linkage layer instead)

## Open questions

- Heat map cell color thresholds — are they org-configurable in `/settings`, or fixed?
- "Accept" treatment — does it require a documented justification or just a status flag?
- Department plans: can multiple departments plan against the same risk, or is it one-to-one?
