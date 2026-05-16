# API Build — training / calendar / team / messages / notifications (Phase 4, Stage B)

> Status: implemented. `npx tsc --noEmit` is clean for all files under this assignment. The only TypeScript error in the project (`src/lib/api/services/letters.ts:47`) is pre-existing and owned by a different agent.

---

## 1. Files created

### Schemas (`src/lib/api/schemas/`)
- `training.ts`
- `calendar.ts`
- `team.ts`
- `messages.ts`
- `notifications.ts`

### Service helpers (`src/lib/api/services/`)
- `training.ts` — `TRAINING_COURSE_LIST_COLUMNS`, `TRAINING_EMPLOYEE_LIST_COLUMNS`, `ENROLLMENT_COLUMNS`, `TRAINING_CATEGORY_COLUMNS`, `assertCourseExists`, `assertEmployeeExists`, `assertEnrollmentExists`, `getEmployeeDetail`, `recomputeCourseCounts`, `recomputeEmployeeProgress`.
- `calendar.ts` — `CALENDAR_EVENT_LIST_COLUMNS`, `CALENDAR_EVENT_TYPE_COLUMNS`, `assertCalendarEventExists`.
- `team.ts` — `PROFILE_LIST_COLUMNS`, `assertProfileExists`, `getMemberDetail`, `getEffectivePermissions`.
- `messages.ts` — `THREAD_LIST_COLUMNS`, `MESSAGE_COLUMNS`, `PARTICIPANT_COLUMNS`, `assertParticipant`, `assertThreadAdmin`, `assertThreadExists`.
- `notifications.ts` — `NOTIFICATION_COLUMNS`, `assertNotificationOwner`.

### Route handlers (`src/app/api/`)

**Training (12 endpoints)**
- `training/courses/route.ts` — `GET`, `POST`
- `training/courses/[courseId]/route.ts` — `GET`, `PATCH`, `DELETE`
- `training/courses/[courseId]/assign/route.ts` — `POST`
- `training/employees/route.ts` — `GET`, `POST`
- `training/employees/[employeeId]/route.ts` — `GET`, `PATCH`, `DELETE`
- `training/employees/[employeeId]/enrollments/route.ts` — `GET`, `POST`
- `training/employees/[employeeId]/enrollments/[enrollmentId]/route.ts` — `PATCH`, `DELETE`
- `training/employees/[employeeId]/certifications/route.ts` — `GET`, `POST`
- `training/employees/[employeeId]/certifications/[certId]/route.ts` — `PATCH`, `DELETE`
- `training/categories/route.ts` — `GET`, `POST`
- `training/categories/[categoryId]/route.ts` — `PATCH`, `DELETE`

**Calendar (4 paths)**
- `calendar/events/route.ts` — `GET`, `POST`
- `calendar/events/[eventId]/route.ts` — `GET`, `PATCH`, `DELETE`
- `calendar/event-types/route.ts` — `GET`, `POST`
- `calendar/event-types/[typeId]/route.ts` — `PATCH`, `DELETE`

**Team (6 paths)**
- `team/members/route.ts` — `GET`
- `team/members/invite/route.ts` — `POST`
- `team/members/[userId]/route.ts` — `GET`, `PATCH`, `DELETE`
- `team/members/[userId]/permissions/route.ts` — `GET`, `PATCH`
- `team/logs/route.ts` — `GET`
- `team/me/route.ts` — `GET`

**Messages (7 paths)**
- `messages/threads/route.ts` — `GET`, `POST`
- `messages/threads/[threadId]/route.ts` — `GET`, `PATCH`, `DELETE`
- `messages/threads/[threadId]/messages/route.ts` — `GET`, `POST`
- `messages/threads/[threadId]/participants/route.ts` — `POST`
- `messages/threads/[threadId]/participants/[userId]/route.ts` — `DELETE`
- `messages/threads/[threadId]/admins/[userId]/promote/route.ts` — `POST`
- `messages/threads/[threadId]/admins/[userId]/demote/route.ts` — `POST`

**Notifications (4 paths)**
- `notifications/route.ts` — `GET`, `POST` (admin-only create)
- `notifications/[id]/route.ts` — `DELETE`
- `notifications/[id]/mark-read/route.ts` — `POST`
- `notifications/mark-all-read/route.ts` — `POST`

---

## 2. Endpoint counts (HTTP-method × path)

