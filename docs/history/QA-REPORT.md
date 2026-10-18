# QA Report — Recently-Shipped Features

**Date:** 2026-06-19 (UTC)
**Dev server:** http://localhost:3000
**Method:** Real-browser walkthrough via Playwright MCP. Every action driven through the UI (clicks, forms, real file uploads). No API/DB shortcuts for mutations. DB used read-only to verify persisted state.
**Supabase project:** qdbitfgxbnbzkqhdoepd
**Artifacts:** `tests/e2e/_artifacts/qa-walkthrough/recent-features/` (8 screenshots, `00`–`08`)

## Seeded-account reality check (important)

The login emails do **not** match their nominal role names. Confirmed via `profiles` + `departments`:

| Login email | Display name | Actual role | Department |
|---|---|---|---|
| admin@complianceos.local | ComplianceOS Admin | admin | — (none) |
| officer@complianceos.local | Sara Al-Otaibi | **manager** | Compliance |
| auditor@complianceos.local | Khalid Al-Harbi | **officer** | Internal Audit |
| viewer@complianceos.local | Noura Al-Qahtani | officer | Legal |

There is **no active profile with the `auditor` role**. Tests were adapted to actual roles: `viewer@`/`auditor@` (officers, least privilege) for denial paths; `admin@` for the privileged positive path.

## Summary

**10 checks · 8 PASS · 1 FAIL · 1 PARTIAL.**

| # | Area | Result |
|---|---|---|
| 1 | Access Matrix — visibility, collapse/expand, counts | PASS |
| 2 | Access Matrix — toggle By-page + By-entity, PATCH 200, persist on reload | PASS |
| 3 | Access Matrix — tooltips show plain-language (not raw keys) | PASS |
| 4 | Access Matrix — Admin/Manager rows disabled / all-on | PASS |
| 5 | RBAC enforcement — gated mutation is blocked (DB unchanged) | PASS |
| 6 | RBAC error UX — denial shows a clear toast, not a silent console error | **FAIL** |
| 7 | RBAC positive — privileged user create/edit works + persists | PARTIAL |
| 8 | Dashboard — Managerial, SAMA = 1 Critical (not 3), renders cleanly | PASS |
| 9 | Input-error messaging — non-image + oversized upload show inline errors | PASS |
| 10 | Unread badges populate on load + Department shows a name (not UUID) | PASS |

---

## 1. Access Matrix (Team → Active Directory)

Route: `/team/directory` → "Access Matrix" section (admin only; gated by `Gate perm="Manage Team & Permissions"`).
Source: `src/components/settings/AccessMatrixSection.tsx`.

### 1a — Collapsed rows, counts, collapse/expand — PASS
- Collapsed rows show avatar, name, role badge, and a count.
  - ComplianceOS Admin (admin) → **"Full access"**
  - Sara Al-Otaibi (manager) → **"Full access"**
  - Khalid Al-Harbi (officer) → **"1 of 48 enabled"**
  - Noura Al-Qahtani (officer) → **"0 of 48 enabled"**
- Clicking a row animates open the inline drawer (`grid-template-rows 0fr→1fr`); clicking again collapses. Verified only one row open at a time (`expandedCount: 1`, label = Khalid after clicking his row).
- Evidence: snapshot of the section; counts read live from DOM.

### 1b — Toggle By-page + By-entity, PATCH 200, persist on reload — PASS
Driven on Khalid (officer):
- Toggled **By page → "Approve Policy Reviews"** ON → `PATCH /api/team/members/8b8a0cb8-.../permissions → 200 OK`. UI flipped to `aria-pressed=true`; count went "1 → 2 of 48".
- Toggled **By entity → Policies → Export** ON → second `PATCH … /permissions → 200 OK` (NOT 500).
- DB after toggles: `policy:create`, `policy:edit`, `policy:export` all `granted=true`.
- **Hard reload** → both toggles still `aria-pressed=true`; count "4 of 48" (3 granular keys + the derived "Approve Policy Reviews" label). Persisted correctly.
- Screenshot: `02-khalid-toggles-on.png`.
- SQL: `select permission_key, granted from user_permissions where user_id='8b8a0cb8-0dc6-4af8-968d-8fe983e556a8'`
- Cleanup: toggled all three back off via UI; DB restored to `{policy:create}` only.
- Note (by-design, not a bug): the "Approve Policy Reviews" label and the granular "Policies → Edit" toggle both map to backend key `policy:edit`. After a reload the granular Edit toggle reflects that key, so turning the *label* off does not revoke the key while the granular Edit toggle is on (the store OR-merges shared keys — `team-store.ts:336`). Cleanup required toggling the granular Edit off too.

