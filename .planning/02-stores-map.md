# Stores Map (Zustand → Supabase)

Source dir: `src/stores/` (42 store files; `sama-sub-category-store.ts` is a re-export shim of `framework-sub-category-store.ts`, so 41 unique stores).

Shared conventions used across nearly every store:
- All persisted stores use `zustand/middleware`'s `persist` with a unique localStorage `name`.
- Many actions are gated by `requirePermission(...)` from `@/lib/rbac-store-gate` — gate failures throw and emit `auth.permission_denied` audit logs via `useUserLogStore.log()`.
- "Sync vs async": almost every action is **synchronous** mutation against in-memory state; a handful (`audit/observation/risk/training/team/report.fetchAll/fetchById/create/update/delete`) `await new Promise(setTimeout, 500)` to mimic latency but do **no real I/O**.
- Ephemeral UI state present on every list-style store and **must stay client-side** post-backend: `isLoading`, `error`, `selectedXxx`, `filters`, `sort`, `pagination`, plus generic `setFilters`/`setSort`/`setPage`/`setPageSize`/`setSelected` setters.
- Cross-store reads use `useXStore.getState()` — they are not React-subscribed.

---

## 1. `useAuthStore`
- **File**: `src/stores/auth-store.ts`
- **Persist key**: `auth-storage` (version 5)
- **State**:
  ```ts
  { user: User | null; token: string | null; isAuthenticated: boolean;
    isLoading: boolean; error: string | null; originalUserId?: string }
  ```
- **Actions**:
  - `login(email, password)` → **async** (fake 400ms delay). Matches email against `SEED_USERS`. Mutates `user/token/isAuthenticated/originalUserId`. **Side effects**: `useUserLogStore.log({action:'auth.login'})`.
  - `logout()` sync. Clears all auth fields. Side effect: logs `auth.logout` before clearing.
  - `refreshToken()` async no-op stub. Sets a new demo token or clears session.
  - `updateProfile(Partial<User>)` sync; merges into `user`.
  - `setUser/setToken/setLoading/setError/clearError` plain setters.
  - `switchUser(userId)` sync (RBAC-024 Acting-As). Throws if unknown. Side effect: logs `auth.switch_user`.
- **Seeds**: `SEED_USERS` = 6 users (`admin` + ids `'1'..'5'`) mirroring `team-store` seed members.
- **Cross-store deps**: writes → `useUserLogStore`.
- **Persist migrations**:
  - v3→v4: rewrite `id: 'current-user'` → `id: 'admin'`.
  - v4→v5: backfill `originalUserId` from current user id or `'admin'`.
- **BACKEND IMPLICATIONS**
  - (a) Maps to Supabase **auth.users** + a `profiles` table (id, name, email, role, department, avatar_seed, phone, workload, permissions, last_login, created_at) — Supabase Auth holds credentials; profile rows mirror `User` shape.
  - (b) Endpoints: `login` → `supabase.auth.signInWithPassword`; `logout` → `supabase.auth.signOut`; `updateProfile` → PATCH /profiles/:id; `switchUser` is **demo-only** — remove or guard behind a service-role admin endpoint.
  - (c) Indexes: `profiles.email` (unique), `profiles.role`, `profiles.department`.
  - (d) Client-only: `isLoading`, `error`, `originalUserId` (debug aid).

---

## 2. `useLanguageStore`
- **File**: `src/stores/language-store.ts`
- **Persist key**: `language-storage` (no version)
- **State**: `{ language: 'en'|'ar'; direction: 'ltr'|'rtl' }`
- **Actions** (all sync): `setLanguage(lang)`, `toggleLanguage()`.
- **Seeds**: defaults `en/ltr`.
- **Cross-store deps**: none.
- **BACKEND IMPLICATIONS**
  - (a) Persist in `profiles.preferred_language` column (or `user_preferences.language`).
  - (b) Single PATCH endpoint on profile.
  - (c) No index needed.
  - (d) Direction is derived — keep client-only.

---

## 3. `useHelpStore`
- **File**: `src/stores/help-store.ts`
- **Persist key**: `help-storage` (no version; partialize **only persists `recentlyViewed`**)
- **State**: `{ articles: HelpArticle[]; recentlyViewed: string[] }`
- **Actions** (sync): `searchArticles(q)`, `getByCategory(cat)`, `getArticle(id)`, `trackView(id)` (capped at 10).
- **Seeds**: 10 hard-coded help articles (Getting Started, Calendar, Reports, Compliance, Team, Settings).
- **Cross-store deps**: none.
- **BACKEND IMPLICATIONS**
  - (a) `help_articles` table (id, title, summary, category, content, icon) — likely **read-only / CMS-managed**. `recently_viewed` per user via a `user_help_views(user_id, article_id, viewed_at)` table.
  - (b) Endpoints: GET /help-articles, POST /help-views.
  - (c) Indexes: `help_articles.category`, `user_help_views(user_id, viewed_at desc)`.
  - (d) `articles` array can stay client-cached.

---

## 4. `useComplianceSettingsStore`
- **File**: `src/stores/compliance-settings-store.ts`
- **Persist key**: `compliance-settings-storage` (no version)
- **State**: `{ weights: ComponentWeights; targetScore: number }`
  - `ComponentWeights = { auditCompletion, observationClosure, riskPosture, policyCurrency, trainingCompletion }` — must sum to 100 inside per-key bounds.
- **Actions** (sync): `setWeight(component, value)` returns bool, `resetWeights()`, `setTargetScore(n)`, `getConfig()`, `isValid()`.
- **Seeds**: defaults 25/25/20/15/15, target 90.
- **Cross-store deps**: read by `compliance-engine` lib.
- **BACKEND IMPLICATIONS**
  - (a) `org_compliance_settings` row (single org-level row): `weights JSONB`, `target_score INT`.
  - (b) PATCH /compliance-settings.
  - (c) No index — singleton.
  - (d) None.

---

## 5. `useOnboardingRegionStore`
- **File**: `src/stores/onboarding-region-store.ts`
- **Persist key**: `onboarding-region-storage` (v1)
- **State**: `{ regions: OnboardingRegion[] }` where `OnboardingRegion = { id; label; labelAr; isDefault? }`.
- **Actions** (sync, all `requirePermission('Configure Lists & Categories')`): `add(label, labelAr?)→id` (slugified, collision-suffixed), `update(id, patch)`, `remove(id)` (only non-default).
- **Seeds**: 4 KSA regions (riyadh, makkah, eastern, other).
- **BACKEND IMPLICATIONS**
  - (a) `onboarding_regions` table (id text PK, label, label_ar, is_default).
  - (b) POST/PATCH/DELETE /onboarding-regions.
  - (c) Index on `is_default`.
  - (d) None.

