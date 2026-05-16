// Per-request auth helpers for Route Handlers.
//
//   const { supabase, user, profile, permissions } = await requireUser()
//   await requirePerm('audit:create')
//
// `requireUser()` throws `ApiError('unauthenticated', 401)` if no session.
// `requirePerm()` adds a 403 check against the user's resolved permission set.
//
// Result is memoized per-request via React `cache()` so repeated calls inside
// a single request don't re-query Supabase or the permission tables.
//
// PERF (Phase 11 / Agent P):
//   The previous implementation queried `profiles`, `user_roles`,
//   `user_permissions`, `role_permissions` on every Route Handler invocation
//   even after React cache(). Within one page render the dashboard hits 20+
//   handlers in parallel — each one re-fetched these tables because React
//   cache() does not span concurrent route-handler invocations.
//
//   Migration 028 installs a Supabase Custom Access Token Hook that injects
//   `app_metadata.role` and `app_metadata.permissions[]` into the JWT. Once
//   the hook is enabled in Studio (Auth → Hooks → Custom Access Token Hook
//   → `public.custom_access_token_hook`), we read both from `user.app_metadata`
//   in a single getUser() call instead of 3 follow-up selects.
//
//   We keep a DB-fallback path so:
//     1. the app keeps working *before* the hook is toggled in Studio
//     2. the first request after enabling the hook (which may carry a stale
//        token from before the toggle) still resolves
//   The fallback path is identical to the legacy implementation.

import { cache } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ApiError, Forbidden, Unauthenticated } from './errors'

export interface AuthedRequest {
  supabase: SupabaseClient
  user: User
  profile: Profile
  permissions: string[]
}

export interface Profile {
  id: string
  email: string | null
  name: string | null
  role: string | null
  department_id: string | null
  preferred_language: 'en' | 'ar' | null
}

interface AppMetadataClaims {
  role?: string | null
  permissions?: string[]
}

/**
 * Read `role` + `permissions[]` from the JWT's `app_metadata` claims if the
 * custom access token hook (migration 028) is enabled.
 *
 * IMPORTANT: We parse the access token's JWT payload directly rather than
 * read `user.app_metadata` returned by `supabase.auth.getUser()`. The reason:
 * `getUser()` validates against `/auth/v1/user` which returns the user's
 * `app_metadata` from `auth.users.raw_app_meta_data` (DB record) — the
 * hook-injected claims live ONLY in the JWT, not in that DB column. Reading
 * the JWT payload is the only way to see them server-side.
 *
 * Returns `null` when the hook hasn't been toggled yet, or hasn't fired for
 * this token (e.g. pre-hook session). Caller falls back to DB queries.
 */
function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function readClaimsFromToken(accessToken: string | undefined): { role: string; permissions: string[] } | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { app_metadata?: AppMetadataClaims }
    const meta = payload.app_metadata ?? {}
    const role = typeof meta.role === 'string' ? meta.role : null
    const perms = Array.isArray(meta.permissions)
      ? meta.permissions.filter((p): p is string => typeof p === 'string')
      : null
    if (!role || !perms) return null
    return { role, permissions: perms }
  } catch {
    return null
  }
}

/**
 * Memoized per-request. Throws ApiError('unauthenticated', 401) if no session.
 *
 * Claims-first: when the JWT carries `app_metadata.role` + `permissions[]`
 * (custom access token hook enabled) we skip the 3 RBAC queries entirely.
 * Falls back to the legacy 3-query path when claims are absent so the app
 * keeps working before the hook is enabled.
 */
export const requireUser = cache(async (): Promise<AuthedRequest> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw Unauthenticated()

  // Read claims from the JWT payload, not user.app_metadata (which is sourced
  // from the DB record and won't reflect hook-injected claims).
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = readClaimsFromToken(sessionData.session?.access_token)

  if (claims) {
    // Fast path — JWT carries role+perms. Still need profile metadata
    // (department_id, preferred_language, name, email) for downstream
    // localization and routing. One query instead of three.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, name, role, department_id, preferred_language')
      .eq('id', user.id)
      .maybeSingle<Profile>()

    if (!profile) {
      throw new ApiError('unauthenticated', 401, 'Profile not found for user')
    }

    return { supabase, user, profile, permissions: claims.permissions }
  }

  // Fallback path — JWT claims unavailable (hook not enabled, or stale token).
  // Identical to the pre-Phase-11 implementation.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, department_id, preferred_language')
    .eq('id', user.id)
    .maybeSingle<Profile>()

  if (!profile) {
    throw new ApiError('unauthenticated', 401, 'Profile not found for user')
  }

  const permissions = await loadPermissions(supabase, user.id)
  return { supabase, user, profile, permissions }
})

/**
 * Resolve the user's effective permission keys via:
 *   - user_permissions (per-user grants, `granted = true`)
 *   - user_roles  → role_permissions
 *   - profiles.role → role_permissions
 *
 * Mirrors `public.has_permission()` SQL. RLS still has the final say on data
 * access — this is purely a fast-path for route-level gating.
 *
 * **Fallback only.** The JWT custom access token hook (migration 028) bakes
 * the same set into `app_metadata.permissions[]` so this path runs zero times
 * per request once the hook is enabled in Studio.
 */
async function loadPermissions(supabase: SupabaseClient, userId: string): Promise<string[]> {
  // Per-user grants
  const [{ data: userPerms }, { data: userRoles }, { data: profileRow }] = await Promise.all([
    supabase
      .from('user_permissions')
      .select('permission_key, granted')
      .eq('user_id', userId),
    supabase.from('user_roles').select('role_key').eq('user_id', userId),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle<{ role: string | null }>(),
  ])

  const roleKeys = new Set<string>()
  for (const r of userRoles ?? []) roleKeys.add((r as { role_key: string }).role_key)
  if (profileRow?.role) roleKeys.add(profileRow.role)

  let rolePerms: { permission_key: string }[] = []
  if (roleKeys.size > 0) {
    const { data } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .in('role_key', Array.from(roleKeys))
    rolePerms = data ?? []
  }

  const set = new Set<string>()
  for (const rp of rolePerms) set.add(rp.permission_key)
  for (const up of userPerms ?? []) {
    const row = up as { permission_key: string; granted: boolean }
    if (row.granted) set.add(row.permission_key)
    else set.delete(row.permission_key)
  }
  return Array.from(set)
}

/**
 * Asserts the caller has `perm`. Returns the same AuthedRequest payload.
 */
export async function requirePerm(perm: string): Promise<AuthedRequest> {
  const ctx = await requireUser()
  if (!ctx.permissions.includes(perm)) {
    throw Forbidden(`Missing permission: ${perm}`)
  }
  return ctx
}

/**
 * Assert the caller has every permission in `perms` (AND).
 */
export async function requireAllPerms(perms: readonly string[]): Promise<AuthedRequest> {
  const ctx = await requireUser()
  const missing = perms.filter((p) => !ctx.permissions.includes(p))
  if (missing.length > 0) {
    throw Forbidden(`Missing permission(s): ${missing.join(', ')}`)
  }
  return ctx
}
