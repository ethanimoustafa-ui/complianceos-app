import { useMemo } from 'react'
import type { TeamMember, User } from '@/types'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { PERMISSIONS, STANDARD_PERMISSIONS, type Permission } from '@/lib/permissions-registry'

// ── Backend permission keys (Supabase `public.permissions` seed) ─────────────
// The DB-backed permissions registry exposes 25 lowercase:colon keys. These
// are joined into the auth-store as `permissions: string[]` on sign-in.
// Components that want to gate on backend keys should pass one of these
// strings; the existing label-based `Permission` union still works for the
// legacy code paths.
export const BACKEND_PERMISSIONS = [
  'audit:comment',
  'audit:create',
  'audit:delete',
  'audit:edit',
  'audit:view',
  'comment',
  'create',
  'delete',
  'edit',
  'export',
  'observation:comment',
  'observation:create',
  'observation:delete',
  'observation:edit',
  'observation:view',
  'report:create',
  'report:delete',
  'report:view',
  'settings:edit',
  'settings:view',
  'team:edit',
  'team:invite',
  'team:remove',
  'team:view',
  'view',
] as const
export type BackendPermission = (typeof BACKEND_PERMISSIONS)[number]

// Round 4 Phase 2 — gate helpers re-enabled.
//
// Strategy: every helper consults the new label-based PERMISSIONS registry
// (via getEffectivePermissions) AND the legacy lowercase:colon ROLE_PERMISSIONS
// map. The dual-check keeps the existing RoleGuard call sites working
// (`requiredPermission="team:invite"` etc. resolves through the legacy map)
// while the new admin perms (`Manage Settings`, etc.) resolve through the
// registry. Admins always pass — they don't need a record in either map.

const ROLE_HIERARCHY: User['role'][] = ['officer', 'manager', 'admin']

export { PERMISSIONS, STANDARD_PERMISSIONS }
export type { Permission }

// Legacy role-permission map — used as a fallback for the lowercase:colon
// permission strings that pre-date the round-4 registry.
export const ROLE_PERMISSIONS: Record<User['role'], string[]> = {
  officer: ['view', 'comment', 'audit:view', 'observation:view', 'observation:create', 'observation:edit', 'observation:comment', 'report:view', 'export'],
  manager: ['view', 'comment', 'create', 'edit', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'observation:view', 'observation:create', 'observation:edit', 'report:view', 'report:create', 'export'],
  admin: ['view', 'comment', 'create', 'edit', 'delete', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'audit:delete', 'observation:view', 'observation:create', 'observation:edit', 'observation:delete', 'report:view', 'report:create', 'report:delete', 'export', 'settings:view', 'settings:edit', 'team:view', 'team:invite', 'team:edit', 'team:remove'],
}

// ── Effective permissions derivation (RBAC-012) ──────────────────────────────
export function getEffectivePermissions(user: User | null, members: TeamMember[]): Permission[] {
  if (!user) return []
  if (user.role === 'admin') return [...PERMISSIONS]

  const member = members.find((m) => m.id === user.id)
  if (!member) return []

  const valid = new Set<string>(PERMISSIONS)
  return (member.accessControls ?? [])
    .filter((ac) => ac.enabled && valid.has(ac.label))
    .map((ac) => ac.label as Permission)
}

export function useEffectivePermissions(): Permission[] {
  const user = useAuthStore((s) => s.user)
  const members = useTeamStore((s) => s.members)
  return useMemo(() => getEffectivePermissions(user, members), [user, members])
}

// Internal: returns true iff `permission` matches one of the new registry
// labels granted to the user. Admins pass automatically.
function hasRegistryPermission(user: User, permission: string): boolean {
  if (user.role === 'admin') return true
  const valid = new Set<string>(PERMISSIONS)
  if (!valid.has(permission)) return false
  const members = useTeamStore.getState().members
  const effective = getEffectivePermissions(user, members) as string[]
  return effective.includes(permission)
}

// ── Gate helpers (RBAC-015, re-enabled) ──────────────────────────────────────
export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (hasRegistryPermission(user, permission)) return true
  // Legacy fallback for `team:invite`, `audit:edit`, `view`, etc.
  const legacy = ROLE_PERMISSIONS[user.role] || []
  if (legacy.includes(permission)) return true
  return (user.permissions ?? []).includes(permission)
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin'
}

export function hasRole(user: User | null, requiredRole: User['role']): boolean {
  if (!user) return false
  const userIdx = ROLE_HIERARCHY.indexOf(user.role)
  const requiredIdx = ROLE_HIERARCHY.indexOf(requiredRole)
  if (userIdx === -1 || requiredIdx === -1) return false
  return userIdx >= requiredIdx
}

// Per-resource edit map (RBAC-015 §4). When called without a `resource` arg,
// falls back to "manager+" — this preserves behaviour for the many call sites
// that pre-date the per-resource map.
const RESOURCE_EDIT_PERMISSION: Record<string, Permission> = {
  policy: 'Approve Policy Reviews',
  'sama-letter': 'Approve SAMA Letters',
  'sama-letters': 'Approve SAMA Letters',
  letter: 'Approve SAMA Letters',
  audit: 'Manage Audit Findings',
  observation: 'Manage Audit Findings',
  observations: 'Manage Audit Findings',
  risk: 'Manage Audit Findings',
  training: 'Manage Training Programs',
  team: 'Manage Team & Permissions',
  settings: 'Manage Settings',
  framework: 'Configure Frameworks',
  frameworks: 'Configure Frameworks',
  list: 'Configure Lists & Categories',
  lists: 'Configure Lists & Categories',
  'letter-template': 'Manage Letter Templates',
  'policy-template': 'Manage Policy Templates',
  'audit-template': 'Manage Audit Templates',
}