---

## 6. `useOnboardingIndustryStore`
- **File**: `src/stores/onboarding-industry-store.ts`
- **Persist key**: `onboarding-industry-storage` (v1)
- **State + actions**: identical shape to `useOnboardingRegionStore` but `industries` array.
- **Seeds**: 5 industries (government, banking, energy, healthcare, technology).
- **BACKEND**: `onboarding_industries` table — same as regions.

---

## 7. `useOnboardingHeadcountStore`
- **File**: `src/stores/onboarding-headcount-store.ts`
- **Persist key**: `onboarding-headcount-storage` (v1)
- **State + actions**: identical shape; `buckets` array.
- **Seeds**: 4 buckets (1-20, 21-100, 101-500, 500+).
- **BACKEND**: `onboarding_headcount_buckets` table.

---

## 8. `useDepartmentStore`
- **File**: `src/stores/department-store.ts`
- **Persist key**: `department-storage` (no version)
- **State**: `{ departments: Department[] }` where `Department = { id; name; nameAr; isDefault }`.
- **Actions** (sync, gated `Configure Lists & Categories`): `addDepartment(name, nameAr)→Department`, `removeDepartment(id)`, `updateDepartment(id, patch)`, `getDepartments()`, `getDepartmentById(id)`.
- **Seeds**: 10 default departments (compliance, it-cybersecurity, finance, risk-management, legal, security-operations, hr, sharia-compliance, aml-ctf, business-dev).
- **Cross-store deps**: referenced by `policy-store` (businessOwnerDepartmentId, affectedDepartments), `risk-store` (intendedDepartmentId), `auth-store` user dept, `team-store`.
- **BACKEND IMPLICATIONS**
  - (a) `departments` table (id text PK, name, name_ar, is_default).
  - (b) POST/PATCH/DELETE /departments.
  - (c) Index `is_default`; FK targets from policies/risks/users — index those FKs too.
  - (d) None.

---

## 9. `useBusinessUnitStore`
- **File**: `src/stores/business-unit-store.ts`
- **Persist key**: `business-unit-storage` (v1)
- **State**: `{ units: BusinessUnitOption[] }` (id/label/labelAr/isDefault).
- **Actions** (sync, gated): `add/update/remove`.
- **Seeds**: 7 BUs (corporate_banking, compliance, it, risk_management, finance, operations, hr).
- **Cross-store deps**: referenced by `advisory-store` (`businessUnit`).
- **BACKEND**: `business_units` table; same shape; indexes on FK from `advisory_requests.business_unit_id`.

---

## 10. `useCalendarEventTypeStore`
- **File**: `src/stores/calendar-event-type-store.ts`
- **Persist key**: `calendar-event-type-storage` (v1)
- **State**: `{ types: CalendarEventType[] }` (id/label/labelAr/isDefault).
- **Actions** (sync, gated): `add/update/remove`.
- **Seeds**: 4 (meeting, deadline, submission, review).
- **Cross-store deps**: referenced by `calendar-store` (`CalendarEvent.type`).
- **BACKEND**: `calendar_event_types` table.

---

## 11. `useCorrespondenceTypeStore`
- **File**: `src/stores/correspondence-type-store.ts`
- **Persist key**: `correspondence-type-storage` (v1)
- **State**: `{ types: CorrespondenceType[] }`.
- **Actions** (sync, gated): `add/update/remove`.
- **Seeds**: 7 types (sama, cma, internal, external_auditor, sharia_board, vendor, other).
- **Cross-store deps**: referenced by `correspondence-store.type`.
- **BACKEND**: `correspondence_types` table.

---

## 12. `useSAMALetterTypeStore`
- **File**: `src/stores/sama-letter-type-store.ts`
- **Persist key**: `sama-letter-type-storage` (v1, with **migrate** that re-merges seeds so the four defaults always exist).
- **State**: `{ types: SAMALetterTypeItem[] }`.
- **Actions** (sync, gated): `add/update/remove`.
- **Seeds**: 4 (non-objection, inquiry, submission, notification).
- **Cross-store deps**: referenced by `sama-letter-store.type`, `sama-template-store.type`.
- **BACKEND**: `letter_types` table.

---

## 13. `useRiskCategoryStore`
- **File**: `src/stores/risk-category-store.ts`
- **Persist key**: `risk-category-storage` (v1, migrate re-merges seeds).
- **State**: `{ categories: RiskCategoryItem[] }` (id/label/labelAr/isDefault/color?).
- **Actions** (sync, gated): `add/update/remove/resetToDefaults`.
- **Seeds**: 5 (operational, financial, compliance, strategic, reputational).
- **Cross-store deps**: referenced by `risk-store.category`.
- **BACKEND**: `risk_categories` table.

---

## 14. `usePolicyCategoryStore`
- **File**: `src/stores/policy-category-store.ts`
- **Persist key**: `policy-category-storage` (v1, migrate re-merges seeds).
- **State**: `{ categories: PolicyCategoryItem[] }`.
- **Actions** (sync, gated): `add/update/remove/resetToDefaults`.
- **Seeds**: 6 (compliance, it, operations, risk, hr, finance).
- **Cross-store deps**: referenced by `policy-store.category`, `policy-template-store.category`.
- **BACKEND**: `policy_categories` table.

---

## 15. `useAuditCategoryStore`
- **File**: `src/stores/audit-category-store.ts`
- **Persist key**: `audit-category-storage` (v1, migrate re-merges seeds).
- **State**: `{ categories: AuditCategoryItem[] }`.
- **Actions** (sync, gated): `add/update/remove/resetToDefaults`.
- **Seeds**: 6 (security_compliance, financial_compliance, regulatory_compliance, operational_compliance, hr_compliance, sharia_compliance) — uses **underscore** slugify (not dashes).
- **Cross-store deps**: referenced by `audit-store.category`.
- **BACKEND**: `audit_categories` table.

---

## 16. `useTrainingCategoryStore`
- **File**: `src/stores/training-category-store.ts`
- **Persist key**: `training-category-storage` (v1, migrate re-merges seeds).
- **State**: `{ categories: TrainingCategoryItem[] }`.
- **Actions** (sync, gated): `add/update/remove/resetToDefaults`.
- **Seeds**: 13 (compliance, aml, cybersecurity, sharia, risk, data-privacy, ethics, fraud-prevention, governance, operational-risk, business-continuity, sanctions, internal-audit).
- **Cross-store deps**: referenced by `training-store` (courses/employees).
- **BACKEND**: `training_categories` table.

---

## 17. `useScaleLabelsStore`
- **File**: `src/stores/scale-labels-store.ts`
- **Persist key**: `scale-labels-storage` (v1)
- **State**: 5 record maps (label-only overrides):
  ```ts
  { riskLikelihood, riskImpact, monitoringFrequency, auditFrequency, reviewCadence:
      Record<string, { en?: string; ar?: string }> }
  ```
