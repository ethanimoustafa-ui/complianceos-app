# Phase 06 — Auth & RBAC wiring status

Supabase Auth + RBAC is now wired into the Next.js 16 App Router app. Below is the inventory of changes, the test-admin bootstrap steps, and what's left for follow-up phases.

## Files created

- `middleware.ts` — root middleware. Calls `updateSession` on every request, redirects unauthenticated users to `/sign-in?next=<path>`, and bounces signed-in users away from `/sign-in` and `/sign-up`.
- `src/lib/supabase/client.ts` — browser-side singleton (`createClient`) via `@supabase/ssr`'s `createBrowserClient`. Also exports a lazy `supabase` proxy that throws on SSR access.
- `src/lib/supabase/server.ts` — async `createClient()` factory for Server Components / Route Handlers / Server Actions, wired into `next/headers` `cookies()`.
- `src/lib/supabase/middleware.ts` — `updateSession(request)` helper using the canonical Supabase SSR cookie pattern. Returns `{ response, user }` so the root middleware can branch on session state.
- `src/components/auth/auth-listener.tsx` — top-level client component that subscribes to `supabase.auth.onAuthStateChange` and syncs the zustand `useAuthStore`. Mounted from the root layout.
- `src/app/api/auth/callback/route.ts` — Route Handler that exchanges the OAuth/email-confirmation `code` query param for a session, then redirects to `next` (defaults to `/dashboard`).
- `src/app/api/auth/signout/route.ts` — POST (and GET, for convenience) endpoint that calls `supabase.auth.signOut()` server-side and redirects to `/sign-in`.
- `.planning/06-auth-status.md` — this file.

## Files modified

- `package.json` — added `@supabase/supabase-js@^2.105.4` and `@supabase/ssr@^0.10.3`.
- `src/stores/auth-store.ts` — full rewrite. Removes `SEED_USERS`, `DEFAULT_USER`, `switchUser`, and the `persist` middleware. New canonical actions: `signIn`, `signOut`, `refreshSession`, `loadPermissions`, `setSessionUser`. Legacy aliases (`login`, `logout`, `refreshToken`, `updateProfile`, `setUser`, etc.) preserved as thin shims so the 33 existing consumer files keep compiling. Now hydrates `user` from the `profiles` table and `permissions: string[]` via the `user_roles → role_permissions → permissions` join. Mirrors `auth.login` / `auth.logout` to the `user_activity_logs` table (best-effort).
- `src/stores/user-log-store.ts` — `log()` now fires-and-forgets `auth.*` events to `user_activity_logs` via the browser Supabase client. Local zustand log retained for instant UI feedback.
- `src/lib/permissions.ts` — added `BACKEND_PERMISSIONS` const (25 lowercase:colon keys from the DB seed) + `BackendPermission` type. `useCan` / `useCanAny` now accept both legacy labels (`'Manage Settings'`) and backend keys (`'team:invite'`); they check the auth-store `permissions: string[]` array in addition to the team-store accessControls. Admins always pass.
- `src/app/layout.tsx` — mounts `<AuthListener />` inside `<LanguageProvider>`.
- `src/app/(dashboard)/layout.tsx` — removed mock-auth gating spinner and `DemoBanner` (acting-as banner). Auth gating is now enforced by the root `middleware.ts`. RBACToastHost retained.
- `src/components/layout/sidebar.tsx` — removed `<UserSwitcher />` and its import.
- `src/components/auth/sign-out-modal.tsx` — switched from `logout()` to `await signOut()` + `router.refresh()`.
- `src/app/(auth)/sign-in/page.tsx` — wired to `signIn(email, password)`. Removed the "Sign in as demo admin" shortcut and the seed-users hint. Removed the link to `/sign-up`, replaced with a "contact admin" line. Redirects to `/dashboard` on success and calls `router.refresh()` to let middleware see the new session cookie.
- `src/app/(auth)/sign-up/page.tsx` — replaced with an admin-only notice card + "Back to sign-in" button.
- `src/app/(auth)/forgot-password/page.tsx` — wired to `supabase.auth.resetPasswordForEmail` with `redirectTo: ${NEXT_PUBLIC_APP_URL}/api/auth/callback`. Always shows the success state to avoid leaking which emails exist.
- `src/app/(auth)/verify-email/page.tsx` — full rewrite. Reads `code` from URL, calls `supabase.auth.exchangeCodeForSession`, then redirects to `next` (defaults to `/sign-in`). Drops the mock 6-digit-code UI; Supabase confirmations use one-shot magic links.

