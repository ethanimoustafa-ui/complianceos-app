# Pages → Stores Map (33 Next.js routes)

Per-route mapping of Zustand stores consumed, deep-link params read via `useSearchParams`, and notable load-bearing details (pagination, redirects, modals, sub-routes).

---

## Auth routes

### `src/app/(auth)/forgot-password/page.tsx`
- **Route:** `/forgot-password`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Pure local state form (react-hook-form + zod). 60s resend cooldown. TODO comments for real API call. No store; sends email then shows success panel.

### `src/app/(auth)/onboarding/page.tsx`
- **Route:** `/onboarding`
- **Stores used:** `useFrameworkConfigStore`, `useOnboardingIndustryStore`, `useOnboardingRegionStore`, `useOnboardingHeadcountStore`
- **Deep-link params:** _(none)_
- **Notable:** Multi-step wizard. Reads `useFrameworkConfigStore.getState()` imperatively (line 159). CRUD on industries/regions/headcount via store add/update/remove. Frameworks are read-only listing.

### `src/app/(auth)/sign-in/page.tsx`
- **Route:** `/sign-in`
- **Stores used:** `useAuthStore` (login action, isAuthenticated)
- **Deep-link params:** _(none)_
- **Notable:** Form-based credential login; redirects when `isAuthenticated` flips true.

### `src/app/(auth)/sign-up/page.tsx`
- **Route:** `/sign-up`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Pure local form. Password-strength meter (local fn). On submit: simulates delay then `router.push('/verify-email?email=...')`. No persistence.

### `src/app/(auth)/verify-email/page.tsx`
- **Route:** `/verify-email`
- **Stores used:** _(none)_
- **Deep-link params:** `?verified=true`, `?token=<jwt>`, `?email=<email>`
- **Notable:** Branches on `verified===true` to show success state. Token used to call verification endpoint (currently mocked). Falls back to "your email" placeholder.

---

## Dashboard root + redirects

### `src/app/page.tsx`
- **Route:** `/`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server component. `redirect('/dashboard')`.

### `src/app/welcome/page.tsx`
- **Route:** `/welcome`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Marketing/portal landing. Uses `sessionStorage.setItem('fromWelcome','true')` then `router.push('/dashboard')` after a 950ms animation.

### `src/app/(dashboard)/correspondence/page.tsx`
- **Route:** `/correspondence`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/correspondence/feed')`.

### `src/app/(dashboard)/correspondence/regulatory-updates/page.tsx`
- **Route:** `/correspondence/regulatory-updates`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/correspondence/regulatory-updates/rules')`.

### `src/app/(dashboard)/observations/page.tsx`
- **Route:** `/observations`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/correspondence/observations')`.

### `src/app/(dashboard)/regulatory-updates/page.tsx`
- **Route:** `/regulatory-updates`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/correspondence/regulatory-updates')` (legacy alias).

### `src/app/(dashboard)/sama-letters/page.tsx`
- **Route:** `/sama-letters`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/correspondence/letters')` (legacy alias).

### `src/app/(dashboard)/team/page.tsx`
- **Route:** `/team`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/team/directory')`.

### `src/app/(dashboard)/reports/page.tsx`
- **Route:** `/reports`
- **Stores used:** _(none)_
- **Deep-link params:** _(none)_
- **Notable:** Server `redirect('/reports/compliance-review')`.

---

## Dashboard main pages

### `src/app/(dashboard)/dashboard/page.tsx`
- **Route:** `/dashboard`
- **Stores used:** `useUserPreferencesStore` (selector: `dashboardView`)
- **Deep-link params:** _(none)_
- **Notable:** Branches on `dashboardView` preference to render one of multiple dashboard layouts (executive/compliance/etc.). Pulls actual data from child components.

### `src/app/(dashboard)/calendar/page.tsx`
- **Route:** `/calendar`
- **Stores used:** _(none directly)_ — data via `useCalendarEvents` hook (which internally aggregates stores)
- **Deep-link params:** _(none)_
- **Notable:** Local state for `viewMode` (month/year/submissions), `calendarType` (gregorian/hijri), `selectedSourceTypes` Set filter, `submissionGroupBy` (date/month/year). Modals: DatePickerModal, CreateEventModal, EventDrawer.

### `src/app/(dashboard)/settings/page.tsx`
- **Route:** `/settings`
- **Stores used:** _(none directly)_ — child sections each consume their own stores (Frameworks, Notifications, Templates, ListsAndCategories, AccessMatrix, etc.)
- **Deep-link params:** _(none)_
- **Notable:** Gated by `<Gate perm="Manage Settings">` with `ForbiddenPanel` fallback. Composition of 8 settings sub-sections. "Auto-save active" indicator (no real autosave logic at page level).

