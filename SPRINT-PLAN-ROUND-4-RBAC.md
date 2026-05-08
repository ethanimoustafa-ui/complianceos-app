# Sprint Plan — Round 4: Role-Based Access Control (RBAC)

**Source:** Deferred from round 3 §6 / §9. The Mar 2026 demo direction (`src/lib/permissions.ts:3-10`) intentionally neutralised every gate so the demo could showcase the full app to any reviewer. Round 4 reverses that decision: real role + permission enforcement, real login, real approval gates, with a "switch user" affordance preserved for demo.

**Inputs:** Audit run May 8 2026 (transcript captured below in §A). The audit is the source of truth for the current state — the plan builds on what already exists rather than inventing parallel systems.

---

## Section 0 — What is locked / approved (do not touch)

These survived rounds 1-3 and stay as-is. RBAC adapts around them, not the other way around.

1. The 7-entry `STANDARD_PERMISSIONS` set in `team-store.ts:6-14`. **Reuse**, don't replace. Round 4 may add to it (see §2.2) but won't break the existing labels.
2. `TeamMember.accessControls` shape (`{label,enabled}[]`). Reuse.
3. `User.role: 'officer' | 'manager' | 'admin'` literal union (`types/index.ts:6`) and `ROLE_HIERARCHY` (`permissions.ts:12`). Reuse.
4. `RoleGuard` component (`src/components/auth/role-guard.tsx`). **Reuse**, but its underlying helpers will be re-enabled (§4).
5. The "any field whose value drives a calculation must not be user-editable" rule from round 3 §2.1 — RBAC does not loosen this. Calc-bound enums stay locked for everyone, including admins. Configurable lists become admin-only.
6. The Member Detail Drawer's staged-permissions UX (`member-detail-drawer.tsx:266-300`). Reuse; only its persistence pathway gets new audit-log entries.
7. The `member-detail-drawer.tsx:89, 252` direct admin-elevation check. **Keep working** even though it doesn't go through helpers — it's the one gate that actually fires today.

---

## Section 1 — Goals and non-goals

### Goals
- Re-enable real permission enforcement across the app.
- Connect `User.permissions` to `TeamMember.accessControls` so a logged-in user inherits the access controls assigned to them in Team → Directory.
- Make every Add / Edit / Delete / Approve / Configure button respect the current user's permissions.
- Make approval flows (policy, SAMA letter, audit findings) refuse the action when the current user lacks the right permission.
- Gate Settings → Lists & Categories, Frameworks, Templates to admin-only.
- Provide a demo-mode "Switch User" affordance so a tester can hop between officer / manager / admin without editing code.
- Enforce route-level access (the dashboard layout redirects unauthenticated users to sign-in; sign-in actually calls `useAuthStore.login`).
- Audit-log every permission grant / revoke / denied action.

### Non-goals
- **No backend.** Everything stays client-side; persisted state is the source of truth. Server-side enforcement is a downstream concern.
- **No new permission scheme.** We extend the existing `STANDARD_PERMISSIONS` registry; we don't introduce ABAC, scopes, hierarchical groups, etc.
- **No multi-tenant.** One organisation, one set of users.
- **No fine-grained field-level R/W.** Page + action gating is the granularity. Field-level read-deny is handled by hiding the surface that exposes the field.
- **No SSO / OAuth / 2FA.** Mock login only.
- **No password reset flows.** The auth pages exist but stay cosmetic.

---

## Section 2 — Role and permission taxonomy

### 2.1 Roles (unchanged)
Stays as `'officer' | 'manager' | 'admin'`. Display labels remain in i18n (`team.role*` keys).

Default permission bundles per role (used as a starting bundle when a member is invited; can be customised per-member by an admin afterwards):

