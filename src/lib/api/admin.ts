// Service-role Supabase client. Bypasses RLS entirely — use ONLY in trusted
// server contexts (Route Handlers, cron functions). Never imported by code that
// ends up on the browser.
//
// Used for:
//   - writing `audit_logs` (so audit writes don't depend on user RLS quirks)
//   - invalidating compliance_scores_cache rows
//   - admin user provisioning (Supabase Auth admin API)
//
// Requires `SUPABASE_SERVICE_ROLE_KEY` in env. If absent we throw lazily —
// modules can still import this file (the singleton is created on first call).

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getAdminClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      '[api/admin] SUPABASE_SERVICE_ROLE_KEY is not set — getAdminClient() unavailable.',
    )
  }
  cached = createServiceClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  return cached
}