---

## Correspondence

### `src/app/(dashboard)/correspondence/feed/page.tsx`
- **Route:** `/correspondence/feed`
- **Stores used:** `useCorrespondenceStore`, `useCircularStore`, `useSAMALetterStore`, `useRiskStore`, `useTeamStore`, `useObservationStore`, `usePolicyStore`, `useTrainingStore`, `useAuthStore`, `useUserPreferencesStore`, `useFrameworkConfigStore`, `useCorrespondenceTypeStore`
- **Deep-link params:** `?id=<itemId>` (line 260) — opens specific feed item
- **Notable:** Massive aggregator page (~1300+ lines). Reads `useUserPreferencesStore.getState().dateFormat` for formatting. Reads framework list at line 1254. CRUD on correspondence types inline.

### `src/app/(dashboard)/correspondence/advisory/page.tsx`
- **Route:** `/correspondence/advisory`
- **Stores used:** `useAdvisoryStore`, `useTeamStore`, `useAuthStore`, `useDepartmentStore`
- **Deep-link params:** `?id=<advisoryId>` (line 153) — opens selected advisory request
- **Notable:** Reads `useAdvisoryStore.getState()` imperatively after mutations to refresh selected (line 711). Department CRUD inline shared with Settings.

### `src/app/(dashboard)/correspondence/letters/page.tsx`
- **Route:** `/correspondence/letters`
- **Stores used:** `useSAMALetterStore`, `useAuthStore`, `useSAMATemplateStore`, `useTeamStore`, `useFrameworkConfigStore`, `useSAMALetterTypeStore`
- **Deep-link params:** `?id=<letterId>` (line 437)
- **Notable:** PDF export via jsPDF (`pdf.internal.pageSize.getWidth()` at line 507). Letter type filter bound to `useSAMALetterTypeStore` (BUG-R3-05 note). Template-driven letter creation.

### `src/app/(dashboard)/correspondence/observations/page.tsx`
- **Route:** `/correspondence/observations`
- **Stores used:** `useObservationStore` (destructured full slice), `useAuthStore` (user)
- **Deep-link params:** `?id=<observationId>` (line 110)
- **Notable:** Destructures most of `useObservationStore` slice at line 41.

### `src/app/(dashboard)/correspondence/registry/page.tsx`
- **Route:** `/correspondence/registry`
- **Stores used:** `useCircularStore`, `usePolicyStore`
- **Deep-link params:** _(none)_
- **Notable:** Unified registry view. Two `setSelected` actions aliased (setSelectedCircular, setSelectedPolicy) to navigate into rules/policies pages.

### `src/app/(dashboard)/correspondence/regulatory-updates/rules/page.tsx`
- **Route:** `/correspondence/regulatory-updates/rules`
- **Stores used:** `useCircularStore`
- **Deep-link params:** `?id=<circularId>` (line 66, named `deepLinkId`)
- **Notable:** Pagination via `paginate(filteredCirculars, currentPage, PAGE_SIZE)` with `PAGE_SIZE = 10` (line 53). Shows "Showing X–Y of Z".

### `src/app/(dashboard)/correspondence/regulatory-updates/policies/page.tsx`
- **Route:** `/correspondence/regulatory-updates/policies`
- **Stores used:** `useAuthStore`, `usePolicyStore`, `usePolicyTemplateStore`, `useTeamStore`, `useDepartmentStore`, `usePolicyCategoryStore`
- **Deep-link params:** `?policyId=<id>`, `?tab=<tabName>` (lines 155–156)
- **Notable:** Pagination `PAGE_SIZE = 10` (line 172). Increments `policyTemplate.usage` on template selection. Inline department + category CRUD shared with Settings. Reads `useDepartmentStore.getState().departments` imperatively at line 472.

---

## Reports

### `src/app/(dashboard)/reports/(tabs)/audits/page.tsx`
- **Route:** `/reports/audits`
- **Stores used:** `useAuditStore` (audits, fetchAll, delete)
- **Deep-link params:** _(none)_
- **Notable:** Calls `fetchAudits()` on mount. AuditCategory widened to string (managed via `useAuditCategoryStore` per comment, but not consumed here).

