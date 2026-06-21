// App proxy (Next.js 16 routing "proxy" — formerly "middleware"). Runs on every
// PAGE request that matches `config.matcher`.
//
// IMPORTANT: this file MUST live at `src/proxy.ts` (NOT the project root)
// because the app uses a `src/` directory. Next.js only loads the proxy from
// `src/proxy.ts` when a `src` dir is present; a root-level file is SILENTLY
// IGNORED — which previously left every route ungated, so an unauthenticated
// visitor could open the dashboard and see everything.
//
// Responsibilities:
//   1. Refresh the Supabase session cookie (via `updateSession`).
//   2. Route the root path `/` → /dashboard (signed-in) or /sign-in (guest).
//   3. Redirect unauthenticated users away from protected pages → /sign-in.
//   4. Redirect already-signed-in users away from /sign-in and /sign-up.
//
// API routes (`/api/*`) are intentionally EXCLUDED from the matcher: they
// authenticate themselves (`requireUser()` → 401 JSON) and cron/webhook
// endpoints authenticate via a Bearer secret with NO Supabase session.
// Redirecting them to the HTML /sign-in page would break those callers and
// change the API error contract.

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Pages that do NOT require authentication. Anything else under the matcher is
// treated as a protected dashboard page. (`/` is handled explicitly below.)
const PUBLIC_PATHS = new Set<string>([
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/welcome',
  '/onboarding',
])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  // Next.js internals / static assets that may slip through the matcher.
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) return true
  return false
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  // Defense-in-depth: never redirect API routes even if one slips past the
  // matcher — they self-authenticate and must return JSON, not an HTML redirect.
  if (pathname.startsWith('/api')) return response

  // Root path → send to the right place with a clean server-side 307 (avoids a
  // dashboard flash and a fragile client-side redirect from the root page).
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.search = ''
    url.pathname = user ? '/dashboard' : '/sign-in'
    return NextResponse.redirect(url)
  }

  // Signed-in users hitting the sign-in / sign-up page → bounce to dashboard.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Unauthenticated users hitting a protected page → bounce to /sign-in,
  // preserving the originally-requested URL (path + query) via `?next=` so the
  // sign-in page can return them there. `safeNext()` on the consumer side keeps
  // this from becoming an open-redirect.
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Match everything EXCEPT: API routes (self-authenticate), Next.js internals,
    // `/.well-known/*` (ACME / domain-verification must be publicly reachable),
    // and any path ending in a known static-asset extension served from /public
    // (images, fonts, css/js, manifest, robots/sitemap, etc.). The extension
    // list is explicit so the gate FAILS CLOSED — an unrecognized path stays
    // protected rather than being treated as a public asset.
    '/((?!api|_next/static|_next/image|\\.well-known|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|css|js|mjs|map|json|txt|xml|webmanifest)$).*)',
  ],
}