export function canEdit(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    const required = RESOURCE_EDIT_PERMISSION[resource]
    if (required) return hasPermission(user, required)
  }
  // No resource specified — fall back to manager+.
  return hasRole(user, 'manager')
}

export function canDelete(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    // Delete is a stricter action than edit. Officers never delete; managers
    // can delete the same resources they can edit.
    if (user.role === 'officer') return false
    const required = RESOURCE_EDIT_PERMISSION[resource]
    if (required) return hasPermission(user, required)
  }
  // Default: admin-only delete when no resource hint.
  return false
}

// Module → permission map. `null` means every authenticated user can access.
const MODULE_PERMISSION: Record<string, Permission | null> = {
  audit: null,
  observation: null,
  report: null,
  team: null,
  'team:edit': 'Manage Team & Permissions',
  'team:invite': 'Manage Team & Permissions',
  'team:remove': 'Manage Team & Permissions',
  settings: 'Manage Settings',
  'settings:edit': 'Manage Settings',
  frameworks: 'Configure Frameworks',
  lists: 'Configure Lists & Categories',
  'letter-templates': 'Manage Letter Templates',
  'policy-templates': 'Manage Policy Templates',
  'audit-templates': 'Manage Audit Templates',
}

export function canAccessModule(
  user: User | null,
  module: 'audit' | 'observation' | 'report' | 'settings' | 'team' | string,
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  const required = MODULE_PERMISSION[module]
  if (required === null) return true
  if (required === undefined) {
    // Unknown module — default to manager+ to avoid accidental lockout.
    return hasRole(user, 'manager')
  }
  return hasPermission(user, required)
}

// Generic action gate — keeps the legacy `module:action` lowercase:colon
// shape so call sites don't have to migrate. Defers to hasPermission for the
// composite key.
export function canPerformAction(
  user: User | null,
  module: string,
  action: 'view' | 'create' | 'edit' | 'delete' | 'comment',
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return hasPermission(user, `${module}:${action}`) || hasPermission(user, action)
}

export function canExport(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return hasPermission(user, 'Export Compliance Data') || hasPermission(user, 'export')
}

export function getUserPermissions(user: User | null): string[] {
  if (!user) return []
  const rolePermissions = ROLE_PERMISSIONS[user.role] || []
  const customPermissions = user.permissions || []
  return [...new Set([...rolePermissions, ...customPermissions])]
}

// ── Comment / observation / closure helpers ──────────────────────────────────
// Author-aware checks — admin always passes; otherwise must own the row OR
// have a relevant management permission.
export function canEditComment(user: User | null, authorId: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.id === authorId
}

export function canDeleteComment(user: User | null, authorId: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.id === authorId) return true
  return hasPermission(user, 'Manage Audit Findings')
}

export function isObservationLeader(user: User | null, obs: { leaderId?: string }): boolean {
  return user?.id === obs.leaderId
}

export function canManageObservation(user: User | null, obs: { leaderId?: string }): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (isObservationLeader(user, obs)) return true
  return hasPermission(user, 'Manage Audit Findings')
}

export function canTransferLeadership(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

export function canSubmitRemediation(
  user: User | null,
  obs: { assignees?: { id?: string }[]; leaderId?: string },
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (isObservationLeader(user, obs)) return true
  return (obs.assignees ?? []).some((a) => a.id === user.id)
}

export function canReviewRemediation(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

export function canUploadDocument(
  user: User | null,
  obs: { assignees?: { id?: string }[]; leaderId?: string },
): boolean {
  return canSubmitRemediation(user, obs)
}

export function canEditObservation(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

export function canRequestClosure(
  user: User | null,
  obs: { assignees?: { id?: string }[]; leaderId?: string },
): boolean {
  return canSubmitRemediation(user, obs)
}

export function canReviewClosure(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

// ── React hooks for permission checks (RBAC-016) ─────────────────────────────
/**
 * useCan — returns true iff the current user has every permission in the list.
 *
 * Accepts either:
 *   • a legacy label-based `Permission` (e.g. `'Manage Settings'`), checked
 *     against the team-store accessControls toggles, OR
 * • a backend permission key (e.g. `'team:invite'`), checked against the
 *     Supabase-backed `permissions: string[]` array on auth-store.
 *
 * Admins always pass.
 */
export function useCan(perm: Permission | BackendPermission | (Permission | BackendPermission)[]): boolean {
  const effective = useEffectivePermissions()
  const backendPerms = useAuthStore((s) => s.permissions)
  const isAdminUser = useAuthStore((s) => s.user?.role === 'admin')
  const list = Array.isArray(perm) ? perm : [perm]
  if (isAdminUser) return true
  return list.every((p) => effective.includes(p as Permission) || backendPerms.includes(p as string))
}

/**
 * useCanAny — returns true iff the user has at least one of the listed perms.
 */
export function useCanAny(perms: (Permission | BackendPermission)[]): boolean {
  const effective = useEffectivePermissions()
  const backendPerms = useAuthStore((s) => s.permissions)
  const isAdminUser = useAuthStore((s) => s.user?.role === 'admin')
  if (isAdminUser) return true
  return perms.some((p) => effective.includes(p as Permission) || backendPerms.includes(p as string))
}

export { ROLE_HIERARCHY }