- **Actions** (sync, gated): `setLabel(scale, key, lang, value)`, `resetLabel(scale, key)`, `getLabel(scale, key, lang)`.
- **Seeds**: empty maps — overrides only.
- **Cross-store deps**: read by risk/audit/policy display layers.
- **BACKEND IMPLICATIONS**
  - (a) `scale_label_overrides` table (org_id, scale TEXT, key TEXT, lang CHAR(2), value TEXT, PK composite).
  - (b) PUT/DELETE /scale-labels.
  - (c) Index `(scale, key, lang)`.
  - (d) None.

---

## 18. `useAuthorityDeptStore`
- **File**: `src/stores/authority-department-store.ts`
- **Persist key**: `authority-department-storage` (v1, migrate re-merges static `AUTHORITY_DEPARTMENTS` defaults).
- **State**: `{ byAuthority: Record<authorityId, AuthorityDept[]> }` where `AuthorityDept = { id; en; ar; email?; isSeed? }`.
- **Actions** (sync, gated): `getDepartments(authority)`, `addDepartment(authority, en, ar, email?)`, `updateDepartment`, `removeDepartment`, `setDepartmentEmail`.
- **Seeds**: from `@/lib/letter-authority` (per-authority list — SAMA, CMA, ZATCA, etc.).
- **Cross-store deps**: referenced by `sama-letter-store.samaDepartment`.
- **BACKEND**: `authority_departments` table (id, authority_id FK, en, ar, email, is_seed). Index `authority_id`.

---

## 19. `useNotificationStore`
- **File**: `src/stores/notification-store.ts`
- **Persist key**: `notification-storage` (v3, **migrate wipes** to empty array on every prior version).
- **State**: `{ notifications: AppNotification[]; unreadCount: number }`. `AppNotification`: id, title, message, type, sourceType?, route?, read, entityId?, dedupeKey?, createdAt.
- **Actions** (sync): `addNotification(omit id/createdAt/read)`, `markAsRead(id)`, `markAllAsRead()`, `deleteNotification(id)`, `clearAll()`, `syncGeneratedNotifications(generated[])` (merges by `dedupeKey`, preserves read state).
- **Seeds**: empty.
- **Cross-store deps**: written by countless other stores indirectly (`notification-engine` lib consumes data and pushes via `syncGeneratedNotifications`).
- **BACKEND IMPLICATIONS**
  - (a) `notifications(id, user_id, title, message, type, source_type, route, entity_id, dedupe_key, read, created_at)`.
  - (b) POST /notifications, PATCH /notifications/:id (read), DELETE; `syncGeneratedNotifications` becomes a server-side cron or trigger that upserts on `(user_id, dedupe_key)`.
  - (c) Indexes: `(user_id, read, created_at desc)`, **unique** `(user_id, dedupe_key)`.
  - (d) `unreadCount` should be a server-computed COUNT or client-derived from list.

---

## 20. `useUserPreferencesStore`
- **File**: `src/stores/user-preferences-store.ts`
- **Persist key**: `user-preferences-storage` (v2)
- **State**: `{ dashboardView; timezone; dateFormat; notificationPreferences }` (see types/index.ts).
- **Actions** (all sync setters/togglers): `setDashboardView`, `setTimezone`, `setDateFormat`, `toggleModuleNotification(module)`, `toggleEventNotification(event)`, `setNotificationScope`, `setEmailDigest`, `setEmailDigestAddress`, `setSlackEnabled`.
- **Seeds**: defaults — executive view, Asia/Riyadh, DD/MM/YYYY, all module+event toggles ON, scope='own', email/slack OFF.
- **Persist migrations**: v1→v2 lifts top-level email/slack fields into `notificationPreferences`.
- **BACKEND**: `user_preferences(user_id PK, dashboard_view, timezone, date_format, notification_preferences JSONB)`.

---

## 21. `useUserLogStore`
- **File**: `src/stores/user-log-store.ts`
- **Persist key**: `user-log-storage` (v1)
- **State**: `{ logs: UserLog[] }`. `UserLog` = id, timestamp, user, action, detailsKey, ipAddress, device, location, status, userId?, target?, metadata?.
- **Actions** (sync): `addLog(omit id)`, `log(RBACDeniedLogEntry)` (compact normalised entry used by RBAC gates and Phase 7 emitters), `getLogsByUserId(uid)`, `clearLogs()`.
- **Seeds**: 15 sign_in/sign_out/permission_change/etc. demo entries.
- **Cross-store deps**: **written by** auth-store, team-store, policy-store, sama-letter-store, and the RBAC gate (`@/lib/rbac-store-gate`) on any permission-denied event.
- **BACKEND IMPLICATIONS**
  - (a) `audit_logs(id BIGSERIAL, timestamp, user_id FK, action, details_key, ip_address INET, device, location, status, target TEXT, metadata JSONB)`.
  - (b) POST /audit-logs (insert-only, server-side write from triggers preferred).
  - (c) Indexes: `(user_id, timestamp desc)`, `(action, timestamp desc)`, `(target)`.
  - (d) None — this **is** the source of truth.

---

## 22. `useFrameworkSubCategoryStore` (alias: `useSAMASubCategoryStore`)
- **File**: `src/stores/framework-sub-category-store.ts` (`sama-sub-category-store.ts` is just a re-export).
- **Persist key**: `sama-sub-category-storage` (v2; migrate backfills `frameworkId:'sama'` for v1 entries).
- **State**: `{ subCategories: SubCategory[] }` where `SubCategory = { id; frameworkId; label; labelAr; isDefault? }`.
- **Actions** (sync, gated): `list(frameworkId)`, `add(frameworkId, label, labelAr?)`, `update(id, patch)`, `remove(id)`.
- **Seeds**: 9 SAMA sub-categories (key-function, product-launch, equity-participation, …).
- **Cross-store deps**: referenced by `sama-letter-store.subCategory`.
- **BACKEND**: `framework_sub_categories(id, framework_id FK, label, label_ar, is_default)`. Index `framework_id`.

---

