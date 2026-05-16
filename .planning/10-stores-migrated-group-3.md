# Group 3 — Stores Migrated (Phase 5)

Status: **all 8 stores migrated to server-state**. `npx tsc --noEmit` is clean across the 8 files; the 13 remaining repo-wide errors are in files owned by Groups 1 / 2 (correspondence-type / sama-letter / sub-category / circular / authority-department category stores) — flagged but out of this group's scope.

## Stores migrated

### 1. `useTrainingStore` — `src/stores/training-store.ts`
- Two sub-domains kept side-by-side:
  - **Compliance-engine slice** (`trainings: Training[]`) — no backend route ships yet; methods are local-only stubs so consumers (`useComplianceScore`, `useDashboardHealth`) keep compiling. `fetchAll()` recomputes pagination from the in-memory list and refreshes the team-page slice in the background.
  - **Team-training page slice** — `courses`/`employees` are now server-backed via `/api/training/courses` and `/api/training/employees`; `addCourse` / `updateCourse` / `removeCourse` / `addEmployee` / `updateEmployee` / `removeEmployee` are optimistic + fire-and-forget; `bulkAssignCourse` calls `POST /api/training/courses/[id]/assign` when the course id is a server UUID.
  - `saudizationMetrics`, `departmentProgress`, `overviewStats` stay client-derived (`recalculateDepartmentProgress` / `recalculateOverviewStats` unchanged).
- `persist` + `seedEmployees` / `seedCourses` / `seedSaudizationMetrics` / `seedDepartmentProgress` / `seedOverviewStats` deleted.

### 2. `useTrainingCategoryStore` — `src/stores/training-category-store.ts`
- Maps `/api/training/categories`. Server row's `key` becomes the store `id` (so legacy `course.category === 'aml'` keeps matching); server `id` UUID carried as `uuid` for PATCH/DELETE.
- `add` / `update` / `remove` kept sync-shaped (return `string`, return `void`) for `EditableSelect` compatibility — optimistic local mutation + background API call. Errors surface via `error`.
- `resetToDefaults` is now a refetch shim.
- Persist + 13-entry seed array deleted.

### 3. `useCalendarStore` — `src/stores/calendar-store.ts`
- Maps `/api/calendar/events` (collection + detail + PATCH + soft-delete). The unified-calendar view aggregation stays in `useCalendarEvents` hook (untouched) — this store only owns user-created `calendar_events` rows.
- `createEvent` / `updateEvent` / `deleteEvent` kept sync-shaped (return `CalendarEvent` / `CalendarEvent | null` / `void`) since `edit-event-modal` consumes the return. Optimistic local mutation + background API call; rollback on failure with `error` surfaced.
- Local-only `selectedEvent`, `selectedDate`, `view`, `filters` retained as ephemeral UI state.
- Persist + v2 migration deleted.

### 4. `useCalendarEventTypeStore` — `src/stores/calendar-event-type-store.ts`
- Same pattern as training categories — maps `/api/calendar/event-types`, server `key` → store `id`, UUID → `uuid`. Sync-shaped `add/update/remove`.
- Persist + 4-entry seed deleted.

### 5. `useTeamStore` — `src/stores/team-store.ts`
- Maps `/api/team/members` (list/detail/PATCH/DELETE) and `/api/team/members/invite` (admin-creates-user).
- Role translation at the store boundary: API `{viewer, auditor, compliance_officer, org_admin}` ↔ TS `{officer, manager, admin}` via `roleApiToTs` / `roleTsToApi`. Legacy callers using `'officer'` / `'manager'` / `'admin'` keep compiling.
- `invite` surfaces the service-role 503 verbatim (`SUPABASE_SERVICE_ROLE_KEY` unset → error message tells the operator what to configure).
- `assignments`, `accessControls`, `burnoutSince` remain **client-only** fields merged into the API-derived row in `mapProfileRow` (no API endpoint exists yet). Legacy `unassignTask`, `reassignTask`, `updateBurnoutTimestamps` stay as local-only mutations.
- `updateRole` and `remove` continue to write `team.member_role_changed` / `team.member_removed` audit logs via `useUserLogStore.log()`.
- Persist + 5-member sample array deleted.