| Permission | Officer | Manager | Admin |
|---|---|---|---|
| `Approve Policy Reviews` | — | ✅ | ✅ |
| `Approve SAMA Letters` | — | ✅ | ✅ |
| `Manage Audit Findings` | — | ✅ | ✅ |
| `View Risk Register` | ✅ | ✅ | ✅ |
| `Export Compliance Data` | — | ✅ | ✅ |
| `Can Act As Approver` | — | ✅ | ✅ |
| `Manage Training Programs` | — | ✅ | ✅ |
| `Manage Settings` *(new — see 2.2)* | — | — | ✅ |
| `Manage Team & Permissions` *(new)* | — | — | ✅ |
| `Configure Frameworks` *(new)* | — | — | ✅ |
| `Configure Lists & Categories` *(new)* | — | — | ✅ |
| `Manage Letter Templates` *(new)* | — | — | ✅ |
| `Manage Policy Templates` *(new)* | — | — | ✅ |
| `Manage Audit Templates` *(new)* | — | — | ✅ |
| `Switch User (Demo)` *(new — see §10)* | — | — | ✅ |

### 2.2 New permissions to add
Append to `STANDARD_PERMISSIONS` in `team-store.ts`. Each is a string label exactly as written in the table above. Add corresponding i18n keys under `team.permissionLabels.*` in both `en.json` and `ar.json`.

### 2.3 Permission registry as a typed value
Introduce a typed Permission union so callers can't typo a permission string:

```ts
// src/lib/permissions.ts (extend, don't replace)
export const PERMISSIONS = [
  'Approve Policy Reviews',
  'Approve SAMA Letters',
  'Manage Audit Findings',
  'View Risk Register',
  'Export Compliance Data',
  'Can Act As Approver',
  'Manage Training Programs',
  'Manage Settings',
  'Manage Team & Permissions',
  'Configure Frameworks',
  'Configure Lists & Categories',
  'Manage Letter Templates',
  'Manage Policy Templates',
  'Manage Audit Templates',
  'Switch User (Demo)',
] as const
export type Permission = (typeof PERMISSIONS)[number]
```

Match this against the existing `STANDARD_PERMISSIONS` constant — they should be the same set. Re-export `STANDARD_PERMISSIONS = PERMISSIONS` for backwards compatibility with the team-store's `perms()` helper.

### 2.4 Mapping a User to a permission set

```ts
function getEffectivePermissions(user: User, members: TeamMember[]): Permission[] {
  // 1. Admin always has every permission.
  if (user.role === 'admin') return [...PERMISSIONS]

  // 2. Look up the team member record by id (auth-store.user.id should match
  //    a TeamMember.id; see §3.4 for the seeding strategy that ensures this).
  const member = members.find((m) => m.id === user.id)
  if (!member) return []

  // 3. The member's accessControls drive their permission set.
  return (member.accessControls ?? [])
    .filter((ac) => ac.enabled && PERMISSIONS.includes(ac.label as Permission))
    .map((ac) => ac.label as Permission)
}
```

The result is cached on `User.permissions` whenever auth state or team state changes.

---

## Section 3 — Auth store overhaul

### 3.1 Multiple seed users
Today's auth store has exactly one hardcoded user. Replace with a seed-users array that mirrors the team-store seeds, so impersonation can pick any of them.

```ts
// src/stores/auth-store.ts
const SEED_USERS: User[] = [
  // mirrors team-store seeds 1..5 plus the existing 'current-user' admin
  { id: 'admin', name: 'Test Admin', email: 'admin@example.com', role: 'admin', department: 'Compliance', ... },
  { id: '1', name: 'Sarah Connor', role: 'manager', department: 'Compliance', ... },
  { id: '2', name: 'Michael Scott', role: 'officer', department: 'Legal', ... },
  // etc.
]
```

The default current user remains the admin so existing demo flows still work.

### 3.2 `switchUser` action
```ts
switchUser: (userId: string) => void
```
Used by the demo "Acting As" picker (§10). Logs an entry in `user-log-store` with action `auth.switch_user` whenever fired. Gated on the actor having `Switch User (Demo)` permission OR being an admin.

### 3.3 Real `login` wired
`(auth)/sign-in/page.tsx:35-42` currently does `setTimeout → router.push('/dashboard')`. Replace with:
```tsx
const result = await login(email, password)
if (result.ok) router.push('/dashboard')
else setError(result.error)
```
Mock-login behaviour: match `email` against `SEED_USERS`, ignore password (still demo). If no match, surface "Invalid credentials". Drop the migrate-fn admin backdoor: the migration should preserve whatever was persisted; if nothing is persisted, default to the admin seed.