### 1c — Tooltips are plain-language — PASS
- Hover "Approve Policy Reviews" → tooltip **"Approve or reject steps in the policy review workflow."**
- Hover granular Policies → Export → tooltip **"Allows exporting Policies to PDF or CSV."**
- No raw keys (`policy:edit`, `policy:export`) shown. Screenshot: `01-tooltip-approve-policy-reviews.png`.

### 1d — Admin/Manager rows disabled / all-on — PASS
- Every toggle on the ComplianceOS Admin row and the Sara (manager) row renders `[disabled] [pressed]` (all-on, not editable). Drawer shows "Admin role grants every permission automatically." Confirmed in section snapshot.

---

## 2. RBAC enforcement + error UX

### 2a — Enforcement blocks the mutation — PASS
Khalid (officer) is the **Observation Leader** of `#OBS-2026-00017`, so `canEditObservation` (admin OR leader) is true → the row's Edit/Delete menu is shown to him. But the store gate `requirePermission('Manage Audit Findings')` checks the manager-tier registry label, which an officer lacks.
- Clicked row ⋯ → **Delete** → typed `DELETE` → confirmed.
- DB after: `select … from observations where reference='OBS-2026-00017'` → row still present, `deleted_at = null`. Mutation correctly blocked client-side (no observation API call fired at all). Enforcement works.

### 2b — Error UX on denial — **FAIL** (silent console error, NO toast)
Same Delete action as above, from the user's perspective:
- **No toast appeared.** No `[role="alert"]`, no permission/denied text anywhere on screen. The confirmation dialog just silently closed.
- The only signal was a dev-console error: `Failed to delete observation: RBACError: Manage Audit Findings required`.
- Repeated for **Edit** (changed title, Save Changes): again silent — console `Failed to update observation: RBACError: Manage Audit Findings required`, no toast, modal closed, DB unchanged.
- Screenshot: `03-rbac-delete-silent-no-toast.png` (note: no toast pill visible bottom-right).

**Root cause:** `src/app/(dashboard)/correspondence/observations/page.tsx`
- `handleDeleteConfirm` (~lines 321–329): `catch (error) { console.error('Failed to delete observation:', error) }` — logs only, no `pushToast`. Because the RBACError is caught locally it also never reaches the global `unhandledrejection` listener that `RBACToastHost` (`src/components/auth/rbac-toast.tsx`) depends on, so the safety-net toast never fires either.
- `handleEditSave` (~line 16072 in the bundle; same file) has the identical pattern: `Failed to update observation:` console-only.

This is exactly the "silent console error (NOT a toast)" anti-pattern. The fix is to surface `pushToast(t('rbac.deniedActionToast'), 'error')` (the string already exists: *"You don't have permission to do this. If you need access, ask an administrator."*) when the caught error is an `RBACError`. Note the infrastructure is otherwise correct — for call sites that DON'T catch locally, `RBACToastHost` would show `rbac.deniedToast`. The observations page just over-catches.

### 2c — Positive create/edit path — PARTIAL
- **Admin** edited `#OBS-2026-00017` (title → "test QA-EDIT-OK") → succeeded, no error, row updated; DB `title='test QA-EDIT-OK'`, `updated_at` advanced. Reverted to "test" via UI. Edit pipeline works end-to-end. PASS for admin.
- **PARTIAL because** the scope's "officer create/edit works" expectation does **not** hold for officers on observations: an officer who is even the observation *leader* (Khalid) cannot edit/delete — the action throws RBACError (`Manage Audit Findings` is manager-tier) and fails silently (see 2b). A manager who is *not* the leader (Sara) doesn't even see the menu (`canEditObservation` = admin-or-leader only). So on this entity, only **admin** (or a leader who also holds the manager label) can actually edit. Worth confirming whether officers are intended to manage observations they lead.

---

## 3. Dashboard — Managerial view — PASS

Route: `/dashboard`, Managerial tab active (`aria-pressed=true`).
- **Observations by Source → SAMA Observations: `01`, "1 Critical, 0 High".** Matches the expected "1 Critical (not 3)".
- DB cross-check: `select source, severity, status, count(*) … group by …` → SAMA critical = 3 total, but **2 closed + 1 open**. Card counts only the open one → correct.
- **Business Health: 50%** (Status: At Risk, Target Threshold 85%). Alert banner: *"Trend Alert — Compliance score 50% is below target of 85%."* Top Issues list: "1 critical sama observation open" (8pt), "1 overdue circular(s)" (4pt), "SAMA Letters score critically low (25%)" (3pt).
- Page rendered with **0 console errors**.
- Screenshot: `04-dashboard-managerial-sama-1-critical.png`.

