// Server-side Supabase client for use in Server Components, Route Handlers
// and Server Actions. Reads / writes the auth cookies via `next/headers` so
// the session stays in sync with the browser. NEVER cache this client across
// requests — each request must have its own cookie context.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // The `setAll` method was called from a Server Component. This is
            // fine if there is also a middleware refreshing user sessions —
            // the middleware will keep the cookies updated.
          }
        },
      },
    },
  )
}
