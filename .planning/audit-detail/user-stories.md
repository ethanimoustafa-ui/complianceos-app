# Audit Detail — User Stories

**Route:** `/reports/[auditId]`
**Primary roles:** compliance officer · compliance manager · auditor · business owner (limited) · org admin
**Domain entity:** `audits` + `audit_tasks` + `audit_documents` + `audit_comments` + `audit_team_members` + `audit_logs` (per-audit workspace)

## What this page is for

This is the full workspace for a single audit engagement: every task, every team member, every document, every comment, every status change. Where `/reports/audits` is the list, this is the room. The page is dynamic — `[auditId]` comes from the URL — and pulls from six stores (`useAuditStore`, `useAuditLogStore`, `useAuditTaskStore`, `useTeamStore`, `useAuthStore`, `useFrameworkConfigStore`). Recently added API routes confirm this page exercises `/api/audits/[auditId]/comments`, `/documents/[docId]`, and `/team` endpoints heavily.

## Primary user journeys

### Story 1 — Open an audit and see its full state

**As an** auditor
**I want to** open an audit and see its scope, team, tasks, documents, comments, and activity log
**So that** I can pick up where the previous session left off.

**Acceptance criteria**:
- Visiting `/reports/<auditId>` triggers `fetchById(auditId)` and renders the audit workspace
- Tabs / sections: overview, tasks, team, documents, comments, closure
- The page shows scope, lead auditor, period, status, findings count from `useAuditStore`
- Tasks come from `useAuditTaskStore`; team from `useTeamStore` filtered to the audit's members; audit log from `useAuditLogStore`
- Hard-reload → the same workspace returns

### Story 2 — Add and complete audit tasks

**As a** lead auditor planning the engagement
**I want to** add tasks with owner, due date, and status
**So that** the team has a clear plan.

**Acceptance criteria**:
- The tasks tab shows a list and an "Add Task" affordance
- Adding requires title, owner, due date; defaults status to `open`
- Tasks are CRUD'd via `useAuditTaskStore` (whole-store handle in page.tsx)
- Completing a task writes through the API and updates the progress widget
- Hard-reload → tasks persist

### Story 3 — Manage the audit team

**As a** lead auditor onboarding a junior
**I want to** add a team member to the audit
**So that** they get access to the workspace.

**Acceptance criteria**:
- The team tab shows current members with their role on the audit
- "Add Team Member" calls `addTeamMember(auditId, memberId)` → writes via `/api/audits/[auditId]/team/`
- "Remove" calls `removeTeamMember(...)` with confirmation
- Removed members lose access on next page load
- Hard-reload → team list persists

### Story 4 — Upload audit working papers

**As an** auditor collecting evidence
**I want to** upload working papers (PDFs, Office docs)
**So that** the evidence is centralized.

**Acceptance criteria**:
- The documents tab has an upload affordance
- Uploads write to the `audit_documents` storage bucket (HANDOFF §4 #3: bucket not yet created — uploads will 404)
- Allowed MIME types: PDF, common Office, common image formats
- Size limit: 20 MB default (50 MB for evidence)
- Successful upload creates an `audit_documents` row and renders the file with name, size, uploader
- Documents can be downloaded; deletion via `removeDocument(docId)` requires confirmation
- Hard-reload → documents persist

### Story 5 — Comment on the audit

**As an** auditor with a finding question
**I want to** add comments visible to the audit team
**So that** discussion lives inside the audit record.

**Acceptance criteria**:
- The comments tab has a "Add comment" input
- Submitting writes via `/api/audits/[auditId]/comments/` and updates the list
- Comments can be edited / deleted by the author (`editComment`, `deleteComment`)
- Each comment shows actor, timestamp, text
- Hard-reload → comments persist

### Story 6 — Transition audit status / close out

**As a** lead auditor finishing an engagement
**I want to** transition status (`planning` → `fieldwork` → `reporting` → `closed`)
**So that** stakeholders see the engagement is complete.

**Acceptance criteria**:
- A status changer is visible on the detail page header
- Each transition writes through `updateStatus`
- Closure may require: all tasks completed, all findings remediated or accepted, sign-off comment
- The closure tab summarizes findings, sign-offs, and date closed
- Hard-reload → status persists

## Edge cases the page should handle

- Empty state: a brand-new audit shows tabs with empty content ("No tasks yet", etc.)
- Loading state: per-tab skeletons while child stores hydrate
- Mutation in flight: Add / Save / Delete disable during requests
- Network failure: failed mutations surface inline
- RBAC: lead auditor + managers edit; team members contribute to their tabs; viewers read-only
- RTL: Arabic content renders right-to-left including the activity timeline
- **Known issue (W2 walk):** detail-link discovery from the list page is currently empty under headless tests — add `data-testid` on detail anchors

## Out of scope for this page

- Cross-audit search (lives on the audit list page)
- Generating the formal audit report PDF from the workspace (template lives at `/api/export/pdf` with `template: 'audit-report'`; PDF export button may live here but the rendering is server-side)
- Real-time collaborative editing of the same document (deferred)

## Open questions

- Audit closure: does the platform enforce "all findings closed" before allowing status `closed`, or is it just a guideline?
- What's the document retention policy for working papers after audit closure? (Scope says default 10y but the bucket isn't yet created.)
- Should comment threads support replies / threading, or stay flat?