## 23. `useCalendarStore`
- **File**: `src/stores/calendar-store.ts`
- **Persist key**: `calendar-store` (v2; migrate backfills `frameworkIds` from legacy `agency`).
- **State**: `{ events: CalendarEvent[]; selectedEvent; selectedDate: Date; view: 'month'|'week'|'day'|'agenda'; filters; isLoading; error }`.
- **Actions** (sync): `fetchAll` (no-op), `fetchById`, `createEvent(omit id/timestamps)`, `updateEvent(id, patch)`, `deleteEvent(id)`, `setSelectedEvent/Date`, `setView`, `setFilters`, `clearFilters`.
- **Seeds**: empty (events come from data integration with audits/observations/etc.).
- **Cross-store deps**: pure CRUD — but the **unified calendar view** (calendar/page) aggregates from audit/observation/policy/sama-letter/circular/training/correspondence/advisory/risk stores via `useUnifiedCalendar` selector.
- **BACKEND IMPLICATIONS**
  - (a) `calendar_events(id, title, type, date, start_time, end_time, attendees TEXT[], related_entity_id, related_entity_type, reminders JSONB, description, location, completed, completed_at, agency, severity, framework_ids TEXT[], created_at, updated_at)`.
  - (b) POST/PATCH/DELETE /calendar-events.
  - (c) Indexes: `(date)`, `(related_entity_id, related_entity_type)`, GIN on `framework_ids`.
  - (d) `selectedEvent`, `selectedDate`, `view`, `filters` stay client-side.

---

## 24. `useAuditTaskStore`
- **File**: `src/stores/audit-task-store.ts`
- **Persist key**: `audit-task-storage` (v1; migrate adds `frameworkIds/severity`).
- **State**: `{ tasks: AuditTask[] }`. `AuditTask`: id, auditId, title, description?, category, categoryColor ('blue'|'amber'|'purple'), assignee {id,name,avatar}, dueDate, completed, completedAt?, completedBy?, notes?, frameworkIds?, severity?, createdAt.
- **Actions** (sync): `getTasksByAuditId(auditId)`, `addTask`, `updateTask`, `deleteTask`, `toggleTaskCompletion`.
- **Seeds**: empty.
- **Cross-store deps**: writes → `useAuditLogStore.addLog` on every CRUD; reads `useAuthStore.user` for actor name.
- **BACKEND**: `audit_tasks(id, audit_id FK, title, description, category, category_color, assignee_id, assignee_name, assignee_avatar, due_date, completed, completed_at, completed_by, notes, framework_ids TEXT[], severity, created_at)`. Index `audit_id`, `due_date`.

---

## 25. `useComplianceEvaluationStore`
- **File**: `src/stores/compliance-evaluation-store.ts`
- **Persist key**: `compliance-evaluation-storage` (v2; migrate rekeys from `${ruleId}::${deptId}` → `rule:${ruleId}::${deptId}`).
- **State**: `{ evaluations: Record<key, ComplianceEvaluation> }` where key=`${kind}:${itemId}::${departmentId}`. `ComplianceEvaluation` = { id, kind ('rule'|'policy'), itemId, ruleId? (legacy), departmentId, verdict ('compliant'|'non-compliant'|'na'|'unknown'), notes?, evaluatedBy?, evaluatedAt? }.
- **Actions** (sync): `setVerdict(kind, itemId, deptId, verdict, evaluatedBy?, notes?)`, `getVerdict(...)`, `getDerivedVerdict(kind, itemId, deptId, {circulars, policies, departmentName})` (derives 'compliant' when full workflow completed), `getDepartmentScoreFromItems(deptId, refs[])`.
- **Seeds**: empty.
- **Cross-store deps**: **reads** circulars (`useCircularStore`) and policies (`usePolicyStore`) snapshot at call time via passed-in arrays.
- **BACKEND**: `compliance_evaluations(id PK = "${kind}:${item_id}::${dept_id}", kind, item_id, department_id FK, verdict, notes, evaluated_by, evaluated_at)`. Index `(kind, item_id)`, `(department_id)`.

---

## 26. `useCorrespondenceStore`
- **File**: `src/stores/correspondence-store.ts`
- **Persist key**: `correspondence-storage` (no version)
- **State**: `{ correspondence: Correspondence[]; selectedCorrespondence; filters; pagination; sort; isLoading; error }`.
- **Actions** (sync): `fetchAll`, `fetchById`, `create(data) → Correspondence` (auto-ref `COR-00N`), `update`, `delete`, `getNextReference()`, plus filter/sort/page setters.
- **Seeds**: 2 (COR-001, COR-002).
- **Cross-store deps**: type id resolved via `useCorrespondenceTypeStore`.
- **BACKEND**: `correspondence(id, subject, from_party, to_parties TEXT[], date, type, status, body, attachments JSONB, thread_id, archived, reference, assignee, created_at, updated_at)`. Index `(date desc)`, `(status, type)`, `(thread_id)`.

---

## 27. `usePolicyTemplateStore`
- **File**: `src/stores/policy-template-store.ts`
- **Persist key**: `policy-templates-storage` (v3; v3 migrate **replaces all** with seedTemplates).
- **State**: `{ templates: PolicyTemplate[] }`.
- **Actions** (sync, gated `Manage Policy Templates`): `create(omit id/timestamps/usageCount)`, `update`, `delete`, `incrementUsage(id)`.
- **Seeds**: 6 templates (Data Protection, Access Control, Incident Response, Business Continuity, AML/CTF, Information Security).
- **Cross-store deps**: consumed by `policy-store.create` flows.
- **BACKEND**: `policy_templates` table (matches `PolicyTemplate` type exactly, JSONB for `default_workflow_steps` and `frequency_schedule`). Index `category`, `framework`, `status`.

---

## 28. `useAuditTemplateStore`
- **File**: `src/stores/audit-template-store.ts`
- **Persist key**: `audit-templates-storage` (v2; v2 migrate replaces with seeds).
- **State**: `{ templates: AuditTemplate[] }`.
- **Actions** (sync, gated `Manage Audit Templates`): `create/update/delete/incrementUsage`.
- **Seeds**: 6 templates (NCA ECC Self-Assessment, SAMA Quarterly Compliance Review, PDPL Data Mapping, Internal Controls Review, Sharia Compliance Check, Business Continuity Assessment).
- **Cross-store deps**: consumed by `audit-store.create` flows.
- **BACKEND**: `audit_templates` table (matches `AuditTemplate` type; JSONB for `default_checklist_items`, `default_team_roles`, `frequency_schedule`). Index `category`, `framework`, `status`.

---

## 29. `useAuditLogStore`
- **File**: `src/stores/audit-log-store.ts`
- **Persist key**: `audit-log-storage` (no version)
- **State**: `{ logs: AuditLog[] }`. `AuditLog`: id, timestamp, user {name,avatar}, action ('opened'|'closed'|'commented'|'uploaded'|'created'|'assigned'|'updated'|'reviewed'), audit (title), auditId, description, descriptionKey?, descriptionParams?, status ('completed'|'pending'|'info'|'failed'), duration?, context?.
- **Actions** (sync): `addLog(omit id/timestamp)`, `getLogsByAuditId(auditId)`, `clearLogs()`.
- **Seeds**: 15 demo log entries (log-001..log-015).
- **Cross-store deps**: **written by** audit-store, audit-task-store on every mutation.
- **BACKEND**: `audit_activity_logs(id, timestamp, user_name, user_avatar, action, audit_title, audit_id FK, description, description_key, description_params JSONB, status, duration, context)`. Index `(audit_id, timestamp desc)`.

