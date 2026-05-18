# Correspondence Registry — User Stories

**Route:** `/correspondence/registry`
**Primary roles:** compliance officer · compliance manager · auditor
**Domain entity:** unified registry view over `circulars` + `policies` (read-only index)

## What this page is for

The registry is a "shelf view" of the institution's two most regulator-facing object types — circulars (regulator-issued rules) and policies (internal documents). It's where an auditor looks first when they ask "show me everything that governs how you operate". The page is intentionally narrow: it lists circulars and policies side-by-side with light filters and lets you click through to the source page. It is read-only — creation, editing, and workflow live on the dedicated module pages.

## Primary user journeys

### Story 1 — Browse circulars and policies in one shelf

**As an** auditor preparing an inspection
**I want to** see every active circular and every active policy in one place
**So that** I can sample the registry to spot gaps.

**Acceptance criteria**:
- Landing at `/correspondence/registry` shows two sections / tabs: Circulars and Policies
- Each row shows reference, title, authority (circulars) / category (policies), version / status
- Both sections hydrate from server stores (`useCircularStore`, `usePolicyStore`)
- Hard-reload → the same records return
- The page is read-only — no Add / Edit buttons on this view

### Story 2 — Click into a circular's implementation tracker

**As a** compliance officer
**I want to** click a circular row and land on its rules-page detail
**So that** I can see the CAP and remediation progress for that circular.

**Acceptance criteria**:
- Each circular row is clickable; clicking calls `setSelectedCircular(circular)` and navigates to `/correspondence/regulatory-updates/rules?id=<circularId>`
- The destination page opens with that circular pre-selected
- The browser back button returns to the registry view

### Story 3 — Click into a policy's workflow

**As an** auditor sampling policies
**I want to** click a policy row and land on its detail / version history
**So that** I can confirm it was approved by the right people.

**Acceptance criteria**:
- Each policy row is clickable; clicking calls `setSelectedPolicy(policy)` and navigates to `/correspondence/regulatory-updates/policies?policyId=<id>`
- The destination page opens with the policy detail panel open
- The browser back button returns to the registry view

## Edge cases the page should handle

- Empty state: a fresh tenant shows "No circulars yet" / "No policies yet" panels
- Loading state: skeleton rows in each section while stores hydrate
- Network failure: each section falls back to its own error state independently
- RBAC: any read-permission role can view the registry; viewers and auditors are the primary audience
- RTL: Arabic titles and references render right-to-left

## Out of scope for this page

- Creating, editing, or deleting circulars / policies (lives on the dedicated rules / policies pages)
- Filtering by framework or authority (deferred — would belong here in a future iteration)
- Bulk export of the registry (deferred — use individual module exports)

## Open questions

- Should the registry also include letters and observations, or stay scoped to circulars + policies?
- Should auditors get a "snapshot at date" affordance for inspection prep, freezing the registry view as of a chosen day?
- Filters: do we need authority / status / framework filters on this page or is it intentionally barebones?
