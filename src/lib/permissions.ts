import type { User } from '@/types'

// Role hierarchy - higher index = more permissions
// officer < manager < admin
const ROLE_HIERARCHY: User['role'][] = ['officer', 'manager', 'admin']

// Permission definitions by role
const ROLE_PERMISSIONS: Record<User['role'], string[]> = {
  // Officer: View-only access + FULL observation access
  officer: [
    'view',
    'comment',
    'audit:view',
    'observation:view',
    'observation:create',
    'observation:edit',
    'observation:comment',
    'report:view',
    'export', // to export observations
  ],
  // Manager: Can create, edit, comment, and export
  manager: [
    'view',
    'comment',
    'create',
    'edit',
    'audit:view',
    'audit:comment',
    'audit:create',
    'audit:edit',
    'observation:view',
    'observation:create',
    'observation:edit',
    'report:view',
    'report:create',
    'export',
  ],
  // Admin: Full access including delete, settings, and team management
  admin: [
    'view',
    'comment',
    'create',
    'edit',
    'delete',
    'audit:view',
    'audit:comment',
    'audit:create',
    'audit:edit',
    'audit:delete',
    'observation:view',
    'observation:create',
    'observation:edit',
    'observation:delete',
    'report:view',
    'report:create',
    'report:delete',
    'export',
    'settings:view',
    'settings:edit',
    'team:view',
    'team:invite',
    'team:edit',
    'team:remove',
  ],
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false

  // Check user's custom permissions first
  if (user.permissions?.includes(permission)) {
    return true
  }

  // Fall back to role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[user.role] || []
  return rolePermissions.includes(permission)
}

/**
 * Check if user can edit resources
 */
export function canEdit(user: User | null): boolean {
  if (!user) return false
  return hasPermission(user, 'edit') || hasPermission(user, 'create')
}

/**
 * Check if user can delete resources
 */
export function canDelete(user: User | null): boolean {
  if (!user) return false
  return hasPermission(user, 'delete')
}

/**
 * Check if user is an admin
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false
  return user.role === 'admin'
}

/**
 * Check if user is at least a specific role
 */
export function hasRole(user: User | null, requiredRole: User['role']): boolean {
  if (!user) return false

  const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role)
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole)

  return userRoleIndex >= requiredRoleIndex
}

/**
 * Check if user can access a specific module/feature
 */
export function canAccessModule(
  user: User | null,
  module: 'audit' | 'observation' | 'report' | 'settings' | 'team'
): boolean {
  if (!user) return false
  return hasPermission(user, `${module}:view`)
}

/**
 * Check if user can perform an action on a specific module
 */
export function canPerformAction(
  user: User | null,
  module: string,
  action: 'view' | 'create' | 'edit' | 'delete' | 'comment'
): boolean {
  if (!user) return false
  return hasPermission(user, `${module}:${action}`)
}

/**
 * Get all permissions for a user
 */
export function getUserPermissions(user: User | null): string[] {
  if (!user) return []

  const rolePermissions = ROLE_PERMISSIONS[user.role] || []
  const customPermissions = user.permissions || []

  return [...new Set([...rolePermissions, ...customPermissions])]
}

/**
 * Check if user can export data
 */
export function canExport(user: User | null): boolean {
  if (!user) return false
  return hasPermission(user, 'export')
}

// Comment permissions
/**
 * Check if user can edit a comment
 * Users can edit their own comments, or managers/admins can edit any
 */
export function canEditComment(user: User | null, authorId: string): boolean {
  if (!user) return false
  if (user.id === authorId) return true       // Own comment
  return hasRole(user, 'manager')             // Manager/Admin
}

/**
 * Check if user can delete a comment
 * Same logic as edit - own comment or manager/admin
 */
export function canDeleteComment(user: User | null, authorId: string): boolean {
  return canEditComment(user, authorId)       // Same logic
}

// Leader permissions
/**
 * Check if user is the observation leader
 */
export function isObservationLeader(user: User | null, obs: { leaderId?: string }): boolean {
  return user?.id === obs.leaderId
}

/**
 * Check if user can manage an observation (leader or manager/admin)
 */
export function canManageObservation(user: User | null, obs: { leaderId?: string }): boolean {
  if (!user) return false
  if (hasRole(user, 'manager')) return true   // Manager/Admin override
  return isObservationLeader(user, obs)
}

/**
 * Check if user can transfer leadership of an observation
 */
export function canTransferLeadership(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

// Remediation permissions
/**
 * Check if user can submit a remediation plan
 * Leaders and assignees can submit
 */
export function canSubmitRemediation(user: User | null, obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean {
  if (!user) return false
  if (isObservationLeader(user, obs)) return true
  return obs.assignees?.some(a => a.id === user.id) ?? false
}

/**
 * Check if user can review (approve/reject) a remediation plan
 */
export function canReviewRemediation(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}

/**
 * Check if user can upload documents to an observation
 * Assignees, leaders, managers, and admins can upload
 */
export function canUploadDocument(user: User | null, obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean {
  if (!user) return false
  if (hasRole(user, 'manager')) return true   // Manager/Admin override
  if (isObservationLeader(user, obs)) return true
  return obs.assignees?.some(a => a.id === user.id) ?? false
}

/**
 * Check if user can edit/delete an observation
 * Only leaders and managers/admins can edit/delete
 */
export function canEditObservation(user: User | null, obs: { leaderId?: string }): boolean {
  if (!user) return false
  if (hasRole(user, 'manager')) return true   // Manager/Admin override
  return isObservationLeader(user, obs)
}

// Closure permissions
/**
 * Check if user can request closure of an observation
 * Leaders and assignees can request closure
 */
export function canRequestClosure(user: User | null, obs: { assignees?: { id?: string }[]; leaderId?: string }): boolean {
  if (!user) return false
  if (isObservationLeader(user, obs)) return true
  return obs.assignees?.some(a => a.id === user.id) ?? false
}

/**
 * Check if user can review (approve/reject) a closure request
 * Leaders and managers/admins can review closure
 */
export function canReviewClosure(user: User | null, obs: { leaderId?: string }): boolean {
  return canManageObservation(user, obs)
}