---

## 30. `useMessageStore`
- **File**: `src/stores/message-store.ts`
- **Persist key**: `message-storage` (v3; v2→v3 rewrites `'current-user'` → `'admin'`).
- **State**: `{ threads: MessageThread[]; messages: Message[] }`.
- **Actions** (sync): `fetchAll` (no-op), `sendMessage`, `createThread`, `markThreadAsRead`, `deleteThread`, `kickMember`, `promoteAdmin`, `demoteAdmin`, `addMembersToThread`, `updateThreadSubject`, `updateThreadAvatar`, `getThread`, `getMessages`.
- **Seeds**: 3 threads + 8 messages (Compliance Team, Audit Follow-up, Policy Review).
- **Cross-store deps**: none direct (uses senderId from caller).
- **BACKEND**: two tables — `message_threads(id, subject, is_group, avatar_url, created_by FK, admins TEXT[], last_message, last_message_at, unread_count, …)` and `message_thread_participants(thread_id, user_id, name)` + `messages(id, thread_id FK, sender_id, sender_name, content, created_at, read)`. Indexes `(thread_id, created_at)`, `(sender_id)`.

---

## 31. `useSAMATemplateStore`
- **File**: `src/stores/sama-template-store.ts`
- **Persist key**: `sama-templates` (v2; migrate merges body/subject defaults from seed if missing).
- **State**: `{ templates: LetterTemplate[] }`.
- **Actions** (sync, gated `Manage Letter Templates`): `create` (auto-defaults icon/color from `typeColors/typeIcons` map), `update`, `delete`, `incrementUsage(id)`.
- **Seeds**: 8 letter templates (tmpl-001…tmpl-008): Key Function Appointment, Product Launch Request, Circular Clarification, Regulatory Interpretation, Quarterly AML Report, Annual Compliance Report, Incident Notification, System Outage Report. Each carries full EN+AR subject/body defaults and `placeholderDefs?`.
- **Cross-store deps**: consumed by `sama-letter-store.create` to seed letter content; uses `useSAMALetterTypeStore` for types.
- **BACKEND**: `letter_templates` table mirrors `LetterTemplate` type — many text/longtext columns + `placeholder_defs JSONB`. Index `type`, `status`.

---

## 32. `useAdvisoryStore`
- **File**: `src/stores/advisory-store.ts`
- **Persist key**: `advisory-storage` (v2; migrate dedupes ids).
- **State**: `{ advisoryRequests: AdvisoryRequest[]; selectedRequest; filters; pagination; sort; isLoading; error }`.
- **Actions** (sync — note: not async despite stub `// TODO: API call`): `fetchAll`, `fetchById`, `create(omit id/ref/notes/timestamps)` auto-ref `ADV-YYYY-NNN`, `update`, `delete`, `addNote(id, {author,content})`, `updateStatus(id, status)`, `reassign(id, assignee)`, `getNextRef()`, filter/sort/page setters.
- **Seeds**: 5 advisory requests (ADV-001..ADV-005) with notes arrays.
- **Cross-store deps**: `businessUnit` from `useBusinessUnitStore`.
- **BACKEND**: `advisory_requests(id, ref, subject, description, business_unit, status, priority, requested_by, requested_date, assigned_to, created_at, updated_at)` + `advisory_notes(id, advisory_id FK, author, content, timestamp)`. Index `(status, priority)`, `(business_unit)`, `(requested_date desc)`.

---

## 33. `useReportStore`
- **File**: `src/stores/report-store.ts`
- **Persist key**: **not persisted** (no `persist` wrapper — pure in-memory).
- **State**: `{ reports: Report[]; selectedReport; filters; pagination; sort; isLoading; isGenerating; error }`.
- **Actions** (all **async** with fake 300–2000ms delays): `fetchAll`, `fetchById`, `create`, `update`, `delete`, `generate(id)` (sets status='ready', sets url), `schedule(id, scheduledFor)`, `download(id)`.
- **Seeds**: empty.
- **Cross-store deps**: none (would read from audit/risk/observation stores in real backend).
- **BACKEND**: `reports(id, name, type, format, period, status, generated_at, scheduled_for, recipients TEXT[], filters JSONB, url, created_at, updated_at)`. `generate` becomes a server-side job (Edge Function + Storage). Indexes `status`, `(scheduled_for)`, `type`.

---

## 34. `useTeamStore`
- **File**: `src/stores/team-store.ts`
- **Persist key**: `team-storage` (v3).
- **State**: `{ members: TeamMember[]; selectedMember; filters; pagination; sort; isLoading; error }`.
- **Actions** (mostly **async** with fake delays, gated `Manage Team & Permissions`): `fetchAll`, `fetchById`, `invite({email,role,department,fullName?})`, `update(id, patch)`, `updateRole(id, role)`, `remove(id)`, `resendInvite(id)`, filter/sort/page setters, `unassignTask(memberId, title)`, `reassignTask(fromId, toId, title)`, `updateBurnoutTimestamps()` (sets/clears `burnoutSince` based on workload ≥ 75%).
- **Seeds**: 5 sample members (ids '1'..'5') matching `auth-store.SEED_USERS`, each with `assignments[]` and `accessControls[]`.
- **Cross-store deps**: writes → `useUserLogStore.log` on invite/remove/updateRole. `STANDARD_PERMISSIONS` from `@/lib/permissions-registry`.
- **Persist migrations**: v1→v2 backfills `accessControls` from seed; v2→v3 backfills `assignments` from seed for empty members.
- **BACKEND**: `team_members` table extending `profiles` — fields: id, name, email, role, department FK, avatar, workload, status, joined_at, invited_by, nationality, burnout_since. Sub-tables: `team_assignments(member_id, title, due_date, progress)`, `team_access_controls(member_id, permission_label, enabled)`. Indexes `(role)`, `(department)`, `(status)`.

---

## 35. `useTrainingStore`
- **File**: `src/stores/training-store.ts`
- **Persist key**: `training-storage` (v4; migrate at v<4 wipes everything except `trainings` and re-seeds employees/courses/saudization).
- **State** (composite — two sub-domains):
  - Compliance-engine side: `{ trainings: Training[]; selectedTraining; filters; pagination; sort; isLoading; error }`.
  - Team training page: `{ employees: TrainingEmployee[]; courses: TrainingCourse[]; saudizationMetrics: SaudizationMetrics; departmentProgress: DepartmentTraining[]; overviewStats: TrainingOverviewStats }`.
