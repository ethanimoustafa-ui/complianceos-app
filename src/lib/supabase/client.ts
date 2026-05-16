// Browser-side Supabase client (singleton). Used by client components, hooks
// and zustand stores to talk to Supabase from the browser. Cookies are
// managed by `@supabase/ssr` so sessions stay in sync with the server.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return browserClient
}

// Convenience default singleton for the common `import { supabase } from ...`
// pattern. Lazily resolves on first access so it does not crash during SSR
// when env vars are read.
export const supabase = (() => {
  // Defer initialisation until used in a browser context.
  if (typeof window === 'undefined') {
    // Return a Proxy that throws on any access during SSR — server code must
    // use `src/lib/supabase/server.ts` instead.
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(
          '[supabase/client] accessed on the server — use createClient() from src/lib/supabase/server.ts instead.',
        )
      },
    })
  }
  return createClient()
})()
