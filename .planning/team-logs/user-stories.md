# Team Logs — User Stories

**Route:** `/team/logs`
**Primary roles:** org admin · compliance manager · auditor
**Domain entity:** `user_activity_logs` (per-user activity: sign-ins, mutations, page views joined to `profiles`)

## What this page is for

Where `/reports/detailed` shows platform-wide mutations, this page shows per-user activity. SAMA / PDPL expect the institution to demonstrate which individual user did what — sign-ins, sign-outs, sensitive actions, last-active timestamps. The page joins `user_activity_logs` with `profiles` so each row shows the actor's name and avatar instead of just a UUID. Org admins use it to spot dormant accounts, after-hours activity, and inspection prep.

## Primary user journeys

### Story 1 — See recent team activity

**As an** org admin doing a quarterly access review
**I want to** see every team member's recent activity
**So that** I can identify dormant accounts or anomalous after-hours use.

**Acceptance criteria**:
- Landing at `/team/logs` shows a table with rows joined from `user_activity_logs` + `profiles`
- Columns: timestamp, user (name + avatar), action, target entity, request metadata
- The table is sorted newest-first
- `useUserLogStore` hydrates logs; `useTeamStore` hydrates members for the join
- Hard-reload → the same rows return
- **Known issue (W4 walk #5):** the table currently shows 0 rows for the admin user despite Supabase returning 200 — either RLS hides everything from admin (unlikely), the component is querying the wrong endpoint, or seed data is missing. Verify before pilot.

### Story 2 — Filter by user or time window

**As an** auditor scoping to an inspection date range
**I want to** filter logs by user and date range
**So that** I narrow the activity to the inspection scope.

**Acceptance criteria**:
- Filter controls are visible above the table (user, date range, action type)
- Toggling a filter narrows the visible rows
- A row count caption updates with the filter
- A clear-filters affordance restores the full log

### Story 3 — Export per-user activity for an access review

**As an** org admin handing the auditor a quarterly access-review packet
**I want to** export the filtered log
**So that** the binder is consistent with the regulator's request.

**Acceptance criteria**:
- An export affordance is visible in the header
- Export respects the current filters (only filtered rows are exported)
- The CSV / PDF includes: actor, action, target, timestamp, IP / device (when captured per HANDOFF §4 #11)
- The export language follows the current locale

## Edge cases the page should handle

- Empty state: a fresh tenant + admin shows their own sign-ins only (currently 0 rows per W4 — needs investigation)
- Loading state: skeleton rows while `useUserLogStore` hydrates
- Network failure: a failed fetch shows an error panel with retry
- RBAC: org admin + auditor see the full log; managers see their department's users; viewers cannot reach the page
- RTL: Arabic locale renders the table mirrored

## Out of scope for this page

- Editing or deleting log rows (intentionally impossible — append-only DB role lockdown)
- Real-time activity streaming (poll-on-mount only)
- Geo-IP enrichment of request metadata (deferred)

## Open questions

- Why does the page currently show 0 rows for the admin user despite Supabase returning 200? (W4 walk #5)
- IP / device capture is a TODO per HANDOFF §4 #11 — until that lands, what's displayed in the request-metadata column?
- Should deactivated users' historical activity remain visible, or be hidden after a retention period?
