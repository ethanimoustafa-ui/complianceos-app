import { useMemo } from 'react'
import type { TeamMember, User } from '@/types'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { PERMISSIONS, STANDARD_PERMISSIONS, type Permission } from '@/lib/permissions-registry'

// ── PERMISSION GATES INTENTIONALLY DISABLED (Mar 2026 demo direction) ────────
// Product decision (still in force as of Round 4 Phase 1): every authenticated
// collaborator can act on every module. The gate functions below all return
// `!!user` so the UI doesn't hide anything yet.
//
// Round 4 Phase 1 (current) introduces the `Permission` registry (in
// `permissions-registry.ts` to avoid circular imports) and the
// `getEffectivePermissions` derivation; later phases (RBAC-015 onward) will
// re-enable the gates and wire them through `useCan` / <Gate>.

const ROLE_HIERARCHY: User['role'][] = ['officer', 'manager', 'admin']

// Re-export so existing call sites that import from `@/lib/permissions` keep working.
export { PERMISSIONS, STANDARD_PERMISSIONS }
export type { Permission }

// Legacy role-permission map — kept for callers that reason about role labels.
// Not consulted by any of the gate helpers below.
export const ROLE_PERMISSIONS: Record<User['role'], string[]> = {
  officer: ['view', 'comment', 'audit:view', 'observation:view', 'observation:create', 'observation:edit', 'observation:comment', 'report:view', 'export'],
  manager: ['view', 'comment', 'create', 'edit', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'observation:view', 'observation:create', 'observation:edit', 'report:view', 'report:create', 'export'],
  admin: ['view', 'comment', 'create', 'edit', 'delete', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'audit:delete', 'observation:view', 'observation:create', 'observation:edit', 'observation:delete', 'report:view', 'report:create', 'report:delete', 'export', 'settings:view', 'settings:edit', 'team:view', 'team:invite', 'team:edit', 'team:remove'],
}

// ── Effective permissions derivation (RBAC-012) ──────────────────────────────
// Pure function — given a user + the team-member roster, return the set of
// permissions that user actually has. Admins always get every permission;
// non-admins get whatever their TeamMember.accessControls record grants.
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

// React hook wrapper — memoises by [user.id, members].
export function useEffectivePermissions(): Permission[] {
  const user = useAuthStore((s) => s.user)
  const members = useTeamStore((s) => s.members)
  return useMemo(() => getEffectivePermissions(user, members), [user, members])
}

// ── Gate helpers — STILL NEUTRALISED IN PHASE 1 ──────────────────────────────
// Every gate returns `!!user` so any authenticated user passes. Phase 2
// (RBAC-015) replaces these with real checks driven by `getEffectivePermissions`.
export function hasPermission(user: User | null, _permission: string): boolean { return !!user }
export function canEdit(user: User | null): boolean { return !!user }
export function canDelete(user: User | null): boolean { return !!user }
export function isAdmin(user: User | null): boolean { return !!user }
export function hasRole(user: User | null, _requiredRole: User['role']): boolean { return !!user }
export function canAccessModule(user: User | null, _module: 'audit' | 'observation' | 'report' | 'settings' | 'team'): boolean { return !!user }
export function canPerformAction(user: User | null, _module: string, _action: 'view' | 'create' | 'edit' | 'delete' | 'comment'): boolean { return !!user }
export function canExport(user: User | null): boolean { return !!user }

export function getUserPermissions(user: User | null): string[] {
  if (!user) return []
  const rolePermissions = ROLE_PERMISSIONS[user.role] || []
  const customPermissions = user.permissions || []
  return [...new Set([...rolePermissions, ...customPermissions])]
}

// Comment / observation / closure helpers — all permissive when authenticated.
export function canEditComment(user: User | null, _authorId: string): boolean { return !!user }
export function canDeleteComment(user: User | null, _authorId: string): boolean { return !!user }
export function isObservationLeader(user: User | null, obs: { leaderId?: string }): boolean { return user?.id === obs.leaderId }
export function canManageObservation(user: User | null, _obs: { leaderId?: string }): boolean { return !!user }
export function canTransferLeadership(user: User | null, _obs: { leaderId?: string }): boolean { return !!user }
export function canSubmitRemediation(user: User | null, _obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean { return !!user }
export function canReviewRemediation(user: User | null, _obs: { leaderId?: string }): boolean { return !!user }
export function canUploadDocument(user: User | null, _obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean { return !!user }
export function canEditObservation(user: User | null, _obs: { leaderId?: string }): boolean { return !!user }
export function canRequestClosure(user: User | null, _obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean { return !!user }
export function canReviewClosure(user: User | null, _obs: { leaderId?: string }): boolean { return !!user }

// Helper kept for callers that need to render role-aware copy without gating.
export { ROLE_HIERARCHY }
