// Real Supabase-backed auth store. Replaces the round-3 mock implementation.
//
// State shape preserves the legacy fields (`user`, `token`, `isAuthenticated`,
// `originalUserId`, `error`, `isLoading`) so the ~33 existing consumer files
// keep compiling without churn. The semantics now back on Supabase:
//   • `signIn` calls `supabase.auth.signInWithPassword`, then hydrates
//     `user` from `profiles` and `permissions` from the user_roles →
//     role_permissions → permissions join.
//   • `signOut` calls `supabase.auth.signOut` and clears state.
//   • `refreshSession` re-reads the session and re-hydrates.
//
// Backwards-compat actions retained as thin shims:
//   • `login(email, pwd)`            → calls `signIn`, returns the same shape.
//   • `logout()`                     → calls `signOut`.
//   • `refreshToken()`               → calls `refreshSession`.
//   • `updateProfile(data)`          → updates the local `user` (server-side
//                                      write happens elsewhere via the
//                                      profiles row directly).
//   • `setUser`, `setToken`, etc.    → preserved for direct callers.
//
// Removed: `switchUser` (mock acting-as), `SEED_USERS`, `DEFAULT_USER`.
//          References in components were updated/removed surgically.

import { create } from 'zustand'
import type { User } from '@/types'
import { useUserLogStore } from '@/stores/user-log-store'
import { createClient } from '@/lib/supabase/client'
import { collectClientActivityContext } from '@/lib/user-activity-meta'

// ── Helpers ─────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string
  email: string | null
  name: string | null
  role: 'officer' | 'manager' | 'admin' | string | null
  department_id: string | null
  phone: string | null
  avatar_seed: string | null
  workload: number | null
  last_login: string | null
  created_at: string | null
}

function mapProfileToUser(row: ProfileRow): User {
  // DB role keys now match the client values (migration 108: auditor/officer/
  // manager/admin). Legacy keys (org_admin/compliance_officer/viewer) map forward
  // so any stale token/row during the transition still resolves.
  const raw = (row.role ?? '').toLowerCase()
  const role: User['role'] =
    raw === 'admin' || raw === 'org_admin'
      ? 'admin'
      : raw === 'manager'
        ? 'manager'
        : raw === 'officer' || raw === 'compliance_officer'
          ? 'officer'
          : 'auditor'

  return {
    id: row.id,
    name: row.name ?? row.email ?? 'Unknown user',
    email: row.email ?? '',
    role,
    department: row.department_id ?? '',
    phone: row.phone ?? undefined,
    avatarSeed: row.avatar_seed ?? row.name ?? row.email ?? 'user',
    workload: row.workload ?? 0,
    lastLogin: row.last_login ?? undefined,
    createdAt: row.created_at ?? undefined,
  }
}

async function fetchProfile(userId: string): Promise<User | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, department_id, phone, avatar_seed, workload, last_login, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[auth-store] fetchProfile error', error)
    return null
  }
  if (!data) return null
  return mapProfileToUser(data as ProfileRow)
}

async function fetchPermissions(userId: string): Promise<string[]> {
  const supabase = createClient()
  // Pull permission keys via the join chain user_roles → role_permissions → permissions.
  // PostgREST embedding handles the joins.
  const { data, error } = await supabase
    .from('user_roles')
    .select('roles:role_key(role_permissions(permissions(key)))')
    .eq('user_id', userId)
  if (error) {
    console.error('[auth-store] fetchPermissions error', error)
    return []
  }
  // PostgREST returns embedded relations as arrays even for to-one joins;
  // typings below accommodate both shapes defensively.
  type EmbeddedRow = {
    roles?: unknown
  }
  const keys = new Set<string>()
  const rows = (data ?? []) as EmbeddedRow[]
  for (const row of rows) {
    const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []
    for (const role of roles as Array<{ role_permissions?: unknown }>) {
      const rps = Array.isArray(role.role_permissions) ? role.role_permissions : []
      for (const rp of rps as Array<{ permissions?: unknown }>) {
        const perms = Array.isArray(rp.permissions)
          ? rp.permissions
          : rp.permissions
            ? [rp.permissions]
            : []
        for (const p of perms as Array<{ key?: string }>) {
          if (p?.key) keys.add(p.key)
        }
      }
    }
  }
  return Array.from(keys)
}