### `src/app/(dashboard)/reports/(tabs)/compliance-review/page.tsx`
- **Route:** `/reports/compliance-review`
- **Stores used:** `useCircularStore`, `usePolicyStore`, `useDepartmentStore`, `useComplianceEvaluationStore` (evaluations + setVerdict), `useAuthStore` (user)
- **Deep-link params:** _(none — uses local `safePage` state)_
- **Notable:** Pagination `PAGE_SIZE = 10` (line 45). Computes `from`/`to` for "Showing X–Y of Z" UI (lines 421-422). Default landing under `/reports`.

### `src/app/(dashboard)/reports/(tabs)/detailed/page.tsx`
- **Route:** `/reports/detailed`
- **Stores used:** `useAuditLogStore` (logs)
- **Deep-link params:** _(none)_
- **Notable:** Audit log viewer; minimal store usage (just `logs` slice).

### `src/app/(dashboard)/reports/(tabs)/executive/page.tsx`
- **Route:** `/reports/executive`
- **Stores used:** `useAuditStore` (audits + fetchAll), `useRiskStore` (risks), `useFrameworkConfigStore` (frameworks)
- **Deep-link params:** _(none)_
- **Notable:** Calls `fetchAudits()` to hydrate audits. Aggregates audit+risk+framework data for exec dashboard widgets.

### `src/app/(dashboard)/reports/(tabs)/risks/page.tsx`
- **Route:** `/reports/risks`
- **Stores used:** `useRiskStore` (very wide surface — create/update/updateStatus/delete + mitigation CRUD + dept workflow), `useTeamStore`, `useDepartmentStore`, `useAuthStore`, `useRiskCategoryStore`
- **Deep-link params:** `?id=<riskId>` (line 268, captured into `deepLinkIdRef`)
- **Notable:** Heavy department-workflow actions: `sendToDepartment`, `submitDepartmentPlan`, `acceptDepartmentPlan`, `toggleDepartmentPlanItem`. Risk category and department CRUD inline.

### `src/app/(dashboard)/reports/[auditId]/page.tsx`
- **Route:** `/reports/[auditId]`
- **Stores used:** `useAuditStore`, `useAuditLogStore`, `useAuditTaskStore`, `useTeamStore`, `useAuthStore`, `useFrameworkConfigStore`
- **Deep-link params:** _(none from `useSearchParams` — id comes from dynamic route segment)_
- **Notable:** Calls `fetchById(auditId)` on mount. Surface includes addDocument/removeDocument, addTeamMember/removeTeamMember, addComment/editComment/deleteComment, updateStatus. Sub-task store accessed via `useAuditTaskStore()` whole-store handle.

---

## Team

### `src/app/(dashboard)/team/directory/page.tsx`
- **Route:** `/team/directory`
- **Stores used:** `useTeamStore` (members + update)
- **Deep-link params:** _(none)_
- **Notable:** Calls `useTeamStore.getState()` imperatively at line 482 for fresh members snapshot during a mutation.

### `src/app/(dashboard)/team/logs/page.tsx`
- **Route:** `/team/logs`
- **Stores used:** `useUserLogStore` (logs), `useTeamStore` (members + update)
- **Deep-link params:** _(none)_
- **Notable:** Joins user-log entries with team member records for display.

### `src/app/(dashboard)/team/training/page.tsx`
- **Route:** `/team/training`
- **Stores used:** `useTrainingStore` (very wide: employees, courses, saudizationMetrics, departmentProgress, overviewStats + addCourse/removeCourse/updateCourse, assignCourseToEmployee, bulkAssignCourse, updateSaudizationMetrics, updateOverviewStats, importUploadData, recalculateDepartmentProgress)
- **Deep-link params:** `?employeeId=<id>` (line 93) — pre-opens employee detail
- **Notable:** Imperatively reads `useTrainingStore.getState()` after a mutation to look up updated employee record (lines 142, 146). Bulk CSV import path via `importUploadData`.

---

## Summary

- **Routes using stores:** 21
- **Pure redirect routes:** 7 (`/`, `/correspondence`, `/correspondence/regulatory-updates`, `/observations`, `/regulatory-updates`, `/sama-letters`, `/team`, `/reports`)
- **Auth/local-form routes (no stores):** 4 (`/forgot-password`, `/sign-up`, `/verify-email`, `/welcome`)
- **Routes reading `?id=`:** correspondence/feed, advisory, letters, observations, regulatory-updates/rules, reports/risks
- **Other deep-link params:** policies (`policyId`, `tab`), training (`employeeId`), verify-email (`verified`, `token`, `email`)
- **Routes with paginated lists (`PAGE_SIZE = 10`):** rules, policies, compliance-review
- **Routes calling `useXStore.getState()` imperatively:** onboarding (framework), advisory, team/directory, training, policies (department), correspondence/feed (preferences)