### 6. `useMessageStore` — `src/stores/message-store.ts`
- Maps `/api/messages/threads/*` family. `fetchAll` walks the threads list and hydrates each thread's participants via `GET /messages/threads/[id]`.
- `createThread` accepts an optional `groupName` (7th arg) so the message-panel's "compose with group name" flow now lands on the server in one shot via the schema's `name` field. Sync return preserves the immediate `threadId` consumed by `message-panel`.
- `sendMessage`, `markThreadAsRead`, `deleteThread`, `kickMember`, `promoteAdmin`, `demoteAdmin`, `addMembersToThread`, `updateThreadSubject`, `updateThreadAvatar` are all optimistic + background API. Local `local-<uuid>` thread/message ids are detected so retries for in-flight rows don't hit the API.
- Participant names hydrated lazily from `useTeamStore.byId` (falls back to the user id when the team cache is empty).
- Persist + `SEED_THREADS` / `SEED_MESSAGES` deleted (8 messages, 3 threads).

### 7. `useNotificationStore` — `src/stores/notification-store.ts`
- Maps `/api/notifications` (list/POST/DELETE/mark-read/mark-all-read). `fetchNotifications` replaces the legacy local mutation as the canonical entrypoint.
- `markAsRead`, `markAllAsRead`, `deleteNotification`, `clearAll` are optimistic + background API with rollback. `addNotification` is local-only (the API requires `user_id`; callers who need server-persisted notifications hit `POST /api/notifications` directly).
- `syncGeneratedNotifications` is now a **no-op** kept as a shim so `useNotificationEngine` keeps compiling — the engine will be retired in a later phase (per the task brief).
- Persist + v3 migrate-to-empty deleted (already started empty in v3).

### 8. `useUserLogStore` — `src/stores/user-log-store.ts`
- Kept the Phase-3 `mirrorAuthEventToSupabase` wiring (auth.* events still mirror to `user_activity_logs` via supabase client). Added `fetchLogs()` action that calls `GET /api/team/logs` and replaces `state.logs` with the server view for the admin "User Logs" page.
- `log()` and `addLog()` keep writing to local state for instant UI feedback.
- `UserLog.id` kept as `number` (legacy contract — table page indexes by it). Server uuids hashed via a deterministic 32-bit `hashId()` so the page's `useState<number[]>(expandedLogs)` keeps working.
- Persist + 15-entry seed array deleted.

## Special notes / deviations

- **Calendar aggregation untouched.** As instructed, `useCalendarEvents` continues to merge `calendarEvents` (from this store) with deadlines pulled from audit / observation / policy / sama-letter / circular / training / correspondence / advisory / risk stores. Once those stores are migrated by their groups, this hook keeps working — it just reads server-backed data instead of seeded data.
- **`useNotificationEngine` retained.** Per the brief, the engine still runs but its writes via `syncGeneratedNotifications` are silently dropped. Engine retirement deferred.
- **`useTeamStore.invite` service-role gate.** When `SUPABASE_SERVICE_ROLE_KEY` is unset the route returns 503; the store surfaces the message verbatim so toast notifications guide configuration.
- **`accessControls` / `assignments` / `burnoutSince` still client-only.** No `/api/team/members/[id]/permissions` consumer was wired through `useTeamStore.update`; the existing `AccessMatrixSection` page calls `update(id, { accessControls })` which patches in-memory. Phase 6+ should wire these to `PATCH /team/members/[id]/permissions`.
- **Roles translated at boundary.** Legacy TS `'officer' | 'manager' | 'admin'` remains the type of `TeamMember.role`; API enum `'viewer' | 'auditor' | 'compliance_officer' | 'org_admin'` is mapped in `roleApiToTs` / `roleTsToApi`. No consumer file touched.

## TypeScript check

```
$ npx tsc --noEmit
```

13 errors remaining — **all in files owned by Groups 1 / 2** (correspondence-type, sama-letter, sub-category, circular, authority-department). My 8 store files are clean:

```
$ npx tsc --noEmit 2>&1 | grep -E "(training-store|training-category-store|calendar-store|calendar-event-type-store|team-store|message-store|notification-store|user-log-store)"
(no output — 0 errors)
```

Cross-group cleanup needed: Groups 1 / 2 sync-vs-async `add` action signatures — their `EditableSelect` consumers (`correspondence/feed/page.tsx`, `correspondence/letters/page.tsx`, `CreateLetterForm.tsx`, `EditableAuthorityDeptField.tsx`, `TemplateEditForm.tsx`, `RegisterCircularModal.tsx`, `ListsAndCategoriesSection.tsx`) expect `(label) => string | void` but receive `(label) => Promise<string>`.
