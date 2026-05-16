// Auth callback Route Handler — exchanges the `code` query param for a
// session and redirects the user to `next` (defaults to /dashboard).
// Used by:
//   • Email confirmation links
//   • Password-reset links
//   • OAuth callbacks (when enabled)
// See: https://supabase.com/docs/guides/auth/server-side/nextjs

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocal = process.env.NODE_ENV === 'development'
      const target = isLocal
        ? `${origin}${next}`
        : forwardedHost
          ? `https://${forwardedHost}${next}`
          : `${origin}${next}`
      return NextResponse.redirect(target)
    }
  }

  // Auth failed → bounce to sign-in with a generic error flag.
  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
