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