- **Actions**:
  - Async (fake delays): `fetchAll`, `fetchById`, `create`, `update`, `delete`.
  - Sync: `setFilters/clearFilters/setSelected/setSort/setPage/setPageSize`, `addEmployee`, `updateEmployee`, `removeEmployee`, `assignCourseToEmployee`, `bulkAssignCourse`, `addCourse`, `updateCourse`, `removeCourse`, `updateSaudizationMetrics`, `updateOverviewStats`, `recalculateDepartmentProgress()` (derives), `recalculateOverviewStats()` (derives), `importUploadData({employees?, saudization?, overviewStats?})`.
- **Seeds**: 4 courses (CRS-001..CRS-004), 4 employees (EMP-001..EMP-004), saudization metrics for 3 departments, 3-row department progress, overview stats {72/12/3/5}.
- **Cross-store deps**: none directly (categories surfaced via `useTrainingCategoryStore`).
- **BACKEND**: split into 4 tables — `training_courses`, `training_employees`, `training_course_assignments(employee_id, course_id, status, progress, completed_date, due_date, score)`, `saudization_metrics_by_department`. `departmentProgress` and `overviewStats` are **derived views** (Postgres materialized views or computed by SQL on read). Indexes `(employee_id)`, `(course_id)`, `(status)`, `(due_date)`.

---

## 36. `useFrameworkConfigStore`
- **File**: `src/stores/framework-config-store.ts`
- **Persist key**: `framework-config-storage` (v6 — large migration history).
- **State**: `{ frameworks: FrameworkConfig[]; pinnedIds: RegulatoryBodyId[] }`.
- **Actions** (sync, gated `Configure Frameworks`): `toggleEnabled(id)`, `updateConfig(id, patch)`, `addFramework(NewFrameworkInput)`, `resetToDefaults()`, `getEnabled()`, `getEnabledCorrespondence()`, `getById(id)`, `pinFramework(id)`, `unpinFramework(id)`, `replacePinned(oldId, newId)`. Pinning is **correspondence-only**, cap 3.
- **Seeds**: **19 framework configs** — sama, nca-ecc, ndmo-pdpl, nca-cscc, citc, nca-ccc, cma, zatca, misa, safiu, ia, sdaia-pdpl, iso-27001, iso-22301, iso-31000, coso-ic, coso-erm, saso, sharia-board. Each carries name/nameAr, description, icon, iconColor, enabled, departments[], threshold, weights {audits/observations/letters/circulars}, correspondenceBased.
- **Cross-store deps**: read by virtually every entity that has `frameworkIds`. Helper `isCorrespondenceBasedId()`, `getDefaultWeights()`, `frameworkIconTextClass()` are exported.
- **Persist migrations**:
  - v<2: drop `syncFrequency`, ensure weights.
  - v<3: merge any missing seed frameworks.
  - v<4: tag `correspondenceBased`, rename SAMA display.
  - v<5: drop self-assessment frameworks from `pinnedIds`.
  - v<6: shrink `FrameworkWeights` from 7 keys to 4 (audits/observations/letters/circulars).
- **BACKEND**: `frameworks(id text PK, name, name_ar, description, description_ar, icon, icon_color, enabled, departments TEXT[], threshold, custom_threshold_value, alert_on_non_compliance, weights JSONB, custom_field_values JSONB, correspondence_based)` + `framework_pins(org_id, framework_id, position 1-3)`. Indexes `correspondence_based`, `enabled`.

---

## 37. `useAuditStore`
- **File**: `src/stores/audit-store.ts`
- **Persist key**: `audit-storage` (v1; migrate backfills `frameworkIds` from `type`).
- **State**: `{ audits: Audit[]; selectedAudit; filters; pagination; sort; isLoading; error }`.
- **Actions**:
  - Async (gated `Manage Audit Findings`, fake delay): `fetchAll`, `fetchById`, `create` (computes `dueDate` via `reviewSchedule` if present), `update` (same), `delete`.
  - Sync: filter/sort/page setters; `addDocument(auditId, doc, user?)`, `removeDocument`, `addTeamMember(auditId, member)`, `removeTeamMember`, `addComment(auditId, content, author)`, `editComment`, `deleteComment`, `updateStatus(auditId, status, user)` (gated; flags `closedOverdue` if completed past due date).
- **Seeds**: 7 audits (audit-001..audit-007) — SAMA CSF, NCA ECC, AML/CTF, PDPL, Sharia, Internal Q1 Controls, ZATCA E-invoicing — each with assignee, documents[], team[], frameworkIds.
- **Cross-store deps**: writes → `useAuditLogStore.addLog` on every create/update/delete/document/comment/status mutation; reads `useAuthStore.user`; `requirePermission`.
- **BACKEND**: `audits(id, title, type, status, due_date, assignee_id, progress, description, category, frequency, priority, closed_overdue, completed_at, review_schedule JSONB, framework_ids TEXT[], created_at, updated_at)` + sub-tables `audit_documents`, `audit_team_members`, `audit_comments`. Indexes `(status, due_date)`, `(assignee_id)`, `(type)`, GIN `framework_ids`.

---

## 38. `useObservationStore`
- **File**: `src/stores/observation-store.ts`
- **Persist key**: `observation-storage` (v1; migrate backfills `frameworkIds` from `source`).
- **State**: `{ observations: Observation[]; selectedObservation: ObservationWithComments|null; filters; pagination; sort; isLoading; error }`.
- **Actions** (all **async** signatures with fake delays; mutations gated `Manage Audit Findings`):
  - CRUD: `fetchAll`, `fetchById`, `create(data, creator?)`, `update(id, patch, editor?)`, `delete(id)`.
  - Comments: `addComment`, `editComment`, `deleteComment`.
  - Checklist: `addChecklistItem`, `editChecklistItem`, `toggleChecklistItem`, `removeChecklistItem`.
  - Workflow: `transferLeadership(obsId, newLeaderId, newLeaderName, currentUser)`, `submitRemediationPlan(obsId, plan, submitter, leaderId?)`, `reviewRemediationPlan(obsId, approved, reviewer, notes?)`, `requestClosure(obsId, requester, notes?)`, `reviewClosure(obsId, approved, reviewer, notes?)` (gated).
  - Documents: `addDocument(obsId, doc, uploader, addToRemediationPlan?)`, `removeDocument`.
  - Utility: `getNextReference()` (`OBS-YYYY-NNNN`), filter/sort/page setters.
  - Every mutation appends to `observation.timeline[]` (ObservationTimelineEntry).