async function recordActivity(
  userId: string,
  userName: string,
  action: string,
  module: string,
): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('user_activity_logs').insert({
      user_id: userId,
      user_name: userName,
      action,
      module,
      details: null,
      ip_address: null,
      // Capture browser device/timezone so the User Logs table can render the
      // Device / Location columns. NOT NULL DEFAULT '{}' — collector returns
      // {} server-side, never null.
      metadata: collectClientActivityContext(),
    })
  } catch (err) {
    // Activity logging is best-effort — never block auth on it.
    console.warn('[auth-store] recordActivity failed', err)
  }
}

// ── Store ───────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null
  token: string | null
  permissions: string[]
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  // Retained for backwards compatibility with components that read it.
  // Always tracks the same id as `user.id` (no impersonation in MVP).
  originalUserId?: string

  // New canonical actions
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  loadPermissions: (userId: string) => Promise<void>
  // Sync helper used by the onAuthStateChange listener.
  setSessionUser: (userId: string | null) => Promise<void>

  // Legacy aliases (kept so existing call sites compile)
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  refreshToken: () => Promise<void>
  updateProfile: (data: Partial<User>) => void
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: false,
  error: null,
  originalUserId: undefined,

  // ── Canonical actions ────────────────────────────────────────────────────

  signIn: async (email, password) => {
    set({ isLoading: true, error: null })
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error || !data.user) {
      const message = error?.message ?? 'Invalid credentials'
      set({ isLoading: false, error: message })
      return { ok: false, error: message }
    }

    const [profile, permissions] = await Promise.all([
      fetchProfile(data.user.id),
      fetchPermissions(data.user.id),
    ])

    set({
      user: profile,
      token: data.session?.access_token ?? null,
      permissions,
      isAuthenticated: !!profile,
      isLoading: false,
      error: null,
      originalUserId: profile?.id,
    })

    if (profile) {
      // Local zustand audit log (instant UI feedback)
      useUserLogStore.getState().log({
        userId: profile.id,
        action: 'auth.login',
        target: 'sign-in',
      })
      // Server-side audit log (best-effort).
      void recordActivity(profile.id, profile.name, 'auth.login', 'auth')
    }

    return { ok: true }
  },

  signOut: async () => {
    const previousUser = get().user
    const supabase = createClient()
    await supabase.auth.signOut()
    if (previousUser) {
      useUserLogStore.getState().log({
        userId: previousUser.id,
        action: 'auth.logout',
        target: 'sign-out',
      })
      void recordActivity(previousUser.id, previousUser.name, 'auth.logout', 'auth')
    }
    set({
      user: null,
      token: null,
      permissions: [],
      isAuthenticated: false,
      error: null,
      originalUserId: undefined,
    })
  },

  refreshSession: async () => {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    const sessionUser = data.session?.user
    if (!sessionUser) {
      set({
        user: null,
        token: null,
        permissions: [],
        isAuthenticated: false,
        originalUserId: undefined,
      })
      return
    }
    const [profile, permissions] = await Promise.all([
      fetchProfile(sessionUser.id),
      fetchPermissions(sessionUser.id),
    ])
    set({
      user: profile,
      token: data.session?.access_token ?? null,
      permissions,
      isAuthenticated: !!profile,
      originalUserId: profile?.id,
    })
  },

  loadPermissions: async (userId) => {
    const permissions = await fetchPermissions(userId)
    set({ permissions })
  },

  setSessionUser: async (userId) => {
    if (!userId) {
      set({
        user: null,
        token: null,
        permissions: [],
        isAuthenticated: false,
        originalUserId: undefined,
      })
      return
    }
    const [profile, permissions] = await Promise.all([
      fetchProfile(userId),
      fetchPermissions(userId),
    ])
    set({
      user: profile,
      permissions,
      isAuthenticated: !!profile,
      originalUserId: profile?.id,
    })
  },

  // ── Legacy aliases ───────────────────────────────────────────────────────

  login: (email, password) => get().signIn(email, password),

  logout: () => {
    void get().signOut()
  },

  refreshToken: () => get().refreshSession(),

  updateProfile: (data) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, ...data } })
    // Persist to the profiles row so the choice survives reload and stays
    // consistent everywhere the avatar is rendered from `avatar_seed`.
    // Best-effort: if RLS blocks it the local update still holds for the session.
    const patch: Record<string, unknown> = {}
    if (data.avatarSeed !== undefined) patch.avatar_seed = data.avatarSeed
    if (data.name !== undefined) patch.name = data.name
    if (data.phone !== undefined) patch.phone = data.phone
    if (Object.keys(patch).length > 0) {
      const supabase = createClient()
      void supabase.from('profiles').update(patch).eq('id', user.id)
    }
  },

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, originalUserId: user?.id }),
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}))