### 3.4 `User.id` ↔ `TeamMember.id` alignment
Auth user `'current-user'` is decoupled from team-member ids today. Round 4 unifies them:
- Existing seed admin id changes from `'current-user'` → `'admin'` (or any team-member id, but pick one and keep it consistent).
- Persist migration v3 → v4: any persisted user with `id: 'current-user'` is rewritten to `id: 'admin'`.
- This way `getEffectivePermissions(user, members)` actually finds a record.

### 3.5 Hydrating `User.permissions`
- Add a derived store hook `useEffectivePermissions()` that calls `getEffectivePermissions(authUser, teamMembers)` and memoises by `[authUser.id, teamMembers]`.
- Auth store no longer needs to persist `permissions` directly; treat it as derived.

---

## Section 4 — Re-enable permission helpers

`src/lib/permissions.ts:22-30` returns `!!user` for every check. Replace each with the real check using `getEffectivePermissions`.

| Helper | New behaviour |
|---|---|
| `hasPermission(user, perm)` | Returns true iff `getEffectivePermissions(user, members).includes(perm)`. |
| `canEdit(user, resource)` | Per-resource map; e.g. `canEdit(user, 'policy')` requires `'Approve Policy Reviews'` OR admin. Document the map. |
| `canDelete(user, resource)` | Same shape. Default deny-officer, allow-manager-and-admin unless overridden. |
| `isAdmin(user)` | `user.role === 'admin'`. |
| `hasRole(user, minRole)` | Compare against `ROLE_HIERARCHY`. |
| `canAccessModule(user, module)` | Module → required permission map; e.g. `'settings' → 'Manage Settings'`, `'team' → null` (every role can VIEW team), `'team:edit' → 'Manage Team & Permissions'`. |
| `canPerformAction(user, action)` | Generic: action string → permission map. |
| `canExport(user)` | `'Export Compliance Data'`. |

The neutralisation comment block (`permissions.ts:3-10`) becomes the new contract docstring.

---

## Section 5 — `useCan` hook + `<Gate>` component

`<RoleGuard>` exists. Add a more ergonomic pair:

```tsx
// src/lib/permissions.ts
export function useCan(perm: Permission | Permission[]): boolean {
  const user = useAuthStore((s) => s.user)
  const members = useTeamStore((s) => s.members)
  const effective = useMemo(
    () => getEffectivePermissions(user, members),
    [user, members],
  )
  const list = Array.isArray(perm) ? perm : [perm]
  return list.every((p) => effective.includes(p))
}

// src/components/auth/Gate.tsx
export function Gate({
  perm, fallback, children,
}: { perm: Permission | Permission[]; fallback?: ReactNode; children: ReactNode }) {
  return useCan(perm) ? <>{children}</> : <>{fallback ?? null}</>
}
```

`Gate` covers the common case (hide a button); `useCan` covers conditional logic (e.g. disable + tooltip explaining why).

`RoleGuard` stays for legacy call sites; internally it calls `useCan` once helpers are re-enabled.

---

## Section 6 — Route / layout guard

