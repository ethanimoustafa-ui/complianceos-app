// Root middleware — runs on every request that matches the `config.matcher`.
//
// Responsibilities:
//   1. Refresh the Supabase session cookie (via `updateSession`).
//   2. Redirect unauthenticated users away from protected routes.
//   3. Redirect already-signed-in users away from /sign-in and /sign-up.
//
// The (dashboard) route group flattens to non-prefixed routes like `/audits`,
// `/observations`, etc. — so we treat *anything not explicitly public* as a
// protected dashboard route.

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that do NOT require authentication. Anything else is treated as a
// protected dashboard route.
const PUBLIC_PATHS = new Set<string>([
  '/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/verify-email',
  '/welcome',
  '/onboarding',
])

// Path prefixes that are always public (static assets, auth API callbacks, etc).
const PUBLIC_PREFIXES = ['/api/auth/', '/_next/', '/favicon']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Signed-in users hitting the sign-in / sign-up page → bounce to dashboard.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Unauthenticated users hitting a protected route → bounce to /sign-in
  // preserving the originally-requested URL via `?next=`.
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and image / font assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
