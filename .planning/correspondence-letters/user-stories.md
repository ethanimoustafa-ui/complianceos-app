# Letters — User Stories

**Route:** `/correspondence/letters`
**Primary roles:** compliance officer · compliance manager · org admin
**Domain entity:** `sama_letters` (formal letters to/from SAMA, CMA, IA, and other authorities — `authority` FK generalises the table beyond SAMA)

## What this page is for

Formal letters are the most consequential correspondence object in the system — a letter to SAMA can trigger an inspection or a fine. This page is the inbox + outbox for those letters: every inbound regulator letter is logged with its reference, subject, attachments and response deadline; every outbound letter is drafted (often from a template), routed through a multi-step approval chain, and only sent once every approver has signed off. The page also hosts inline template management. PDF export is bilingual (English admin headers + Arabic body or vice versa, per scope §4.3).

## Primary user journeys

### Story 1 — Draft a new outbound letter from a template

**As a** compliance officer responding to a SAMA query
**I want to** draft a new letter starting from an approved template
**So that** the format and disclaimers match what compliance has already vetted.

**Acceptance criteria**:
- A "New Letter" button is visible on the page header (Gated by `Manage Letters` permission)
- Clicking it opens `CreateLetterForm` inside the letters modal
- Selecting a letter type and template populates the body with the template text
- Placeholder tokens in the template (e.g. `{{circular_ref}}`) render an inline chip editor for the officer to fill
- Save creates the letter in `draft` status; **the server assigns the reference number and returns it on the create response** (do NOT call any client-side `getNextReference()` — that shim throws by design, per the documented BUG-W1 P0)
- The reference is read off `letter.reference` from the create response and shown on the detail page
- Hard-reload → the draft is still there with the assigned reference

### Story 2 — Route a draft through its approval chain

**As a** compliance manager
**I want to** submit a drafted letter for approval, then approve each step in order
**So that** no letter leaves the building without the right sign-offs.

**Acceptance criteria**:
- The detail panel shows the letter's approval chain with each approver's role, name, and step status (pending / approved / rejected)
- A "Submit for Approval" button is visible only when status is `draft`
- After submit, the letter status changes to `pending_approval` and the first approver receives a notification
- Each approver sees "Approve" / "Reject" actions on their step only when prior steps are complete
- Approval / rejection writes through the API, updates the chain in real-time on the detail panel, and appends to the letter's timeline
- The letter becomes "Send"-able only after the final approver approves

### Story 3 — Send an approved letter

**As a** compliance officer with an approved letter in hand
**I want to** click "Send" and have the letter dispatched to its recipient department
**So that** the regulator's clock starts on their response.

**Acceptance criteria**:
- The "Send" button is visible only when the letter is fully approved
- Clicking Send opens a confirmation showing the recipient email pulled from the authority + department mapping
- Send writes the email via the configured transport (in-region SMTP) and updates status to `sent` with a `sent_at` timestamp
- The timeline records the send event with the recipient address and signing officer
- A success toast confirms send
- The letter row in the list shows the new `sent` status chip

### Story 4 — Export a letter as a bilingual PDF

**As a** compliance manager preparing for an inspection
**I want to** export a letter as a PDF that exactly matches what was sent
**So that** my audit binder is consistent with the regulator's copy.

**Acceptance criteria**:
- The detail panel has a "Download PDF" button
- Clicking it calls `downloadPdf(...)` which hits the `/api/export/pdf` endpoint with `template: 'sama-letter'`
- The PDF respects the letter's locale (en / ar) — Arabic letters render right-to-left with the Amiri font
- Bilingual letters render English headers and Arabic body within one document
- The PDF includes the letterhead logo (org branding), the reference, subject, recipient, body, signature block, and attachments list
- Errors (`PdfError`) surface as a clear inline message rather than a silent failure

### Story 5 — Manage letter templates inline

**As an** org admin
**I want to** create, edit, and archive letter templates from the letters page
**So that** my team's drafts stay consistent and on-format.

**Acceptance criteria**:
- A "Template Management" affordance (button / icon) opens `isTemplateManagementOpen` modal
- The modal lists every template with its status (`active` / `draft` / `archived`), letter type, and last-updated timestamp
- New template creation requires name, type, body, and at least one placeholder definition
- Saving writes through the letter-template API and updates the dropdown immediately on the create-letter form
- Archived templates do not appear in the create-letter dropdown but remain referenced by existing letters

### Story 6 — Open a specific letter via deep link

**As a** compliance officer following an email link
**I want to** click `/correspondence/letters?id=<letterId>` and land on that letter's detail view
**So that** I can act without searching.

**Acceptance criteria**:
- Visiting `/correspondence/letters?id=<id>` auto-opens the detail panel for that letter
- The page falls back gracefully (list view, no crash) if the id is unknown / hidden by RLS
- The browser back button restores the prior list view
- The deep-link works regardless of which list filter the user had set previously

## Edge cases the page should handle

- Empty state: a fresh tenant shows an empty list with a "draft your first letter" CTA
- Loading state: skeleton list rows while `useLetterStore.fetchAll()` resolves (page already implements `showLettersSkeleton`)
- Detail-loaded gating: the detail panel knows when only the list snapshot has arrived vs the full record with timeline/approval/attachments — sections defer until `isDetailLoaded`
- Mutation in flight: `isMutating` flag disables Submit / Send / Delete buttons during requests
- Network failure: PDF errors and send errors surface inline; the letter status does not change optimistically
- RBAC: officers draft; managers approve; only managers + admins can send; viewers see read-only
- RTL: full RTL support including the signature block and recipient address

## Out of scope for this page

- Inbound letter parsing / OCR (manual entry only per scope §10)
- Cross-tenant template sharing (single-tenant MVP)
- Digital signing with eIDAS / Saudi NCA certificates (deferred — physical signature line + seal image only)

## Open questions

- Should "rejected" approval steps return the letter to `draft` or to a separate `rejected` status?
- Email transport — confirm in-region SMTP relay is wired before pilot (scope §5 hard requirement)
- Bilingual letters: which language drives the PDF orientation when both blocks exist?