---

## 4. Input-error messaging (file upload) — PASS

Tested via top-right avatar → **Edit Profile** → **Upload Photo**. File input `accept="image/png,image/jpeg,image/webp"`. Validation in `src/lib/upload-validation.ts` + `src/components/profile/profile-modal.tsx` (inline rose error at line ~205).

- **Non-image** (`not-an-image.txt`, text/plain) → inline error: **"This file type isn't supported. Please upload a PNG, JPG, or WebP image."** Screenshot: `05-profile-upload-wrongtype-error.png`.
- **Oversized** (`big-image.png`, 6.1 MB, valid PNG MIME) → inline error: **"This image is over the 5 MB limit. Please choose a smaller one."** Screenshot: `06-profile-upload-toolarge-error.png`.

Both messages are clear, localized, and actionable (state what happened + how to fix). Test fixtures created under the artifacts dir and deleted after the test.

---

## 5. Unread badges + Department name — PASS

### 5a — Unread badges populate on load
- Signed in as Khalid: sidebar **Messages** button shows badge **"2"**; Notifications shows no badge.
- DB cross-check:
  - `select coalesce(sum(unread_count),0) from message_thread_participants where user_id='8b8a0cb8-…'` → **2** (2 threads). Matches the Messages badge.
  - `select count(*) filter (where not read) from notifications where user_id='8b8a0cb8-…'` → **0**. Matches the absent Notifications badge.
- (Earlier, as admin, Notifications showed "1"; as Noura, Notifications showed "2" — badges are per-user and populate on load.)
- Screenshot: `08-sidebar-badges-khalid.png`.

### 5b — Department shows a name, not a UUID
- Edit Profile for Khalid (department_id `d07fc34b-…`) → Department field renders **"Internal Audit"**. No UUID anywhere in the form (inputs: "Khalid Al-Harbi", email, "Internal Audit", "officer"). Resolved via `useDepartmentStore` in `profile-modal.tsx:67`.
- Admin (no department) → field shows "—" (no UUID leak).
- Screenshot: `07-profile-department-name-not-uuid.png`.

---

## Failures — quick index

- **2b — RBAC denial is silent (FAIL, high).** Observations Delete/Edit by a non-permitted user throws `RBACError`, caught and only `console.error`-logged — no toast, dialog closes silently. User gets zero feedback. Fix: surface `pushToast('rbac.deniedActionToast','error')` on caught `RBACError` in `handleDeleteConfirm` and `handleEditSave` (`src/app/(dashboard)/correspondence/observations/page.tsx`).
- **2c — Officer cannot edit observations they lead (PARTIAL, medium).** `requirePermission('Manage Audit Findings')` is manager-tier; an officer leader is blocked (and the block is silent per 2b). Confirm intended ownership model.

## Reproduction (FAIL 2b)

1. `/team/directory` as admin is not needed; the seed already makes Khalid the leader of OBS-2026-00017.
2. Sign in `auditor@complianceos.local` / `ComplianceOS!2026` (this is Khalid, officer).
3. Go to `/correspondence/observations` → row `#OBS-2026-00017` → click the ⋯ actions button → **Delete**.
4. Type `DELETE`, click **Delete**.
5. Observe: dialog closes, **no toast, no message**. DevTools console shows `Failed to delete observation: RBACError: Manage Audit Findings required`.
6. Verify DB unchanged: `select reference, deleted_at from observations where reference='OBS-2026-00017';` → `deleted_at` is null.
7. Repeat with **Edit** → change title → **Save Changes**: same silent failure, console `Failed to update observation: RBACError …`.
- Code pointer: `src/app/(dashboard)/correspondence/observations/page.tsx` `handleDeleteConfirm` (catch → console.error only) and `handleEditSave` (same).

## Console / network noise observed (not in scope, minor)

- `user_activity_logs` → **401** for non-admin users (Khalid/Noura): the client-side `useUserLogStore.log()` writes directly to Supabase and RLS rejects non-admins. Swallowed; no UX impact, but it spams the console.
- Two `ApiClientError: Internal server error` from a background `update` action surfaced during the officer session (no corresponding `/api/observations` call fired — these are not from the gated mutation). Likely a background log/last-login write; not reproduced deterministically. Flagging for awareness.
- `/api/me` 404 and `/login` 404 were **my probes** (those routes don't exist; sign-in is at `/sign-in`, current-user comes via `/api/team/members`), not app defects.

## State left clean

- Khalid `user_permissions` restored to `{policy:create}` only.
- OBS-2026-00017 restored to `title='test'`, not deleted.
- Test fixture files deleted. 8 screenshots retained as evidence.
