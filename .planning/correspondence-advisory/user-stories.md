# Advisory — User Stories

**Route:** `/correspondence/advisory`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** advisory requests / opinions (internal compliance opinions, Sharia advisory, regulator interpretations)

## What this page is for

The advisory page tracks the back-and-forth of compliance opinions — internal departments asking "is this allowed?", Sharia board guidance, and the compliance team's recorded answers. Each advisory thread has a question, a requesting department, an answer, attachments, and a status (pending, in review, answered, closed). It's the institution's audit-defensible record of "why we decided to do X" when the regulator later asks.

## Primary user journeys

### Story 1 — Submit a new advisory request

**As a** business owner who is unsure whether a new product launch needs SAMA non-objection
**I want to** submit an advisory request to the compliance team
**So that** they answer authoritatively and the question is recorded.

**Acceptance criteria**:
- A "New Advisory Request" button is visible on the page header
- Clicking it opens a modal with required fields: subject, requesting department, question text, optional attachments
- Save creates the advisory with status `pending` and surfaces it in the list
- A success toast confirms creation
- Hard-reload → the new advisory is still there
- The advisory appears for the compliance team to pick up

### Story 2 — Open a specific advisory via deep link

**As a** compliance officer who got a Slack link to an advisory
**I want to** click `/correspondence/advisory?id=<advisoryId>` and land on the open thread
**So that** I can respond without searching.

**Acceptance criteria**:
- Visiting `/correspondence/advisory?id=<id>` auto-opens that advisory's detail panel
- The page survives an unknown `id` (degrades to list view, no crash)
- Removing the `?id=` param returns to the list

### Story 3 — Answer / update an advisory

**As a** compliance manager
**I want to** record my opinion on an advisory and change its status
**So that** the requester knows the answer and we have an audit trail.

**Acceptance criteria**:
- The advisory detail panel exposes an "answer" field and a status changer (pending → in review → answered → closed)
- Saving writes through the advisory API; the store re-reads imperatively after a mutation to refresh selection (per page.tsx:711)
- The status chip updates in the list immediately
- Hard-reload → the new answer + status persist
- An entry is appended to the audit log capturing who answered what, when

### Story 4 — Manage requesting departments inline

**As an** org admin who notices "Treasury" isn't yet in the list
**I want to** add a department from the advisory page
**So that** I can keep the request flowing without leaving for `/settings`.

**Acceptance criteria**:
- An inline department-CRUD widget is reachable from the advisory page
- Adding a department writes via the departments API and persists
- The new department appears in the requesting-department dropdown immediately
- The same department list is visible on `/settings` and other modules that share `useDepartmentStore`

## Edge cases the page should handle

- Empty state: a fresh tenant shows an empty list with a clear "submit your first advisory" call to action (W1 walk confirmed it currently renders an empty state cleanly)
- Loading state: skeleton list rows while `useAdvisoryStore.fetchAll()` resolves
- Network failure: a failed save surfaces inline (not silent)
- RBAC: officers can submit and answer; viewers can read; only managers can close
- RTL: Arabic question / answer text renders right-to-left in the detail panel

## Out of scope for this page

- Sharia-specific workflow (e.g. multi-scholar voting) — Sharia advisory currently uses the same generic flow
- Email notification to the requesting department on status change (handled by notifications subsystem, not surfaced here)
- PDF export of an advisory thread (deferred)

## Open questions

- Are advisory requests visible only to the requesting department + compliance team, or org-wide by default?
- Does an "answered" advisory get version-locked, or is the answer editable forever?
- Should attachments inherit a shared retention policy with other correspondence?
