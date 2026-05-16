// Server-side sign-out endpoint. Clears the Supabase session cookie and
// redirects to /sign-in. Use via:
//   <form action="/api/auth/signout" method="post"><button>Sign out</button></form>
// or `fetch('/api/auth/signout', { method: 'POST' })`.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const { origin } = request.nextUrl
  return NextResponse.redirect(`${origin}/sign-in`, { status: 303 })
}

export async function GET(request: NextRequest) {
  // Allow GET for convenience (e.g. nav links). Mirrors POST behaviour.
  return POST(request)
}
