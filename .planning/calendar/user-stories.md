# Calendar — User Stories

**Route:** `/calendar`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** `calendar_events` (compliance obligations, recurring deadlines, regulator dates, internal milestones)

## What this page is for

The compliance calendar is the team's single source of truth for "what's due, and when". It surfaces deadlines from across the platform — regulator filing dates, circular implementation deadlines, audit milestones, policy review cycles, training deadlines — alongside ad-hoc compliance tasks the team adds manually. Saudi institutions operate on a dual Gregorian/Hijri date model, so the view toggles between the two. A submissions-grouped view exists for officers tracking regulator submissions specifically.

## Primary user journeys

### Story 1 — See this month's deadlines

**As a** compliance officer
**I want to** open the calendar and see every deadline in the current month
**So that** I can plan my week and surface anything overdue.

**Acceptance criteria**:
- Landing at `/calendar` shows a month grid with the current month selected
- Each cell is labelled with both Gregorian and Hijri dates (depending on `calendarType` toggle)
- Events appear as colored chips inside the day cell, color-coded by `sourceType` (circular, audit, observation, training, manual, etc.)
- Clicking a day opens an `EventDrawer` listing every event for that day with full detail
- Hard-reload the page → the same events re-appear (events are server-persisted)

### Story 2 — Switch between month, year, and submissions views

**As a** compliance manager
**I want to** see deadlines at month, year, and submissions altitudes
**So that** I can plan quarterly filings (year), today's work (month), or regulator-submission cadence (submissions).

**Acceptance criteria**:
- A view-mode toggle (month / year / submissions) is visible at the page top
- Switching to `year` renders a 12-month thumbnail strip with event-density heat coloring per day
- Switching to `submissions` renders a list grouped by `submissionGroupBy` (date / month / year)
- The selected view-mode is preserved during the session
- Filter chips for `selectedSourceTypes` (Set) hide / show event types in the current view

### Story 3 — Toggle between Gregorian and Hijri dates

**As a** compliance officer working with SAMA filings
**I want to** see Hijri dates alongside Gregorian
**So that** I match the regulator's calendar when the filing deadline is Hijri-pinned.

**Acceptance criteria**:
- A `calendarType` toggle (gregorian / hijri) is visible in the page header
- Switching to Hijri re-renders every date label using a Hijri conversion (e.g. `15 Ramadan 1447`)
- Month grid cells continue to align by Gregorian day under the hood (the calendar grid itself doesn't flip)
- Events keep their actual deadline dates (the label changes, the underlying timestamp does not)
- RTL: Arabic locale defaults the toggle to Hijri-first; English locale defaults Gregorian-first

### Story 4 — Create a new compliance task on a chosen day

**As a** compliance manager
**I want to** add a new compliance task to a specific date
**So that** ad-hoc obligations (e.g. "review circular SAMA-CIR-2026-0006 by Friday") show up alongside system-generated deadlines.

**Acceptance criteria**:
- A "New Compliance Task" / "+" button is visible in the page header
- Clicking it opens `CreateEventModal` titled "New Compliance Task"
- The modal accepts: title (required), date (required, defaults to selected day), event type (defaults to `meeting`), optional description
- Save creates the event server-side via the calendar API and closes the modal
- The new event appears in the rendered grid for its date within one re-render (**known regression — W3 walk recorded `eventVisible=false` after submit**)
- Hard-reload the page → the event is still there
- Open Supabase Studio → the `calendar_events` row exists

### Story 5 — Delete a calendar event

**As a** compliance manager
**I want to** delete an event I created by mistake
**So that** my team isn't confused by phantom deadlines.

**Acceptance criteria**:
- Opening the `EventDrawer` for a day shows a delete button per manually-created event (the recently-added "calendar event delete" feature)
- Clicking delete confirms before destructive action
- Successful delete removes the event from the grid immediately
- System-generated events (sourced from circulars, audits, etc.) cannot be deleted from the calendar — the source must be edited at its module instead
- Hard-reload → the deleted event does not return

## Edge cases the page should handle

- Empty state: a tenant with zero events shows the month grid with no chips, no error
- Loading state: month cells render in a neutral skeleton color until `useCalendarEvents` resolves
- Network failure: failed mutations surface inline in the drawer / modal (not silent)
- RBAC: officers can create manual events; viewers cannot
- RTL: month and weekday labels render right-to-left; the grid flow reverses

## Out of scope for this page

- Editing the underlying source record (e.g. fixing a circular's due date — must be done on `/correspondence/regulatory-updates/rules`)
- Recurring-event configuration UI (recurring events are derived server-side from their source modules)
- Calendar export to ICS / Outlook (deferred)

## Open questions

- Should `calendarType=hijri` re-flow the grid so Hijri days drive cell layout, or stay as a label-only overlay? Currently label-only.
- The `submissions` view's `submissionGroupBy` options (date/month/year) — should they persist per user?
- Recurring obligations: where is the "next occurrence" generation triggered? (Not visible from `/calendar`.)
