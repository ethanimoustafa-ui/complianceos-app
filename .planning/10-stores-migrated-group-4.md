# Group 4 — Stores migrated (Phase 5)

Agent: Group 4 (settings / config / misc — 16 stores)

## Migrated to server-state (persist + seeds stripped → `api.*` calls)

| Store | Endpoint(s) | Notes |
|---|---|---|
| `compliance-settings-store` | `GET/PATCH /api/settings/compliance-settings` | Singleton row. `setWeight` / `setTargetScore` / `resetWeights` / `setAuditRetentionYears` PATCH; weights JSONB merged server-side. Sync→async signatures (no direct consumers caught by tsc). |
| `framework-config-store` | `GET /api/settings/framework-config`, `PATCH /api/settings/framework-config/[id]`, `POST /api/settings/framework-config/pin`, `DELETE /api/settings/framework-config/unpin/[id]` | Static framework metadata table kept in-store (display attrs); `framework_config` rows overlay enabled/threshold/weights. Pin/unpin/replacePinned wired. `addFramework` / `resetToDefaults` stay client-only (frameworks ref table is fixed). |
| `department-store` | `GET/POST /api/settings/departments`, `PATCH/DELETE /api/settings/departments/[id]` | API rows use `name_en`/`name_ar`/`key` → mapped to legacy `Department` (`name`/`nameAr`/`isDefault`). `addDepartment` returns optimistic `Department` synchronously (background POST + reconcile) so `EditableSelect` consumers — `onAdd={...addDepartment(l, ar).id}` — keep compiling. Server 409 conflict on delete surfaces via `error`. |
| `business-unit-store` | `GET/POST /api/settings/business-units`, `PATCH/DELETE /api/settings/business-units/[id]` | Same shape/pattern as `department-store`. Optimistic `add` returns tentative id synchronously. |
| `audit-template-store` | `GET/POST /api/audit-templates`, `PATCH/DELETE /api/audit-templates/[templateId]` | Phase 4 Stage A audits-reference family. `incrementUsage` is now optimistic local-only (no server route ships an increment endpoint; PATCH only accepts schema-declared fields). |
| `audit-category-store` | `GET/POST /api/audit-categories`, `PATCH/DELETE /api/audit-categories/[categoryId]` | Phase 4 Stage A audits-reference family. `add` returns tentative id synchronously. `resetToDefaults` is now client-only (server has no reset endpoint). |
| `scale-labels-store` | `GET/PATCH /api/settings/scale-labels` | Batch upsert. Per-scale × per-key × per-lang. `resetLabel` PATCHes empty values for both langs as a "reset" sentinel (no DELETE endpoint). |
| `compliance-evaluation-store` | `GET/POST /api/reports/compliance-evaluations`, `POST /api/reports/compliance-evaluations/bulk` | `setVerdict` is optimistic + POST upsert; `bulkUpsert` added. Pure helper methods (`getDerivedVerdict`, `getDepartmentScoreFromItems`, `getVerdict`) kept verbatim — dashboard scoring math runs client-side off the cached `evaluations` map. `fetchAll` paginates through every row (dashboards need all evaluations to score). |
| `report-store` | (no backend) | Removed seed mocks + artificial `setTimeout` delays. Store kept for in-memory `selectedReport` / `filters` / `sort` / `pagination` UI state + local in-session scheduled-report tracking. Actual report data comes from `compliance-evaluations`, `/api/compliance/score`, and cross-store aggregation per the audit notes. |
| `audit-log-store` | `GET /api/audit-logs`, `GET /api/audit-logs/[id]` | Read-only. `fetchAll` (paginated; with optional `auditId` filter) + `fetchById` added. `addLog` preserved as a client-only no-server shim — mutations across the app already write audit rows server-side via `writeAudit()`; this shim keeps the 12+ `useAuditLogStore.getState().addLog({...})` call sites in `audit-store`/`audit-task-store` compiling while bridging the round-trip for the audit-detail page. |

## Kept client-only (documented gap)

