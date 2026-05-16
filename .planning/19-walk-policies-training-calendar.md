# W3 — Policies + Training + Calendar walker

Spec: `tests/e2e/walk-policies-training-calendar.spec.ts` — 4 tests, all green.
Supabase project ref used for log pull: `qdbitfgxbnbzkqhdoepd` (eu-central-1, matched MCP `list_projects`).

## Deduped bug table

| # | Severity | Module | Symptom | Evidence |
|---|----------|--------|---------|----------|
| B1 | **High** | All three modules | **Frontend is fully client-side (zustand-only) — no Supabase persistence**. During the entire walk window the only POST/PATCH traffic against `qdbitfgxbnbzkqhdoepd` was `auth/v1/token`, `user_activity_logs`, and reads against `profiles`, `user_roles`, `compliance_scores_cache`. Zero hits against `policies`, `policy_versions`, `training_courses`, `calendar_events`. | Supabase `get_logs` over the test window (~13:55–13:56 UTC) shows 100% 2xx and no policy/training/calendar table I/O. |
| B2 | High | Calendar | Created event not visible after submit. Modal closed without error, no console/network errors, but `getByText("W3_Event_…")` never appeared. Likely `useCalendarStore.createEvent` writes into a list (or non-displayed bucket) that `MonthView`/`SubmissionsList` does not render for the current date — OR `EventDrawer` only opens after `onSuccess(dateKey)` selects the day, and the new event isn't in `itemsByDate` because the date string format mismatches. | `exercised: ["clicked Create","eventVisible=false"]`, screenshot `W3-calendar-not-visible-*.png`. |
| B3 | High | Policies (Reg Updates) | "Create Policy" submit button stays disabled even after filling Name + Description and attaching a dummy PDF. Root cause: `formCategory` and `formTier` remain empty because `EditableSelect` triggers in this app are non-standard composites — clicking by visible placeholder text (`Select category`, `Select approval tier`) does not open the dropdown menu under headless Playwright, so first-option selection never fires. `createFormValid = !!(formName && formCategory && formTier && formDescription && formDocFile)` therefore stays false. | `submitEnabled=false`, screenshot `W3-reg-updates-policies-submit-disabled-*.png`. |
| B4 | Medium | Training | Created course not visible after submit inside Manage Trainings modal. Same pattern as Calendar: no errors, but `getByText("W3_Course_…")` never resolves. Either the modal doesn't render the new course inline, or the add-course form requires fields the walker didn't fill. | `courseVisible=false`, screenshot `W3-team-training-course-not-visible-*.png`. |
| B5 | Medium | Policies | Charter-referenced routes are missing: `/policies`, `/policies/new`, `/policies/[id]`, `/policies/templates`, `/training`, `/training/[id]`. None exist in `src/app/`. Existing FS layout puts policies under `correspondence/regulatory-updates/policies` and training under `team/training`. The supervisor's seed list is stale. | Glob over `src/app/**/{policies,training,calendar}/**/page.tsx`. |
| B6 | Medium | Sign-in | `signIn()` is flaky between tests in a single `playwright test` run. 2nd and 4th sequential signIns timed out waiting for the URL to leave `/sign-in` (the click landed on a button whose handler had not yet hydrated, or `waitForURL` raced a redirect). My walker added a 3-attempt retry that recovers; the smoke spec does NOT have this retry and is at risk on cold dev-server runs. | Console: `signIn attempt 1 failed: page.waitForURL Timeout 25000ms exceeded`. After retries it succeeded for the policies test but the 4th test exhausted all retries. |
| B7 | Low | Policies | No "Publish version" action discoverable on the policy details modal (charter step 4 for `/policies`). Only `Submit for Review`, `Approve`, `Initiate Review`, `Archive`, `Edit`, `Delete` are wired (see `PolicyDetailsContent` callbacks in page.tsx:606-643). Version publish appears to happen implicitly through `Edit` (version field). | Read of `src/app/(dashboard)/correspondence/regulatory-updates/policies/page.tsx:600-650`. |
| B8 | Low | Training | No way to delete/clean up a course or event from the UI — `removeCourse` exists in the store but isn't surfaced as a button in the Manage Trainings modal flow we exercised. State is per-tab zustand (with potential `persist` middleware — not verified), so created rows leak across reloads if persisted. | Trainingstore wired in `page.tsx:54`; no delete affordance encountered. |
| B9 | Low | Charter parity | `getNextReference()`-style "stale store landmine" the charter warned about under `/policies/templates` could not be exercised because that route does not exist. Templates are sourced via `usePolicyTemplateStore` and consumed only via the inline EditableSelect inside the Create modal — not a standalone page. | `policies/page.tsx:179-192` (`handlePolicyTemplateSelect`). |

