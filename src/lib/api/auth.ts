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
 * Extract `role` + `permissions[]` from the JWT's verified `app_metadata`
 * claims (custom access token hook, migration 028). Returns `null` when the
 * hook hasn't populated them (pre-hook session / hook disabled), in which case
 * the caller falls back to the RBAC table lookup.
 */
function rbacFromAppMetadata(meta: unknown): { role: string; permissions: string[] } | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as AppMetadataClaims
  const role = typeof m.role === 'string' ? m.role : null
  const perms = Array.isArray(m.permissions)
    ? m.permissions.filter((p): p is string => typeof p === 'string')
    : null
  if (!role || !perms) return null
  return { role, permissions: perms }
}

/**
 * Memoized per-request. Throws ApiError('unauthenticated', 401) if no session.
 *
 * Auth is resolved from the access-token claims via `getClaims()`, which
 * verifies the JWT signature LOCALLY against the project's asymmetric (ES256)
 * JWKS — no network round-trip to the auth server. (Audit B1: the previous
 * `getUser()` call hit `/auth/v1/user` on EVERY route handler, and React
 * `cache()` does not span concurrent handlers, so a single dashboard paint paid
 * that auth-server hop ~15x.)
 *
 * Claims-first: when the verified JWT carries `app_metadata.role` +
 * `permissions[]` (custom access token hook, migration 028) we skip the RBAC
 * queries entirely. Falls back to the table lookup when claims are absent so
 * the app keeps working before the hook is enabled.
 */
export const requireUser = cache(async (): Promise<AuthedRequest> => {
  const supabase = await createClient()

  // Local JWT verification against the JWKS (fetched once, cached) — no
  // auth-server round-trip, unlike getUser().
  const { data, error } = await supabase.auth.getClaims()
  const claims = (data?.claims ?? null) as Record<string, unknown> | null
  if (error || !claims || typeof claims.sub !== 'string') throw Unauthenticated()
  const userId = claims.sub

  // Reconstruct the minimal supabase `User` shape downstream handlers rely on
  // (`.id` everywhere; `.email` in a couple of spots) from the verified claims,
  // so we don't need the getUser() network call to obtain it.
  const user = {
    id: userId,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    phone: typeof claims.phone === 'string' ? claims.phone : undefined,
    app_metadata: (claims.app_metadata ?? {}) as Record<string, unknown>,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
    aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
    role: typeof claims.role === 'string' ? claims.role : undefined,
    created_at: '',
  } as unknown as User

  const rbac = rbacFromAppMetadata(claims.app_metadata)

  // Profile metadata (department_id, preferred_language, name, email) is needed
  // downstream regardless of which RBAC path we take — one query either way.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, department_id, preferred_language')
    .eq('id', userId)
    .maybeSingle<Profile>()
  if (!profile) {
    throw new ApiError('unauthenticated', 401, 'Profile not found for user')
  }

  if (rbac) {
    // Fast path — permissions straight from the verified JWT, zero RBAC queries.
    return { supabase, user, profile, permissions: rbac.permissions }
  }

  // Fallback — claims lack role/permissions (hook disabled / stale token).
  const permissions = await loadPermissions(supabase, userId)
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
 * True if the caller may mutate a resource they don't necessarily have a blanket
 * permission for: they either hold the `edit` permission (managers/admins always
 * do) OR they are the resource's single owner/assignee. Mirrors the client
 * `canEditCircular` / `canAdvancePolicyWorkflow` helpers and the migration-114
 * RLS predicates so all three layers agree.
 *
 * Pass `ownerId = null` to short-circuit the ownership check (e.g. when the
 * caller already holds `edit`, so loading the owner row is unnecessary).
 */
export function hasEditOrOwnership(ctx: AuthedRequest, ownerId: string | null | undefined): boolean {
  if (ctx.permissions.includes('edit')) return true
  return !!ownerId && ownerId === ctx.user.id
}

/**
 * True if the caller may DRIVE a workflow on a resource — advance / approve /
 * start / complete / undo / reset, OR change the resource's lifecycle status or
 * owner. They must hold the global 'workflow:advance' grant (managers/admins by
 * role; officers only via the Access Matrix) OR be the resource's owner/leader.
 *
 * Unlike `hasEditOrOwnership`, the generic 'edit' permission does NOT grant this:
 * editing an item and DRIVING its workflow are deliberately separate capabilities
 * (the ownership model). Use this for every advance/approve/start/complete route
 * AND to gate status/owner transitions on the generic PATCH routes, so PATCH
 * can't be used to bypass the dedicated gated transition routes.
 */
export function canDriveWorkflow(ctx: AuthedRequest, ownerId: string | null | undefined): boolean {
  if (ctx.permissions.includes('workflow:advance')) return true
  return !!ownerId && ownerId === ctx.user.id
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

/**
 * Assert the caller has AT LEAST ONE of `perms` (OR). Used by the entity
 * create/edit/delete routes that accept either the granular per-entity key
 * (e.g. `policy:edit`, migration 115 / the Access Matrix) OR the legacy
 * generic key (`edit`) that role tiers still carry. Mirrors the RLS predicate,
 * which OR's the same keys together, so route and DB agree.
 */
export async function requireAnyPerm(perms: readonly string[]): Promise<AuthedRequest> {
  const ctx = await requireUser()
  if (!perms.some((p) => ctx.permissions.includes(p))) {
    throw Forbidden(`Missing permission: one of ${perms.join(', ')}`)
  }
  return ctx
}
