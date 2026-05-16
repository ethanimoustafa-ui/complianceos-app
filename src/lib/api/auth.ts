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

/**
 * Memoized per-request. Throws ApiError('unauthenticated', 401) if no session.
 */
export const requireUser = cache(async (): Promise<AuthedRequest> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw Unauthenticated()

  // Profile lookup — small, cached by the same React cache wrapper.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, department_id, preferred_language')
    .eq('id', user.id)
    .maybeSingle<Profile>()

  if (!profile) {
    // Row should exist (auth trigger seeds it). Treat absent profile as auth
    // failure rather than crashing downstream queries.
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