| Store | Rationale |
|---|---|
| `user-preferences-store` | **KEPT PERSISTED.** No `/api/team/me/preferences` endpoint exists (only `preferred_language` on `profiles` via `/api/team/me`). Documentation comment added pointing to the future migration path (add `profiles.preferences` JSONB + dedicated endpoint). Acceptable for MVP — preferences are non-critical and re-derivable. |
| `language-store` | **KEPT PERSISTED — pure UI state.** Active locale + writing direction; no server toggle. Documentation comment added. |
| `help-store` | **KEPT PERSISTED — pure UI state.** Hard-coded article catalog + per-device recently-viewed list. No server endpoint applies. Documentation comment added. |
| `onboarding-industry-store` | **KEPT PERSISTED — UI-defaults only.** One remaining consumer: `src/app/(auth)/onboarding/page.tsx`. No `/api/settings/onboarding/industry` endpoint. Documentation comment added; if the onboarding flow is ever removed entirely this becomes dead and the orchestrator can delete the file. |
| `onboarding-region-store` | **KEPT PERSISTED — UI-defaults only.** Same as `onboarding-industry-store`. |
| `onboarding-headcount-store` | **KEPT PERSISTED — UI-defaults only.** Same as `onboarding-industry-store`. |

### Onboarding consumer-count verification

Grep `useOnboardingIndustryStore|useOnboardingRegionStore|useOnboardingHeadcountStore` finds exactly 4 files:
- The three store files themselves
- `src/app/(auth)/onboarding/page.tsx` — single live consumer

The instructions noted the onboarding UI sections were removed in audit-loop iter-2 from `ListsAndCategoriesSection.tsx`, but the `onboarding/page.tsx` route still references all three stores. The stores are not zero-consumer; recommendation: keep until the onboarding route is also pruned.

## TypeScript validation

`npx tsc --noEmit` returns errors **only in Group 2/3-owned files** (sama-letter-store, user-log-store, correspondence/letters components, ListsAndCategoriesSection refs to SubCategory). **Zero errors in Group 4's stores or their consumers.** When all four groups' migrations land, the codebase should be tsc-clean.

## Special notes / deviations from spec

- **`framework-config-store.updateConfig`**: the API currently exposes `enabled / threshold / weight / department_id / pinned` via `framework_config` upsert. Per-framework `weights` (the 4-surface object) and `departments`/`alertOnNonCompliance` live on the `frameworks` ref table — Phase 4 didn't ship a PATCH for those fields. The store overlays them locally so existing settings UI keeps working; a follow-up phase needs to wire `PATCH /api/settings/frameworks/[id]` (or similar) for full server persistence of weights.
- **`framework-config-store.addFramework` / `resetToDefaults`**: stay client-only because frameworks are a fixed reference table — adding a brand-new framework id requires a Postgres migration.
- **`audit-template-store.incrementUsage`**: optimistic local-only because the PATCH schema doesn't accept a `usage_count` increment. A follow-up phase can ship `/api/audit-templates/[id]/increment`.
- **`scale-labels-store.resetLabel`**: writes empty strings (both langs) as a "reset" sentinel because the API has no DELETE; `getLabel` already returns `undefined` for empty/missing entries.
- **`compliance-evaluation-store.fetchAll`**: paginates through every row (page-size 100) because the dashboard score calculation needs every (kind, item_id, department_id) entry. For very large orgs this will be slow; a follow-up phase should expose a more efficient bulk-read or per-department endpoint.
- **`compliance-settings-store` async signatures**: `setWeight` / `setTargetScore` / `resetWeights` changed from sync to async (`Promise<...>`). No direct consumers were caught by tsc (verified via Grep `\.setWeight\(`/`\.setTargetScore\(`/`\.resetWeights\(`).
- **Optimistic UI for `addDepartment` / `useBusinessUnitStore.add` / `useAuditCategoryStore.add`**: kept synchronous return signature to preserve `EditableSelect`'s `onAdd={(l, ar) => store.add(l, ar).id}` contract used at ~15 call sites. The temp `tmp-<slug>` id is replaced with the server-issued UUID once the POST returns (or rolled back on failure). Pages that immediately use the returned id (e.g. attaching it to a record they're about to PATCH) may need a follow-up reconciliation once the real id lands; today the UI just shows the option in the dropdown so this is benign.