- **Seeds**: 5 observations (OBS-2026-0001..0005) — KYC, Cybersecurity Pen-test, Sharia Board Resolutions, Risk Assessment, …
- **Cross-store deps**: uses `User` objects passed in by callers; no direct reads of other stores.
- **BACKEND**: `observations(id, reference, title, sub_title, description, source, severity, status, due_date, remediation_submission_due_date, department, assignee_id, leader_id, creator_id, progress, remediation_plan JSONB, closure_request JSONB, closure_review JSONB, framework_ids TEXT[], created_at, updated_at)` + sub-tables `observation_assignees`, `observation_team`, `observation_checklist_items`, `observation_updates`, `observation_documents`, `observation_timeline`. Indexes `(status, due_date)`, `(severity)`, `(source)`, `(leader_id)`, `(assignee_id)`, GIN `framework_ids`.

---

## 39. `useCircularStore`
- **File**: `src/stores/circular-store.ts`
- **Persist key**: `circular-storage` (v8 — heaviest migration chain).
- **State**: `{ circulars: Circular[]; selectedCircular: Circular|null; filters: CircularFilters }`.
- **Actions** (all **sync**, none gated by `requirePermission` here):
  - CRUD: `getNextReference(authority)` (`{AUTH}-{YYYY}-NNN`), `create(data)`, `update(id, patch)`, `delete(id)`, `setSelected`, `setFilters`, `clearFilters`, `assignBusinessOwner(id, dept)`, `setPdfUrl(id, dataUrl)`, `clearPdfUrl(id)`.
  - Articles: `addArticle`, `updateArticle`, `deleteArticle`, `toggleChecklistItem(circId, artId, itemId)`, `addChecklistItem`, `deleteChecklistItem`, `addArticleTimelineEvent`.
  - Workflow: `advanceWorkflowStep(circId, stepId, notes?)` (executes phase transitions and timeline events).
  - Step CRUD/reorder/deadline (parity with policies): `setRuleStepDeadline` (validates via `validateChildDeadline`), `addWorkflowStep`, `renameWorkflowStep`, `removeWorkflowStep`, `reorderWorkflowSteps`.
  - Edit-approval workflow: `requestCircularEdit(circId, partial)`, `approveCircularEditStep(circId, approvalId, notes)`, `rejectCircularEditStep`.
  - Attachments: `addCAPAttachment`, `addRemediationAttachment`, `removeCAPAttachment`, `removeRemediationAttachment`.
  - Timeline: `addTimelineEvent`.
- **Seeds**: 5 circulars (each with full `workflowSteps`, `articles[]` containing checklist, attachments, version history, and timeline).
- **Cross-store deps**: validates step deadlines against parent due/capDeadline via `@/lib/deadline-validation`. Authority ids map to framework ids via migration.
- **Persist migrations**:
  - v<4: reset to seedCirculars.
  - v<7: rebuild `workflowSteps` from legacy `capStatus`; backfill `frameworkIds`.
  - v<8: lowercase authority ids (SAMA→sama, etc.).
- **BACKEND**: `circulars(id, reference, authority, title, priority, status, applicability, departments TEXT[], business_owner_department, assigned_to, progress, issuance_date, due_date, cap_status, cap_due_date, description, pdf_url, cap_response_deadline, cap_deadline, remediation_deadline, reference_url, pending_edit JSONB, framework_ids TEXT[], created_at, updated_at)` + sub-tables: `circular_articles`, `article_checklist_items`, `article_attachments`, `article_versions`, `article_timeline`, `circular_workflow_steps`, `circular_timeline`, `circular_versions`, `circular_cap_attachments`, `circular_remediation_attachments`. Indexes `(authority, status)`, `(due_date)`, GIN `framework_ids`, GIN `departments`.

---

## 40. `usePolicyStore`
- **File**: `src/stores/policy-store.ts`
- **Persist key**: `policy-storage` (v4).
- **State**: `{ policies: Policy[]; selectedPolicy; filters: PolicyFilters }`.
- **Actions** (sync):
  - `fetchAll` (no-op), `fetchById`, `getNextId()` (`POL-00N`), `create(data)` (computes nextReviewDate via `reviewSchedule`), `update`, `delete`, `setSelected/setFilters/clearFilters`.
  - Status transitions (gated `Approve Policy Reviews`, write to `useUserLogStore.log` as `policy.approval_step_committed`/`policy.rejection`): `submitForReview(id)`, `approve(id, notes?)`, `initiateReview(id)`.
  - `reviewAlerts()` returns policies due within 90 days or expired.
  - `checkAndUpdateStatuses()` mutates status to `'overdue'` / `'requires-review'` based on date thresholds; increments `overdueCount`.
  - Workflow: `setPhaseDeadline(policyId, stepIndex, deadline?, actingUser)` (validated against `policy.nextReviewDate`), `renameWorkflowStep`.
  - Every mutation appends to `activityLog: PolicyActivityEntry[]`.
- **Seeds**: 5 policies (POL-001..POL-005) — AML, Information Security, Data Privacy/PDPL, …
- **Cross-store deps**: `requirePermission`, `useUserLogStore`, `validateChildDeadline`, `computeNextReview/cadenceToReviewCycleDays`. `businessOwnerDepartmentId` references `useDepartmentStore`.
- **Persist migrations**:
  - v0: seed if empty.
  - v<2: add `actionType`, `currentReviewCycleId/Label`.
  - v<3: backfill `frameworkIds` for known policy ids.
  - v<4: derive `businessOwnerDepartmentId` from `owner.department` string via dept-name→id map.
- **BACKEND**: `policies(id, name, description, status, category, version, approval_tier, owner_name, owner_avatar, owner_department, business_owner_department_id FK, affected_departments TEXT[], last_review_date, next_review_date, review_cycle_days, approved_date, overdue_count, last_overdue_date, current_review_cycle_id, current_review_cycle_label, current_review_cycle_date, review_schedule JSONB, framework_ids TEXT[], created_at, updated_at)` + sub-tables `policy_version_history`, `policy_workflow_timeline`, `policy_activity_log`, `policy_attachments`, `policy_evidence`, `policy_review_cycle_history`. Indexes `(status)`, `(next_review_date)`, `(business_owner_department_id)`, GIN `framework_ids`.

---