## Files deleted

- `src/components/auth/user-switcher.tsx` — the acting-as demo affordance. No real-auth equivalent in MVP.

## Test-admin creation steps

The Supabase service-role key is not yet set in `.env.local`, so the auth admin API can't be called from code. Create the first admin via Supabase Studio:

### 1. Create the auth user (Supabase Studio)
1. Open https://supabase.com/dashboard/project/pamfhghrjfizlbhdfycu/auth/users
2. Click **Add user → Create new user**
3. Email: `admin@complianceos.local`
4. Password: pick a strong password (record it in 1Password / your team vault)
5. Toggle **Auto Confirm User** ON (so the email step is skipped)
6. Click **Create user**. Copy the resulting UUID from the users list — you'll paste it below as `<AUTH_USER_ID>`.

### 2. Seed profile + role (SQL Editor)

Run this in the Supabase Studio SQL Editor (or via the `mcp__supabase__execute_sql` tool) — replace `<AUTH_USER_ID>` with the UUID copied above:

```sql
-- Profile row
INSERT INTO public.profiles (id, email, name, role, status, joined_at)
VALUES (
  '<AUTH_USER_ID>',
  'admin@complianceos.local',
  'ComplianceOS Admin',
  'admin',
  'active',
  now()
)
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      status = EXCLUDED.status;

-- Grant org_admin role
INSERT INTO public.user_roles (user_id, role_id)
SELECT '<AUTH_USER_ID>', id FROM public.roles WHERE key = 'org_admin'
ON CONFLICT DO NOTHING;
```

### 3. Smoke-test
1. `npm run dev`, open http://localhost:3000/sign-in
2. Sign in with `admin@complianceos.local` + the password from step 1
3. You should land on `/dashboard` and the sidebar avatar should reflect the admin profile.

## TypeScript status

`npx tsc --noEmit` — **clean, no errors.**

## Left for the next phase

- **Service-role admin operations.** `SUPABASE_SERVICE_ROLE_KEY` is still blank in `.env.local`. Once populated, build a server-only admin client (`src/lib/supabase/admin.ts`) and a Route Handler for "invite user" so admins can provision accounts from the team page instead of the Studio dashboard.
- **Profile-update writes.** `useAuthStore.updateProfile()` currently only patches local state. Wire it to a `supabase.from('profiles').update(...)` call (or a Server Action) so changes persist.
- **MFA.** Deferred to Phase 2 per `BACKEND-API-MAP.md §13`. Supabase Auth supports TOTP factors out of the box; add an enrolment flow under `/settings/security` when scheduled.
- **OAuth providers (Google / Microsoft).** Sign-in page still renders the Google / Microsoft buttons as static UI — wire them up by calling `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: '/api/auth/callback' } })` when those providers are configured in the Supabase dashboard.
- **Per-resource RLS verification.** `public.has_permission(text)` is wired in the DB but the client-side helpers still read team-store accessControls for the label-based legacy gates. Next phase should audit each `<Gate perm="…">` site and migrate to the backend-key form where appropriate.
- **`user_activity_logs` IP / device capture.** Currently inserted with `ip_address: null`. Add headers-based capture in a server-side audit endpoint when the admin API land.
- **Onboarding flow → profile/team writes.** `src/app/(auth)/onboarding/page.tsx` still writes to local zustand stores only; once the relevant CRUD endpoints exist (Phase 7+), wire its submit handlers to Supabase.
- **i18n cleanup.** The `team.switchUser` translation keys remain in `en.json` / `ar.json`. Drop them in the next i18n audit pass.
