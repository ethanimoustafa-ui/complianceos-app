# Team Directory — User Stories

**Route:** `/team/directory`
**Primary roles:** org admin · compliance manager (read)
**Domain entity:** `profiles` + `user_roles` (team members with role assignments and HR-compliance fields)

## What this page is for

The team directory is the org admin's roster: every team member with their email, role, department, and status. It's also the entry point for inviting new users — the platform doesn't allow self-signup (HANDOFF §3 #8: sign-up disabled), so this is the only path to add people. Once `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`, the invite endpoint becomes fully functional.

## Primary user journeys

### Story 1 — Browse the team

**As a** compliance manager
**I want to** see every team member with their role and department
**So that** I know who can be assigned to observations / audits / circulars.

**Acceptance criteria**:
- Landing at `/team/directory` shows the members table with columns: avatar, name, email, role, department, status
- `useTeamStore.fetchAll()` hydrates the list on mount
- Hard-reload → the same members return
- Roles use the 4 seeded values (`org_admin`, `compliance_officer`, `auditor`, `viewer`)

### Story 2 — Invite a new team member

**As an** org admin onboarding a new compliance officer
**I want to** send them an invitation email with a one-shot link to set their password
**So that** they can sign in without me sharing credentials.

**Acceptance criteria**:
- An "Invite Member" button is visible on the page header
- The invite modal requires: email, name, role; optional department
- Submit calls `POST /api/team/members/invite` which: (1) creates an `auth.users` row via service role, (2) inserts `profiles` + `user_roles`, (3) sends a password-recovery email
- A success toast shows after a 201 response
- The new member appears in the list with status `pending` until they set their password
- **Known issue (W4 walk #1):** the recovery email step silently 400s for invalid email TLDs and is swallowed as non-fatal — the invited user gets no email. Production gate: validate email RFC compliance before calling `resetPasswordForEmail`
- **Known config issue (HANDOFF §2):** `SUPABASE_SERVICE_ROLE_KEY` must be set or the endpoint returns 503; the UI should surface that 503 as a clear error, not a generic "failed"

### Story 3 — Update a team member's role

**As an** org admin promoting an officer to manager
**I want to** change their role from the directory
**So that** their permissions update without me touching the database.

**Acceptance criteria**:
- Each member row exposes an edit affordance (admin-only)
- Editing opens a modal with role + department selectors
- Save calls `useTeamStore.update(memberId, {...})` and writes via the team API
- The role change takes effect on the user's next sign-in (or after JWT refresh)
- Hard-reload → the new role persists
- An `audit_logs` entry records who changed whose role when

### Story 4 — Soft-delete / deactivate a member

**As an** org admin offboarding a leaver
**I want to** deactivate their account
**So that** they can't sign in but their historical contributions stay attributable.

**Acceptance criteria**:
- Each member row exposes a deactivate affordance (admin-only)
- Confirmation modal warns about open observations / audits assigned to that user
- Deactivation sets status to `inactive` and blocks future sign-in
- The user remains visible (greyed out) in lists where they were assigned
- Hard-reload → the deactivation persists

## Edge cases the page should handle

- Empty state: only the admin themselves visible on a fresh tenant
- Loading state: skeleton rows while the team store hydrates
- Mutation in flight: Invite / Edit / Deactivate disable during requests
- Network failure: failed mutations surface inline
- RBAC: only `org_admin` can invite / edit / deactivate; other roles read
- RTL: Arabic names render right-to-left
- **Known walker artifact (W4):** invite test left orphan user `402b672c-81c0-46b4-aa56-523e30152aa0` in auth.users without a valid password — needs admin cleanup

## Out of scope for this page

- MFA enrolment for the inviter / invitee (HANDOFF §4 #16 — not yet wired)
- OAuth sign-in setup (deferred)
- Cross-tenant member transfer (single-tenant MVP)
- Per-member API token management (not in MVP scope)

## Open questions

- Invite response showed `role: "auditor"` despite UI posting `role: "officer"` (W4 walk note) — is there a role-mapping intentional in the API, or a bug?
- Email validation: should `.local` TLDs be rejected at the form level, or only at the recovery step (which fails silently today)?
- Should deactivating a member auto-reassign their open observations to their manager?
