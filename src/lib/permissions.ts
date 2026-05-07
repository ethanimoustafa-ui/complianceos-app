import type { User } from '@/types'

// ── PERMISSION GATES INTENTIONALLY DISABLED (Mar 2026 demo direction) ────────
// Product decision: every authenticated collaborator can act on every module.
// The permission data model below is preserved so feature work can re-enable
// gating later without re-introducing fields, but every check returns true
// (when a user is logged in) so the UI no longer hides anything.
//
// To re-enable enforcement, restore the previous role/permission lookup logic
// (kept in git history before commit "remove permission gates from UI").

const ROLE_HIERARCHY: User['role'][] = ['officer', 'manager', 'admin']

// Kept exported for any code that wants to reason about role labels — not
// consulted by any of the gate helpers anymore.
export const ROLE_PERMISSIONS: Record<User['role'], string[]> = {
  officer: ['view', 'comment', 'audit:view', 'observation:view', 'observation:create', 'observation:edit', 'observation:comment', 'report:view', 'export'],
  manager: ['view', 'comment', 'create', 'edit', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'observation:view', 'observation:create', 'observation:edit', 'report:view', 'report:create', 'export'],
  admin: ['view', 'comment', 'create', 'edit', 'delete', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'audit:delete', 'observation:view', 'observation:create', 'observation:edit', 'observation:delete', 'report:view', 'report:create', 'report:delete', 'export', 'settings:view', 'settings:edit', 'team:view', 'team:invite', 'team:edit', 'team:remove'],
}

// Every gate now returns `!!user` so any authenticated user passes.
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
