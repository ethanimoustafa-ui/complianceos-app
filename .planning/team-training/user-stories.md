# Team Training — User Stories

**Route:** `/team/training`
**Primary roles:** compliance officer · compliance manager · org admin
**Domain entity:** `training_courses` + `training_assignments` + `saudization_snapshots` + employees (HR-compliance training tracker)

## What this page is for

This page tracks every compliance training the institution offers (AML, KYC, anti-bribery, code of conduct, ICT security, sanctions, regulator-mandated programs) and which employees have completed which courses by which deadline. It also surfaces the institution's **Saudization metrics** — the percentage of Saudi nationals in each department against SAMA targets — stored as **quarterly snapshots** (per scope §1: aggregate snapshots, not raw employee rows). Bulk CSV import is supported for the HR team to load completion data.

## Primary user journeys

### Story 1 — See training completion across the team

**As a** compliance manager
**I want to** see every employee with their assigned courses, due dates, and completion status
**So that** I know who's overdue on mandatory training.

**Acceptance criteria**:
- Landing at `/team/training` shows the employee table and an overview-stats panel
- `useTrainingStore.fetchAll()` hydrates employees, courses, saudization, and department progress on mount
- Each employee row shows assigned course count, completed count, overdue count
- Hard-reload → the same data returns

### Story 2 — Deep-link to an employee's training detail

**As a** compliance manager who got a Slack link
**I want to** click `/team/training?employeeId=<id>` and land on that employee's detail modal
**So that** I can see their training record without searching.

**Acceptance criteria**:
- Visiting with `?employeeId=<id>` auto-opens the employee detail (per page.tsx:93)
- An unknown id degrades to the list view (no crash)
- Removing the param returns to the list

### Story 3 — Manage training courses

**As an** org admin defining the compliance curriculum
**I want to** create, edit, and remove courses
**So that** the catalog matches my institution's program.

**Acceptance criteria**:
- A "Manage Trainings" button opens a modal listing every course
- "Add Course" within the modal requires course name, department (or all), mandatory flag, recurrence (annual / one-time), valid-for duration
- Save calls `useTrainingStore.addCourse(...)` and writes through the API
- The new course appears in the list within one re-render (**known regression — W3 walk B4 recorded courseVisible=false** — likely missing required fields the diagnostic didn't fill)
- Editing calls `updateCourse`; removing calls `removeCourse`
- **Known gap (W3 walk B8):** no per-course delete affordance is currently surfaced in the modal; the store action exists

### Story 4 — Assign a course to employees

**As a** compliance manager onboarding a department
**I want to** assign a course to one employee or to a whole department
**So that** assignment is not a per-employee chore.

**Acceptance criteria**:
- Single-employee assignment via `assignCourseToEmployee(employeeId, courseId, dueDate)`
- Bulk assignment via `bulkAssignCourse(courseId, employeeIds[], dueDate)`
- Assigned employees receive a notification (in-app + email per their preferences)
- Their training row updates with the new pending assignment
- Hard-reload → assignments persist

### Story 5 — Bulk import completion data via CSV

**As an** HR coordinator with a spreadsheet of completed trainings
**I want to** upload a CSV and have completion data ingested
**So that** I don't have to mark each employee manually.

**Acceptance criteria**:
- An "Import" affordance opens an upload modal
- The CSV format is documented inline (employee email, course id, completion date, score)
- Upload calls `importUploadData(...)` which validates each row and reports errors
- Valid rows update assignments to `completed`; invalid rows surface in a results table
- The overview stats refresh after import

### Story 6 — View and update Saudization metrics

**As a** compliance manager preparing the quarterly SAMA filing
**I want to** see Saudization percentages per department vs targets
**So that** I can attest to compliance.

**Acceptance criteria**:
- A Saudization panel shows per-department Saudization % with target
- The metrics are quarterly snapshots (scope §1 — *not* raw employee rows)
- `updateSaudizationMetrics(...)` allows entering / correcting a snapshot
- `recalculateDepartmentProgress(...)` refreshes the per-department aggregates
- Hard-reload → metrics persist
- Overdue snapshots (more than one quarter old) surface a warning

## Edge cases the page should handle

- Empty state: a fresh tenant shows zero employees and a "Add your first course" CTA
- Loading state: skeleton rows while `useTrainingStore.fetchAll()` resolves
- Mutation in flight: Add / Assign / Import buttons disable during requests
- Network failure: failed mutations surface inline; CSV import errors per-row
- RBAC: managers + admins manage; officers can mark own completion; viewers read-only
- RTL: Arabic course names and department labels render right-to-left

## Out of scope for this page

- Hosting the actual training content (videos / slides) — out of scope
- LMS integration (deferred)
- Saudization classification levels (Platinum / Gold / etc.) — open question per scope §10
- Email reminders for upcoming deadlines (handled by notifications subsystem)

## Open questions

- Saudization by classification level (Platinum / Gold / Silver / etc.) — required by SAMA but not yet modeled (scope §10)
- Course expiry: when an annual course lapses, does the assignment auto-recreate?
- Per-employee remove-course affordance: should the Manage Trainings modal surface one (W3 walk B8)?