| Domain | Methods (count) |
|---|---|
| Training | 21 (`courses`: GET/POST/GET/PATCH/DELETE/+ assign POST; `employees`: GET/POST/GET/PATCH/DELETE; `enrollments`: GET/POST/PATCH/DELETE; `certifications`: GET/POST/PATCH/DELETE; `categories`: GET/POST/PATCH/DELETE) |
| Calendar | 9 (`events`: GET/POST/GET/PATCH/DELETE; `event-types`: GET/POST/PATCH/DELETE) |
| Team | 9 (`members`: GET; `members/invite`: POST; `members/[id]`: GET/PATCH/DELETE; `members/[id]/permissions`: GET/PATCH; `logs`: GET; `me`: GET) |
| Messages | 12 (threads collection GET/POST; thread item GET/PATCH/DELETE; messages GET/POST; participants POST; participant DELETE; admin promote POST; admin demote POST) |
| Notifications | 5 (list GET; create POST; mark-read POST; mark-all-read POST; delete DELETE) |
| **Total** | **56** |

---

## 3. Permission mapping (mutations)

Decisions follow the seeded permission keys in `supabase/migrations/018_seed_data.sql`. Reads gate via RLS; mutations gate via `requirePerm()`.

- Training courses / employees / enrollments / certifications mutations → `create` / `edit` / `delete` (generic). RLS matches: `training_courses_*` policies use those keys.
- Training categories + Calendar event-types → `settings:edit` (org_admin only).
- Calendar events → `create` / `edit` / `delete`.
- Team:
  - `team/members/invite` → `team:invite` + service role.
  - `team/members/[id]` PATCH → `team:edit`.
  - `team/members/[id]` DELETE → `team:remove`.
  - `team/members/[id]/permissions` PATCH → `team:edit`.
  - `team/logs` GET → `team:view`.
  - `team/me` GET → authenticated only.
- Messages: all gates are thread-membership-based (`assertParticipant`) or thread-admin-based (`assertThreadAdmin`). No global permission gate.
- Notifications:
  - List/mark-read/delete → owner-only (`assertNotificationOwner` + `user_id = auth.uid()`).
  - Create → either caller has `create` permission, or caller is `org_admin`, or the request comes through the service role.

---

## 4. Cache strategy

- Lookup endpoints (`training/categories`, `calendar/event-types`) cached `s-maxage=3600, swr=7200`, tagged `training-categories:list` and `calendar-event-types:list` respectively.
- Detail/list endpoints for `training` and `calendar` cached `s-maxage=60, swr=300`, tagged via `cacheTags.training(id?)` / `cacheTags.calendar(id?)`.
- Messages, notifications, team logs → `no-store` (private, user-specific, frequently mutating).
- `team/me` cached `s-maxage=30, swr=120`, tagged `cacheTags.me()`.
- Profile/role changes call `revalidate(cacheTags.me())` in addition to team tags so `/api/team/me` refreshes.
- Training, calendar (where the table feeds compliance) call `revalidate(cacheTags.compliance())` on mutations.

---

## 5. Audit-log semantics

Every mutation calls `writeAudit({...})` with a namespaced action key:

| Resource | Action keys |
|---|---|
| training_course | `create / update / delete / assign` |
| training_employee | `create / update / delete` |
| training_enrollment | `create / update / delete` |
| training_certification | `create / update / delete` |
| training_category | `create / update / delete` |
| calendar_event | `create / update / delete` |
| calendar_event_type | `create / update / delete` |
| profile (team) | `team.invite / team.update / team.remove / team.permissions.update` |
| message_thread | `create / update / delete / participants.add / participants.remove / admin.promote / admin.demote` |
| message | `send` |
| notification | `create` |

