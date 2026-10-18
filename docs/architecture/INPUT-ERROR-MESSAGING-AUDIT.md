# Input-Error Messaging Audit

A site-wide pass to make sure every input error and operation failure shows the
user a **clear, non-blaming, actionable** message instead of failing silently or
leaking technical jargon.

## Writing rules applied to every message

- **Specific, no jargon** — never a raw exception, status code, or `Error 404`.
- **No blame** — avoid "invalid", "illegal", "you forgot".
- **Says what happened _and_ how to fix it** — never a dead end.
- **Concise** — no "oops"/"sorry" filler.

Surfaces used (matched to the failure): **inline validation** (under the field),
**toasts** (transient async failures), **inline alerts/banners** (in modals), and
**modals** (destructive confirms).

## Foundation

- **`<ToastHost />` is now mounted once, app-wide** (`(dashboard)/layout.tsx`) so
  any surface — including global ones like the message panel — can raise a toast.
  The three per-page mounts were removed.
- **Shared upload validator** — `src/lib/upload-validation.ts` (`validateFile`,
  `IMAGE_UPLOAD_RULE`, size/type constants mirroring the Storage buckets).
- **Shared error mapper** — `src/lib/supabase/auth-errors.ts` (`mapAuthError`)
  turns raw Supabase auth errors into stable, localized i18n keys.
- **New i18n namespaces** in `en.json` + `ar.json`:
  - `upload.*` — `tooLarge`, `tooLargeNamed`, `wrongType`, `failed`, `filesFailed`.
  - `errors.*` — reusable core (`saveFailed`, `createFailed`, `updateFailed`,
    `deleteFailed`, `loadFailed`, `network`, `generic`, `required`,
    `sessionExpired`) plus 81 feature-specific keys grouped by area
    (`errors.lettersCreate.*`, `errors.policies.*`, `errors.authPages.*`, …).

## The reported bug (fixed)

Uploading an oversized image as a **group photo in Messages** failed silently
(`console.error` only). It now pre-checks size (5 MB, the `avatars` bucket limit)
and type **before** upload and shows a clear inline error under the avatar; a
genuine upload failure shows an actionable message instead of nothing.

## Upload sites hardened

| Site | Before | After |
|---|---|---|
| Group photo (Messages) | silent console error | size/type pre-check + inline error |
| Profile photo | generic post-upload failure | size/type pre-check + actionable copy |
| Shared `FileUpload` | hardcoded English size error | localized, non-blaming, names file + limit |
| Observations upload modal | no size check, swallowed failure | 50 MB pre-check + caught failure + honest `accept` |
| Policy / letter-signature uploads | unvalidated | size/type validation + clear messages |

## Audit results

A multi-agent audit swept uploads, auth, every store, settings, correspondence,
reports/risks, observations, calendar, messages, and a cross-cutting pass for
silent `catch` blocks. **91 gaps were confirmed** (41 high / 44 medium / 6 low);
**79 were fixed** across 40 files (the remainder were already resolved by the
foundation work). Every fix reuses the toast/inline infrastructure and the shared
i18n keys above. Representative fixes:

- **Stores** (`audit`, `risk`, `circular`, `training`, `auth`) — optimistic
  mutations that rolled back silently now surface a toast.
- **Auth** — wrong credentials, unconfirmed email, rate-limit, expired links, and
  offline are all mapped to clear copy; validation messages are localized.
- **Letters** — a letter that saves but whose attachment upload fails now tells
  the user the file didn't attach and how to re-add it (was silently lost).
- **Settings / modals** — required-field and save failures are surfaced inline.

**Verification:** `tsc --noEmit` clean · `vitest` 189/189 pass · no new
build-blocking lint errors.

## Recommended follow-ups (broader, not in this pass)

The audit's completeness pass flagged architectural gaps beyond per-field input
errors. These are larger and best done deliberately:

1. **Page-level data-load failures** — stores set `error` on a failed initial
   fetch, but list/detail pages never read it; a load failure looks like "no data
   yet" forever. Add a "couldn't load — retry" state.
2. **Route-level error boundaries** — there is no `error.tsx`, `global-error.tsx`,
   or `not-found.tsx`. A render crash or bad deep-link shows a blank/English page.
3. **Network-loss copy** — `api-client` propagates raw "Failed to fetch"; map it to
   `errors.network` at the boundary.
4. **Session expiry** — a 401 silently redirects to sign-in mid-action with lost
   work; show "your session expired, please sign in again" (`errors.sessionExpired`).
5. **Sign-out failure** — `auth-store` sign-out has no catch.
6. **Export / PDF / CSV download failures** — surfaced only via `console.error` or
   a status-code string.
7. **Read-side permission (403)** — only 401 is special-cased; a 403 on page view
   yields an empty page instead of "you don't have access".
8. **Messaging send / realtime drop** — _partially addressed_ here (a failed
   send/create now toasts via the panel); a dropped realtime channel still leaves
   the chat silently stale.