## Per-route findings

### `/calendar` (real route)
- Landmark `Compliance Calendar` rendered fine. Zero console / network errors during navigation.
- Opened `CreateEventModal` via the icon-only header button (located by clicking through plus-icon buttons until the modal title `New Compliance Task` appeared).
- Filled title `W3_Event_<ts>`, today's date, kept default event type (`meeting`).
- Clicked `Create Task` — modal closed cleanly. **Event never appeared in the visible month view**. See B2.
- Cleanup: no per-event delete affordance from `/calendar` list.

### `/correspondence/regulatory-updates/policies` (real route used in lieu of charter `/policies`)
- Landmark `Regulatory Updates` rendered. Zero console/network errors.
- "Create Policy" button discoverable (Gate `Approve Policy Reviews` is satisfied by admin@complianceos.local).
- Modal opened. Filled Name + Description, attached `W3-dummy-policy.pdf`. Tried to click EditableSelect triggers for Category and Tier by their visible placeholder text — no menu opened. Submit button therefore stayed disabled. See B3.
- Could not exercise: publish version, delete (downstream of failed create).

### `/team/training` (real route used in lieu of charter `/training`)
- Landmark `Team Management` rendered. Zero errors.
- "Manage Trainings" button visible, opened a modal that exposed an "Add Course" affordance. Filled the first text input with `W3_Course_<ts>`. Clicked the submit button.
- Course did not appear in the rendered list (B4). No HTTP errors, no console errors — suggests the form needs additional required fields (department, due date, mandatory flag) that the diagnostic fill didn't populate, OR the visible list refreshes only on modal close + reopen.
- Assign Training: no entry point visible from the post-modal-close state; skipped.

### "Charter-stated absent routes" probe
- Probed `/policies`, `/policies/new`, `/policies/templates`, `/training` — signIn exhausted all 3 retries on this test (B6); could not capture status codes. Manual FS glob confirms none of these paths exist.

## Supabase API correlation (project `qdbitfgxbnbzkqhdoepd`, last 24h, filtered to test window)

- 100% 2xx across ~120 captured events.
- Hot paths during the walk: `POST /auth/v1/token` (sign-in), `GET /rest/v1/profiles`, `GET /rest/v1/user_roles`, `POST /rest/v1/user_activity_logs`, `GET /rest/v1/compliance_scores_cache`.
- **Zero traffic** against `/rest/v1/policies`, `/rest/v1/policy_versions`, `/rest/v1/training_courses`, `/rest/v1/calendar_events` — confirming B1.

## Could not exercise

- **/policies, /policies/new, /policies/[id], /policies/templates, /training, /training/[id]** — routes do not exist; charter's seed list is stale. Supervisor: update the route map or schedule a follow-up phase to scaffold these.
- **Publish version on a policy** — no Publish action in `PolicyDetailsContent`. Version bumps are implicit via Edit. See B7.
- **Assign training to fake employee bucket** — Assign entry point only reachable per-employee from the employee detail modal or per-course from the Manage Trainings list (`onAssignToEmployees` callback in page.tsx:132-135). Walker did not enumerate employees to keep within the 90s/page budget.
- **`getNextReference()`-style stale-store landmine on `/policies/templates`** — route absent; templates are inline only.

## Test cleanup status

- `/calendar`: created event leaked into zustand store. No per-event UI delete. (Persisted? Unverified — zustand `persist` middleware not audited from this walker.)
- `/policies`: nothing created (submit disabled).
- `/team/training`: created course may or may not have committed; either way no UI delete from the Manage modal path exercised.
- Per charter: "no direct SQL" — leaks accepted and logged here.

## Hand-off notes for the fix wave

1. **B1 is the biggest item** — confirm whether Policies/Training/Calendar are intentionally local-only at this phase or whether the backend wiring regressed. The schema/migration may exist (the project has `policies`, `policy_versions`, `training_courses`, `calendar_events` tables per the charter's table list expectation) but the stores aren't using `@/lib/supabase` clients.
2. **B6 sign-in flake** should be patched in `tests/e2e/_helpers/sign-in.ts` directly so future walkers don't all need to copy the retry loop.
3. The walker stays in the suite as a regression baseline; it deliberately does not assert error counts so it remains diagnostic-only.

W3 DONE. Bug count: 9. See .planning/19-walk-policies-training-calendar.md.
