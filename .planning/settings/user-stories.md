# Settings — User Stories

**Route:** `/settings`
**Primary roles:** org admin · compliance manager (read-most)
**Domain entity:** tenant configuration (frameworks, notifications, templates, lookups, RBAC matrix, user prefs)

## What this page is for

`/settings` is the org-wide configuration surface. It is a single page composed of multiple inline sections (Frameworks, Notifications, Templates, Lists & Categories, Access Matrix, User Preferences, Saudization, Compliance Settings) — there are no sub-routes. The page is gated by the `Manage Settings` permission and renders a `ForbiddenPanel` for users without it. Every section is one of the foundational knobs SAMA / CMA expect a regulated tenant to be able to demonstrate during inspection (which frameworks apply, who has access, what categories of risks/policies exist, what the scoring weights are).

## Primary user journeys

### Story 1 — Pin which regulatory frameworks apply

**As an** org admin
**I want to** mark which of the 11 seeded frameworks (SAMA, CMA, IA, ZATCA, NCA-ECC, etc.) apply to my institution
**So that** scoring, reports, and tagging only show frameworks I care about.

**Acceptance criteria**:
- The Frameworks section lists every seeded framework with name (localized en/ar), authority, and a pin toggle
- Toggling the pin writes via the framework-config API and updates `frameworks.is_pinned` (or equivalent)
- The list reorders so pinned frameworks float to the top
- Hard-reload → the same pins are still set
- Other pages that read `useFrameworkConfigStore().frameworks` (dashboard, reports/executive, letters create-form) see the new pinned set

### Story 2 — Manage Lists & Categories used elsewhere

**As an** org admin
**I want to** create and rename departments, risk categories, audit categories, policy categories, letter sub-types, correspondence types, and SAMA letter templates
**So that** dropdowns across the platform offer the right vocabulary for my org.

**Acceptance criteria**:
- The Lists & Categories section exposes CRUD widgets for: departments, risk categories, policy categories, audit categories, letter types, correspondence types, policy templates
- Adding a new value writes via the corresponding `/api/settings/*` endpoint and persists
- The new value appears in dropdowns on the next visit to a module page (e.g. a new risk category becomes selectable in `/reports/risks` create-risk modal)
- Renaming is non-destructive — existing records keep their FK to the renamed row
- Deleting an in-use category is either blocked or asks for confirmation with the count of affected records

### Story 3 — Configure the role / permission matrix

**As an** org admin
**I want to** see which of the 25 permissions each of the 4 roles has
**So that** I can confirm separation of duties before an audit.

**Acceptance criteria**:
- The Access Matrix section shows a 4-role × 25-permission grid
- Each cell shows whether `(role, permission)` is in `role_permissions`
- The grid is read-most in MVP (the 4 roles and 25 perms are seeded, not freely editable)
- Cells reflect the seeded `org_admin`, `compliance_officer`, `auditor`, `viewer` mapping
- Org admins can see this section; non-admin roles see the `ForbiddenPanel`

### Story 4 — Set the org's default dashboard view, locale, and date format

**As any** user
**I want to** pick my preferred dashboard altitude (executive / managerial / officer), language (en/ar), and date format
**So that** the platform matches how I work.

**Acceptance criteria**:
- The User Preferences section has a dashboard-view selector, a language toggle (English / العربية), and a date-format picker
- Saving writes to `userPreferences` server-side
- The dashboard view change takes effect on next navigation to `/dashboard`
- Language change re-renders the current page in the new locale, flipping RTL/LTR direction
- Date-format change re-renders dates across every page using `useUserPreferencesStore().dateFormat`

### Story 5 — Save changes persistently

**As an** org admin
**I want to** know my settings changes actually saved
**So that** I'm not chasing ghosts during an audit.

**Acceptance criteria**:
- Each section writes through its own API endpoint when its widget is interacted with (no batch "Save All" required for most sections)
- The page chrome shows "Auto-save active" so the user knows changes persist on interaction
- Hard-reload the page → every change is still applied
- **Known issue (W4 walk)**: the prominent "Save Changes" header button currently fires zero requests — either it's a placeholder or it should be removed; needs product decision
- **Known issue (W4 walk)**: the page exposes zero native checkboxes; toggles use custom widgets — for accessibility testing, every toggle needs an accessible role / name

## Edge cases the page should handle

- Empty state: a fresh tenant shows all 11 seeded frameworks and 10 seeded departments out of the box
- Loading state: per-section skeletons while each settings slice fetches
- Network failure: a failed toggle reverts visibly and surfaces an inline error
- RBAC: any user without `Manage Settings` permission sees the `ForbiddenPanel`; some sub-sections (User Preferences) may be self-serve and remain visible
- RTL: Arabic-localized category names render correctly; the grid mirrors

## Out of scope for this page

- Inviting team members (lives in `/team/directory`)
- Per-user MFA enrolment (not yet wired — see HANDOFF §4 #16)
- OAuth provider configuration (deferred)
- Tenant-level branding (logo, color) (not in MVP scope)

## Open questions

- Should "Save Changes" in the header save the whole-page state, or be removed in favour of auto-save (which is the documented behaviour)?
- Are framework weights freely editable, or are the seeded weights authoritative for MVP?
- Saudization targets — where do they live, and are they org-wide or per-department?