No per-entity timeline tables exist for these resources in the current schema (e.g. there's no `training_activity_logs`), so only `audit_logs` is written. This matches the audits-reference pattern's "where one exists" caveat.

---

## 6. Deviations from the assignment brief

1. **No `training_enrollments` / `training_certifications` tables.** The schema (migration 010) has `employee_course_progress` instead, with a single row per `(employee_id, course_id)` carrying `status`, `progress`, `score`, `completed_date`, `due_date`. The API exposes "enrollments" as the raw `employee_course_progress` rows, and "certifications" as a filtered view (rows with `status='completed' AND completed_date IS NOT NULL`). The certifications create endpoint upserts the same row; the delete endpoint demotes the row back to `in_progress` rather than dropping it (preserves enrollment history).
2. **No dedicated `team:logs:view` permission.** The seed only ships `team:view / team:invite / team:edit / team:remove`. `/api/team/logs` gates on `team:view` to match the `user_activity_logs_select` RLS policy in migration 016.
3. **No dedicated `training:create / training:edit / training:delete` permissions.** Used the generic `create / edit / delete` perms (also what RLS in migration 016 uses for `training_courses` mutations).
4. **`POST /api/team/members/invite` requires `SUPABASE_SERVICE_ROLE_KEY`.** Returns HTTP 503 (`internal` code; message starts with `service_unavailable`) when the env var is absent. The flow:
   - `admin.auth.admin.createUser({ email_confirm: true })` with a 24-byte random password.
   - Upsert `profiles` row (`status='pending'`, `invited_by=<inviter>`).
   - Upsert `user_roles` row.
   - Optionally upsert `user_permissions` rows for explicit grants in the payload.
   - Fire `admin.auth.resetPasswordForEmail(email)` so the invitee can set a real password. Failure here is logged but non-fatal.
5. **MVP-only calendar.** Per the assignment direction, `/api/calendar/events` is the only calendar endpoint; cross-store aggregation from audits / observations / training / etc. stays client-side in `useCalendarEvents` (the hook merges this response with the data it already has from the other store fetches). A future Phase will expose a unified server-side aggregator if/when needed.
6. **`calendar_events.department_id` not implemented.** The current `calendar_events` schema has no department column or FK. `?department_id=` is accepted on the list query for forward-compat but is currently a no-op filter — documented inline in `app/api/calendar/events/route.ts`. A future migration may add a denormalized `department_id` column.
7. **`training_employees.department` is a TEXT label, not an FK.** The list endpoint resolves `?department_id=<uuid>` by looking up `departments.name_en` and filtering against that string. If the department's name doesn't match the value stored on the employee row, the filter misses. Long-term fix: migrate `training_employees.department` to `department_id UUID REFERENCES departments(id)`.
8. **`message_threads` has no `name` column** — the schema uses `subject`. The `CreateMessageThreadSchema.name` field maps to `subject` in the insert, and `UpdateMessageThreadSchema.name` patches `subject`. The DELETE handler uses hard delete (no `deleted_at` column on `message_threads` in the current schema).
9. **`profiles.deleted_at` is the soft-delete column.** Migration 002 includes it. `team/members` DELETE sets `status='inactive' AND deleted_at=now()` and leaves the `auth.users` row intact (per assignment instruction).
10. **Notifications create endpoint uses upsert on `(user_id, dedupe_key)`.** Conflicts return the existing row with 200; this gives the future notification engine cron job idempotency without requiring two round trips.

---

## 7. Open TODOs (out of scope for this assignment)

- **Saudization metrics endpoints** (`GET/PUT /api/training/saudization`) — separate concern; not in the assigned endpoint list. Owned by a future cron / settings phase.
- **Training overview stats** (`GET /api/training/overview`) — derived/aggregate; better served via a Postgres view (`v_training_overview_stats`) or a cached materialized view. Punt to a dedicated reporting phase.
- **Training CSV upload** (`POST /api/training/employees/import`) — needs file-handling design (streaming + per-row validation + storage path). Out of MVP scope per the spec.
- **Unified calendar aggregator** (single endpoint returning audits + observations + risks + … + training + calendar events). Client-side aggregation is the MVP choice; a server-side endpoint would deduplicate Vercel function invocations on the `/calendar` page.
- **Message thread leave/exit endpoint** — currently a user can only be removed by an admin via `DELETE /participants/[userId]`. A self-leave action is nice-to-have.
- **Message read-receipts** — schema has `messages.read` boolean but the API does not yet expose a "mark message read" endpoint. Thread-level unread_count is maintained on the participants row.
- **Notification cron job** (`notification.generate`) — referenced by BACKEND-API-MAP §9. The admin POST endpoint exists to receive its output; the job itself ships in Phase 9.
- **Per-user permissions revocation** — `PATCH /api/team/members/[userId]/permissions` only upserts. Setting `granted=false` is supported (the row stays but with `granted=false`); deleting the row entirely is a future enhancement if needed.
- **`team:invite` permission seed** — already present in migration 018; verified.
- **Pre-existing TS error**: `src/lib/api/services/letters.ts:47` mixes `??` and `||`. Out of this agent's scope (letters belongs to another agent). Reported only so it's not mistaken for a new regression.