### 6.1 Dashboard layout
`src/app/(dashboard)/layout.tsx` currently has no guard. Add a `useEffect` that redirects to `/sign-in` when `!useAuthStore.isAuthenticated`. While loading the persist hydration, show a skeleton (don't redirect prematurely).

### 6.2 Auth layout
`src/app/(auth)/layout.tsx` (or `(auth)/sign-in/page.tsx` directly) — if already authenticated, redirect to `/dashboard`.

### 6.3 Module-level guards
For pages whose entire purpose is admin-only (Settings sub-tabs that render `Lists & Categories`, `Frameworks`, `Templates`):
- Wrap the section / tab in `<Gate perm="Manage Settings" fallback={<ForbiddenPanel />}>`.
- A small `<ForbiddenPanel />` component renders an iconography + "You don't have permission to view this section. Ask an admin to enable it for you."

### 6.4 No `middleware.ts`
The app is a static demo; do everything in the layout effect. Don't introduce Next middleware.

---

## Section 7 — Page-by-page surface enforcement sweep

The audit confirmed every dashboard page is currently ungated. Sweep:

### 7.1 Always-visible pages (any role)
- `/dashboard` — render for all; some cards (e.g. "Pending Approvals") read `useCan('Approve Policy Reviews')` to decide whether to show.
- `/calendar` — read for all; create-event affordance gated on `Manage Training Programs` (events are mostly training).
- `/correspondence/feed` and child tabs — view for all; "Add Correspondence" gated on `Manage Audit Findings` (closest existing perm).
- `/correspondence/observations` — view for all; "Add Observation" gated on `Manage Audit Findings`.
- `/team/directory` — read for all; "Invite Member" + per-member edit gated on `Manage Team & Permissions`.
- `/team/training` — read for all; "Add Course" + employee edit gated on `Manage Training Programs`.

### 7.2 Manager+ pages
- `/correspondence/sama-letters` — view for all; "Draft New Letter" + per-step approve buttons gated on `Approve SAMA Letters` (the latter additionally checks `currentUser.id === step.assigneeId` if the step is assigned).
- `/correspondence/regulatory-updates/policies` — view for all; create / edit / approve gated on `Approve Policy Reviews`.
- `/correspondence/regulatory-updates/rules` — view for all; create / edit gated on `Manage Audit Findings`.
- `/correspondence/advisory` — view for all; create / reassign gated on `Manage Audit Findings`.
- `/reports/[auditId]` and audit modals — gated on `Manage Audit Findings`.
- `/reports/(tabs)/risks` — view for all; risk add/edit gated on `Manage Audit Findings`.
- `/team/logs` — view for all; export gated on `Export Compliance Data`.

### 7.3 Admin-only pages
- `/settings` — entire page wrapped in `<Gate perm="Manage Settings">` with the `ForbiddenPanel` fallback.
- The Lists & Categories launcher (round 3 §2.6) — same gate.
- Frameworks section + `FrameworkConfigModal` — `Configure Frameworks`.
- Audit Templates / Policy Templates sections — respective Manage perms.
- Notification preferences / User preferences — admin only for the org-wide setting; per-user preferences scoped to current user only.

### 7.4 Inline button gating pattern
Standard pattern, applied uniformly:
```tsx
<Gate perm="Approve Policy Reviews">
  <Button onClick={onApprove}>{t('common.approve')}</Button>
</Gate>
```
For disabled-with-tooltip variants:
```tsx
const canApprove = useCan('Approve Policy Reviews')
<Button disabled={!canApprove} title={canApprove ? '' : t('rbac.deniedTooltip')}>
  {t('common.approve')}
</Button>
```
Pick `disabled+tooltip` for actions in the same row as the user's current task (so they understand why); pick `Gate` (hide entirely) for higher-level affordances (e.g. "Invite Member" in an empty header).

---

## Section 8 — Store-action enforcement

Every store action that mutates business state takes an optional `actor` argument today (e.g. `approveStep(id, step, approverName, notes)`). Extend the contract: each action consults the current user's permissions before mutating.

### 8.1 Pattern
```ts
// src/stores/sama-letter-store.ts
approveStep: (id, step, notes) => {
  const user = useAuthStore.getState().user
  const members = useTeamStore.getState().members
  const can = getEffectivePermissions(user, members).includes('Approve SAMA Letters')
  if (!user || !can) {
    useUserLogStore.getState().log({
      userId: user?.id ?? 'anonymous',
      action: 'auth.permission_denied',
      target: `samaLetter:${id}:step:${step}`,
    })
    throw new RBACError('Approve SAMA Letters required')
  }
  // … existing mutation, replacing `approverName` with `user.name`.
}
```

`RBACError` is a small typed error class. UI handlers catch it and surface a toast: "You don't have permission to do this."

### 8.2 Stores to update
- `sama-letter-store` — `submitForApproval`, `approveStep`, `rejectStep`, `send`, `markResponseReceived`.
- `policy-store` — `submitForReview`, `approve`, `initiateReview`.
- `risk-store` — `add`, `update`, `remove`, `accept`, `resolve`.
- `audit-store` — `add`, `update`, `closeFinding`, `assignFinding`.
- `observation-store` — `add`, `update`, `close`, `reassign`.
- `policy-template-store`, `audit-template-store`, `framework-config-store` — admin-only mutations.
- `team-store` — `invite`, `remove`, `update`, `setAccessControls` — admin-only. Permission grant/revoke logs an `auth.permission_changed` entry with the diff.
- `framework-sub-category-store` — admin-only.
- All ten configurable-list stores from round 3 §2.3 — admin-only mutations.

The eight `userLog.log(...)` calls are part of §12.

### 8.3 Read-only actions
Read selectors stay open to all logged-in users. RBAC is about mutations, not reads (a team member viewing the risk register is fine; only modifying it requires permission).

---

## Section 9 — Member detail drawer: admin assigns permissions

`member-detail-drawer.tsx` already has the staged-permissions UX. Round 4 enhancements:

1. **Wrap the whole permissions panel in `<Gate perm="Manage Team & Permissions">`.** Non-admins see a read-only summary of the member's permissions instead of toggle controls.
2. **Audit log on commit.** When the admin clicks "Update Permissions" and changes are persisted, write a `team.permissions_changed` entry to `user-log-store` with:
   - `actor`: current admin's id + name
   - `targetMember`: id + name
   - `granted`: `Permission[]`
   - `revoked`: `Permission[]`
   The diff is computed against the pre-staged baseline already kept in the drawer.
3. **Role-elevation check (`member-detail-drawer.tsx:89, 252`).** Already correct; just replace the inline `currentUser?.role === 'admin'` with `useCan('Manage Team & Permissions')` to align with the new system.
4. **Remove "Can Act As Approver" from the standard toggles**, since round 3 already merged that flag into the regular `accessControls` array. Confirmed at `team-store.ts` per round-3 sprint-2 notes.

---

## Section 10 — "Acting As" / impersonation for demo

The product is a demo. Stakeholders need to switch between officer / manager / admin to exercise gates. Add a top-bar dropdown:

- **Affordance.** A small `<UserSwitcher>` component in the dashboard header (next to the user avatar, only visible if `useCan('Switch User (Demo)')` is true — admins by default).
- **UI.** Lists the seed users with their role badge. Click selects → calls `auth.switchUser(id)`. Shows current user as "Acting as: {name} ({role})".
- **Persistence.** The switch persists to the auth-store, so reload preserves the impersonation. A "Reset to my account" item at the bottom restores the original admin.
- **Audit.** Every switch logs `auth.switch_user` to `user-log-store`.
- **Demo banner.** When the current `auth.user` is not the original logged-in admin, render a thin amber banner at the top of the dashboard: "Demo mode: acting as {name}".

This keeps the existing demo-direction promise (any tester can experience the full app) while making the gates real.

---

## Section 11 — Sign-in & onboarding flow

### 11.1 Sign-in
`(auth)/sign-in/page.tsx:35-42` is currently fake. Replace with a real call to `auth.login(email, password)`. The mock implementation does:
- Match `email` against `SEED_USERS`. Case-insensitive.
- If matched, `setUser(matchedUser)` and `setIsAuthenticated(true)`. Token is `'demo-token'`.
- If not matched, return `{ ok: false, error: 'Invalid credentials' }` and surface that in the form.
- A "Sign in as demo admin" shortcut button stays for tester convenience.

### 11.2 Sign-up + verify-email + forgot-password
Stay cosmetic — they don't write to auth-store today. Round 4 leaves them alone, just adds a comment that they're stubbed.

### 11.3 Onboarding
`(auth)/onboarding/page.tsx` collects company config but doesn't write to auth. Round 4 leaves the data flow untouched; if onboarding has not been completed, an admin can still reach the app (the framework / dept seeds cover the gap).

### 11.4 Logout
`auth.logout()` already exists. Verify the dashboard layout's redirect kicks in after logout. Add a `team.logout` audit entry.

---

## Section 12 — Audit logging

`user-log-store` is the existing surface (`src/stores/user-log-store.ts`). Round 4 adds these actions:

| Action | When | Payload |
|---|---|---|
| `auth.login` | Successful login | `userId, ip:'demo', userAgent:'demo'` |
| `auth.logout` | Logout | `userId` |
| `auth.switch_user` | Acting As change | `actorId, targetUserId` |
| `auth.permission_denied` | Mutation refused | `userId, attemptedAction, target` |
| `team.permissions_changed` | Member detail drawer commit | `actorId, targetMemberId, granted[], revoked[]` |
| `team.member_invited` / `member_removed` / `member_role_changed` | Team store mutations | `actorId, targetMemberId, ...` |
| `policy.approval_step_committed` / `policy.rejection` | Policy approval | `actorId, policyId, step, decision` |
| `samaLetter.approval_step_committed` / `samaLetter.sent` | Letter approval / send | `actorId, letterId, step` |

Surface in `/team/logs` (already lists action filters). The existing log filter `<EditableSelect>` (round 3 §3 sweep) will need the new action ids added to its options.

---

## Section 13 — Suggested execution order

Sequence is critical because re-enabling helpers will surface every place they're consulted. If §4 lands before §3, the app may break for the demo admin since their `User.id` doesn't match a `TeamMember.id` yet.

1. **Phase 1 — Plumbing (single agent)**
   1. §3.1 Multi-seed users in auth-store
   2. §3.4 `User.id ↔ TeamMember.id` alignment (migration v4)
   3. §3.5 `useEffectivePermissions` hook
   4. §2.2 Add new permission strings + i18n keys
   5. §2.3 Typed `Permission` union
2. **Phase 2 — Helpers + components (single agent, depends on 1)**
   1. §4 Re-enable `permissions.ts` helpers
   2. §5 `useCan` + `<Gate>` component
   3. `<ForbiddenPanel />` placeholder
3. **Phase 3 — Sign-in + layout (single agent, parallel with Phase 4)**
   1. §11.1 Real sign-in
   2. §6.1 Dashboard layout redirect
   3. §6.2 Auth layout already-authenticated redirect
   4. §3.2 `switchUser` action + log entry
4. **Phase 4 — Acting-As UI (single agent, parallel with Phase 3)**
   1. §10 `<UserSwitcher>` header component
   2. Demo banner
5. **Phase 5 — Surface enforcement (parallel team, after 1+2 land)**
   - 5A: Settings sweep (`§7.3` — Settings + Lists & Categories + Frameworks + Templates)
   - 5B: Correspondence sweep (sama-letters, advisory, regulatory-updates)
   - 5C: Reports + risks + audits sweep
   - 5D: Team + observations sweep
6. **Phase 6 — Store-action enforcement (single agent, after 5)**
   1. §8 enforcement in every mutating store
   2. `RBACError` class + UI toast handler
7. **Phase 7 — Member drawer + audit log (single agent)**
   1. §9 Member drawer hardening
   2. §12 Audit logging additions
   3. Filter additions in `/team/logs`
8. **Phase 8 — Verification (Playwright + tsc)**
   - Run as different seed users; confirm gates fire correctly
   - Capture console for any `RBACError` thrown unexpectedly

---

## Section 14 — File-conflict map

Big shared files round 4 will touch:

- `src/lib/permissions.ts` — Phases 1, 2.
- `src/stores/auth-store.ts` — Phase 1, 3.
- `src/stores/team-store.ts` — Phase 1, 7.
- `src/types/index.ts` — Phase 1 (extend `User.permissions`, add Permission union if not in lib/).
- `src/i18n/dictionaries/{en,ar}.json` — Phases 1, 2 (`team.permissionLabels.*`, `rbac.*`, `forbidden.*` keys). Coordinate so each phase adds to a unique top-level section.
- `src/app/(dashboard)/layout.tsx` — Phase 3.
- `src/components/team/directory/member-detail-drawer.tsx` — Phase 7.
- `src/stores/{sama-letter,policy,risk,audit,observation,team,*-template,*-category,*-config}-store.ts` — Phase 6.
- `src/components/auth/role-guard.tsx` — Phase 2 (internal rewrite to use `useCan`).
- `src/app/(dashboard)/team/logs/page.tsx` — Phase 7 (new action ids in filter).

---

## Section 15 — Acceptance criteria

A checklist for the verification phase:

1. **Sign-in works as different users.** Enter `officer@example.com` / any password — lands on dashboard as Sarah Connor (officer). Sign out, re-enter as `admin@example.com` — lands as the admin.
2. **Officer cannot approve a policy.** As officer, the "Approve" button on a policy detail page is hidden (or disabled + tooltip). Trying to call the store action directly throws `RBACError`.
3. **Manager can approve a policy.** As manager, "Approve" button is visible and click commits the step.
4. **Officer cannot edit a SAMA letter approval step.** "Approve / Reject" buttons hidden.
5. **Officer cannot open Settings.** Navigating to `/settings` shows the `<ForbiddenPanel />` fallback.
6. **Admin can configure Frameworks.** All FrameworkConfigModal CRUD works.
7. **Admin can grant `Approve SAMA Letters` to a manager via the drawer.** After "Update Permissions" is clicked, the audit log records `team.permissions_changed` with `granted: ['Approve SAMA Letters']`. Switching to that manager via Acting-As shows the SAMA approval buttons available.
8. **Acting-As affordance is admin-only.** As officer, the user-switcher dropdown is hidden.
9. **Logout redirects to sign-in.** Reloading after logout stays on sign-in (no admin auto-restore).
10. **Refresh preserves impersonation.** As admin acting as officer, refreshing the page keeps the officer identity. Clicking "Reset to my account" restores admin.
11. **`/team/logs` shows all RBAC events.** Filter by action `auth.permission_denied` returns the entries created by attempted denied calls.
12. **Calc-bound enums remain non-editable for ALL roles.** Even admins cannot rename Severity / Priority / Status options. Only Lists & Categories editable lists are admin-only.

---

## Section 16 — Out of scope for round 4

- Server-side permission enforcement (no backend in this codebase).
- Field-level read-deny (we hide whole surfaces or sections, not individual columns).
- SSO / OAuth / 2FA / password reset / verify-email flows (cosmetic stubs stay cosmetic).
- A custom permission-builder UI for admins to define net-new permissions. The set in §2.1 is fixed.
- Multi-org / multi-tenant.
- Time-bound permissions ("admin until 2026-06-01"). The drawer's `accessDuration` field stays cosmetic.
- Permission inheritance / groups.
- Per-department permission scoping (e.g. "manager but only for IT department"). Out of scope; round 5 candidate.
- Localised role names beyond the existing `team.role*` keys.

---

## Section 17 — Quick reference

- **Last green commit before round 4:** `3ea0285` on `main` (May 8 2026, after round-3 follow-ups).
- **The audit (§A below) is the source of truth for "what exists today".** Read it before writing any code.
- **Permissions are still a list of strings** (not an enum on the JSON wire). The typed `Permission` union exists in TS land only.
- **Mutations require permission. Reads do not.** Use this rule when in doubt about whether to gate.
- **Calc-bound stays locked for everyone.** No role overrides this.
- **Demo Acting-As is an admin-only affordance.** Officers and managers can't use it.

---

## §A Pre-coding audit report (May 8 2026)

> Read before writing any RBAC code. file:line citations are factual snapshots; verify against current code if more than a week has passed.

**§A.1 Auth shape.** `User` type at `src/types/index.ts:2-15` — `{ id, name, email, role: 'officer'|'manager'|'admin', department, avatar?, phone?, avatarSeed?, workload, permissions?: string[], lastLogin?, createdAt? }`. `useAuthStore` at `src/stores/auth-store.ts:32-41` auto-initialises a hardcoded admin user `{ id: 'current-user', name: 'Test User', email: 'test@example.com', role: 'admin', department: 'Compliance' }` with `isAuthenticated: true`. Migration v3 (`auth-store.ts:127-140`) re-injects the same admin even if persisted state is wiped. Actions: `login` (mock; ignores email/password), `logout`, `refreshToken`, `updateProfile`, `setUser`, `setToken`. **No `switchUser`.**

**§A.2 Roles.** Closed union `'officer' | 'manager' | 'admin'`. `ROLE_HIERARCHY = ['officer', 'manager', 'admin']` at `permissions.ts:12`. `team.invite()` accepts the same union.

**§A.3 Permissions.** `STANDARD_PERMISSIONS` at `team-store.ts:6-14` — 7 strings: Approve Policy Reviews, Approve SAMA Letters, Manage Audit Findings, View Risk Register, Export Compliance Data, Can Act As Approver, Manage Training Programs. `perms()` helper at `team-store.ts:16-18` maps a `boolean[]` to `{label, enabled}[]`. **Stored on `TeamMember.accessControls?: {label,enabled}[]` at `types/index.ts:73`. Read by zero gating code paths.** Toggling the flags in the drawer is purely cosmetic.

**§A.4 Gates in the wild.** `permissions.ts:22-30` was deliberately neutered — every gate function returns `!!user`:
```
hasPermission/canEdit/canDelete/isAdmin/hasRole/canAccessModule/
canPerformAction/canExport → return !!user
```
Comment at `permissions.ts:3-10`: *"PERMISSION GATES INTENTIONALLY DISABLED (Mar 2026 demo direction)"*.

Live `RoleGuard` call sites (still wrapped, but no-ops):
- `app/(dashboard)/team/training/page.tsx:196` — `requiredRole="manager"`
- `app/(dashboard)/team/directory/page.tsx:224, 340` — `requiredPermission="team:invite"|"team:edit"`
- `components/settings/FrameworksSection.tsx:139, 207, 336` — `adminOnly`
- `components/settings/AuditTemplatesSection.tsx:71, 116, 372` — `adminOnly | editOnly | deleteOnly`
- `components/settings/PolicyTemplatesSection.tsx:82, 133, 377` — same
- `components/team/directory/pending-approvals-card.tsx:380` — `requiredRole="manager"`
- `components/team/directory/member-detail-drawer.tsx:188, 205, 240, 333` — `requiredRole="manager"` x3, `requiredRole="admin"` (delete)

Genuine `currentUser.role` checks (NOT routed through neutered helpers):
- `member-detail-drawer.tsx:89` — blocks role-elevation toast if `newRole === 'admin' && currentUser?.role !== 'admin'`
- `member-detail-drawer.tsx:252` — admin role option only appears in dropdown if `currentUser?.role === 'admin'`
- `team/directory/page.tsx:154` — `members.filter(m => m.role === 'admin').length` (display stat)

**§A.5 Pages missing guards.** Every page under `src/app/(dashboard)/**/page.tsx` is **NO-AUTH-GUARD**. The dashboard layout has no auth check. There is no `middleware.ts` at any level. Sign-in's `onSubmit` does NOT call `useAuthStore.login`; it just `router.push('/dashboard')` after a 1.5s timeout (`sign-in/page.tsx:35-42`).

**§A.6 Approval gaps.** SAMA letters: `submitForApproval / approveStep / rejectStep` accept any `approverName` string. Zero permission / role / assignee check. Caller passes `currentUser = user?.name || 'Current User'` for attribution only. Buttons render unconditionally inside `ApprovalStepActions`. Same shape for policy approve / submitForReview at `policy-store.ts:286-330`.

**§A.7 Notable gotchas.**
- Hardcoded admin backdoor (`auth-store.ts:32-41` and `:127-140`) — clearing localStorage rehydrates as admin via `migrate`.
- Single seed user. No `switchUser`, no impersonation, no role-picker. Comments in auth-store say "Change role to test" — manual code edit is the only mechanism.
- Permission gates intentionally disabled.
- `STANDARD_PERMISSIONS` unused.
- `accessControls` not on `User`/`auth-store.user` — only on `TeamMember`. `User.id = 'current-user'` deliberately doesn't collide with `TeamMember.id` 1..5.
- No `isDemo` / `MOCK_` flags. No demo-mode toggle.
- Onboarding page collects frameworks + company size only; never writes to `auth-store`.
- Role-elevation guard at drawer 89/252 is the ONLY role check that actually fires today.

**Key files for round 4:**
- `src/stores/auth-store.ts`
- `src/stores/team-store.ts`
- `src/lib/permissions.ts`
- `src/components/auth/role-guard.tsx`
- `src/components/team/directory/member-detail-drawer.tsx`
- `src/types/index.ts`
- `src/app/(auth)/sign-in/page.tsx`
- `src/app/(auth)/onboarding/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/stores/sama-letter-store.ts`
- `src/stores/policy-store.ts`
