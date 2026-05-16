// Middleware-scoped Supabase client + `updateSession` helper.
//
// This is the canonical Supabase Next.js SSR cookie pattern (see
// https://supabase.com/docs/guides/auth/server-side/nextjs). The helper
// refreshes the access token if needed (via `supabase.auth.getUser()`) and
// makes sure the refreshed cookies are written onto both the incoming request
// (so downstream `cookies()` reads see them) and the outgoing response.
//
// Routing decisions (redirect unauthenticated users to /sign-in, redirect
// signed-in users away from /sign-in) live in the root `middleware.ts` so
// this file only handles session refresh.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse
  user: Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getUser']>>['data']['user']
}> {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: Avoid putting any code between `createServerClient` and
  // `supabase.auth.getUser()`. A simple mistake can make it very hard to
  // debug issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response: supabaseResponse, user }
}