## 41. `useRiskStore`
- **File**: `src/stores/risk-store.ts`
- **Persist key**: `risk-storage` (v1; migrate backfills `frameworkIds: []`).
- **State**: `{ risks: Risk[]; selectedRisk; filters: RiskFilters; pagination; sort; isLoading; error }`.
- **Actions**:
  - Async (gated `Manage Audit Findings`, fake delays): `fetchAll`, `fetchById`, `create(data)`, `update(id, patch)`, `delete(id)`.
  - Sync: `updateStatus(id, status)` (also gated), checklist mutations `addMitigationItem/editMitigationItem/toggleMitigationItem/removeMitigationItem` (recompute `mitigationProgress`, push to `history`), `markReviewed(id)` (updates `lastReviewDate/nextReviewDate` per `monitoringFrequency`).
  - Officer-driven workflow: `assignDepartment(riskId, deptId)`, `setMitigationDeadline(riskId, deadline?)`, `sendToDepartment(riskId, actingUser)` (transitions `mitigationWorkflowStatus → 'sent-to-department'`), `submitDepartmentPlan(riskId, plan, checklist, submittedBy)` (→ `'plan-proposed'`), `acceptDepartmentPlan(riskId, actingUser)` (→ `'in-progress'`, gated), `toggleDepartmentPlanItem(riskId, itemId, actingUser)` (auto-resolves risk when all done).
  - filter/sort/page setters.
- **Seeds**: 6 risks (risk-001..risk-006) with full history, checklists, monitoring frequency.
- **Cross-store deps**: `intendedDepartmentId` references `useDepartmentStore`. Status changes feed into compliance scoring.
- **BACKEND**: `risks(id, title, description, category, likelihood, impact, risk_score, status, owner_id, mitigation_plan, mitigation_progress, monitoring_frequency, last_review_date, next_review_date, review_schedule JSONB, intended_department_id FK, mitigation_deadline, mitigation_workflow_status, sent_to_department_at, framework_ids TEXT[], created_at, updated_at)` + sub-tables `risk_mitigation_checklist`, `risk_department_proposed_plan`, `risk_history`. Indexes `(status)`, `(risk_score desc)`, `(category)`, `(intended_department_id)`.

---

## 42. `useSAMALetterStore`
- **File**: `src/stores/sama-letter-store.ts`
- **Persist key**: `sama-letter-store` (v5).
- **State**: `{ letters: SAMALetter[]; selectedLetter; filters: SAMALetterFilters; pagination; sort; isLoading; error }`.
- **Actions** (sync — letter approval steps gated `Approve SAMA Letters`):
  - CRUD: `fetchAll`, `fetchById`, `getNextReference(type)` (`{TYPE}-YYYY-NNN`), `create(data)`, `update(id, patch)`, `delete(id)`.
  - Workflow: `submitForApproval(id)`, `approveStep(id, step 1|2|3, notes?)` (writes `samaLetter.approval_step_committed`), `rejectStep(id, step, notes)`, `send(id)` (renders template placeholders via `renderTemplate`, sets `sentDate`, computes `responseDeadline` from `RESPONSE_DAYS` map; logs `samaLetter.sent`), `markResponseReceived(id)`.
  - filter/sort/page setters.
- **Seeds**: 3 letters (sama-001 sent SAMA non-objection, …) with full approvalChain (3 steps), timeline, attachments, AR/EN body+subject.
- **Cross-store deps**: `requirePermission`, `useUserLogStore`. `type` from `useSAMALetterTypeStore`, `subCategory` from `useFrameworkSubCategoryStore`, `samaDepartment` from `useAuthorityDeptStore`, `placeholderDefs/placeholderValues` rendered via `@/lib/letter-template`.
- **Persist migrations**:
  - v<4: add `authority: 'sama'` default.
  - v<5: lowercase legacy uppercase authority ids.
- **BACKEND**: `sama_letters(id, reference, authority, type, sub_category, sama_department, subject, subject_ar, body, body_ar, status, priority, created_by, assigned_to, sent_date, response_deadline, response_received_date, recipient_name/org/city (+ AR), signer_name/title (+ AR), signature_image_url, placeholder_defs JSONB, placeholder_values JSONB, created_at, updated_at)` + sub-tables `letter_approval_chain(letter_id, step, role, status, assigned_to, approved_at, rejected_at, notes)`, `letter_timeline`, `letter_attachments`, `letter_related_observations(letter_id, observation_id)`. Indexes `(authority, status)`, `(type)`, `(response_deadline)`, `(created_by)`.

---

## Cross-store dependency graph (summary)

| Store | Reads | Writes |
|---|---|---|
| auth | — | user-log |
| team | permissions-registry | user-log |
| policy | department, framework-config, compliance-evaluation | user-log |
| sama-letter | sama-letter-type, framework-sub-category, authority-department, sama-template | user-log |
| audit | auth | audit-log |
| audit-task | auth | audit-log |
| observation | (User passed in) | (timeline mutations in-record) |
| risk | department | (history in-record) |
| circular | (validates deadlines) | (timeline in-record) |
| correspondence | correspondence-type | — |
| advisory | business-unit | — |
| calendar | calendar-event-type | — |
| compliance-evaluation | circular, policy (passed in) | — |
| notification | (any store via `syncGeneratedNotifications`) | — |
| framework-config | — | — (read by ~every entity store) |
| help, language, user-preferences, scale-labels, compliance-settings, all category/type/onboarding stores | — | — |

## Persist version inventory (for migration design)

| Store | name | version |
|---|---|---|
| auth | auth-storage | 5 |
| language | language-storage | (unversioned) |
| help | help-storage | (unversioned) |
| compliance-settings | compliance-settings-storage | (unversioned) |
| onboarding-region/industry/headcount | onboarding-*-storage | 1 |
| department | department-storage | (unversioned) |
| business-unit | business-unit-storage | 1 |
| calendar-event-type | calendar-event-type-storage | 1 |
| correspondence-type | correspondence-type-storage | 1 |
| sama-letter-type | sama-letter-type-storage | 1 |
| risk-category | risk-category-storage | 1 |
| policy-category | policy-category-storage | 1 |
| audit-category | audit-category-storage | 1 |
| training-category | training-category-storage | 1 |
| scale-labels | scale-labels-storage | 1 |
| authority-department | authority-department-storage | 1 |
| notification | notification-storage | 3 |
| user-preferences | user-preferences-storage | 2 |
| user-log | user-log-storage | 1 |
| framework-sub-category | sama-sub-category-storage | 2 |
| calendar | calendar-store | 2 |
| audit-task | audit-task-storage | 1 |
| compliance-evaluation | compliance-evaluation-storage | 2 |
| correspondence | correspondence-storage | (unversioned) |
| policy-template | policy-templates-storage | 3 |
| audit-template | audit-templates-storage | 2 |
| audit-log | audit-log-storage | (unversioned) |
| message | message-storage | 3 |
| sama-template | sama-templates | 2 |
| advisory | advisory-storage | 2 |
| report | (not persisted) | — |
| team | team-storage | 3 |
| training | training-storage | 4 |
| framework-config | framework-config-storage | 6 |
| audit | audit-storage | 1 |
| observation | observation-storage | 1 |
| circular | circular-storage | 8 |
| policy | policy-storage | 4 |
| risk | risk-storage | 1 |
| sama-letter | sama-letter-store | 5 |
