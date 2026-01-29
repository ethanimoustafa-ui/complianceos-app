'use client'

import { ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { hasPermission, hasRole, isAdmin, canEdit, canDelete } from '@/lib/permissions'
import type { User } from '@/types'

interface RoleGuardProps {
  children: ReactNode
  /** Require user to have specific role or higher */
  requiredRole?: User['role']
  /** Require user to have specific permission */
  requiredPermission?: string
  /** Require user to have any of these permissions */
  anyPermission?: string[]
  /** Require user to have all of these permissions */
  allPermissions?: string[]
  /** Shorthand: require admin role */
  adminOnly?: boolean
  /** Shorthand: require edit permission */
  editOnly?: boolean
  /** Shorthand: require delete permission */
  deleteOnly?: boolean
  /** Fallback content to show if access denied */
  fallback?: ReactNode
  /** Hide completely instead of showing fallback */
  hidden?: boolean
}

/**
 * RoleGuard component - conditionally renders children based on user permissions
 *
 * Role hierarchy: officer < manager < admin
 *
 * Usage examples:
 * <RoleGuard adminOnly>Admin content</RoleGuard>
 * <RoleGuard requiredRole="manager">Manager content</RoleGuard>
 * <RoleGuard requiredPermission="audit:create">Create audit button</RoleGuard>
 * <RoleGuard anyPermission={['edit', 'create']}>Edit or create</RoleGuard>
 * <RoleGuard editOnly hidden>Edit button (hidden for officers)</RoleGuard>
 * <RoleGuard deleteOnly hidden>Delete button (admin only)</RoleGuard>
 */
export function RoleGuard({
  children,
  requiredRole,
  requiredPermission,
  anyPermission,
  allPermissions,
  adminOnly,
  editOnly,
  deleteOnly,
  fallback = null,
  hidden = false,
}: RoleGuardProps) {
  const user = useAuthStore((state) => state.user)

  // Check various conditions
  let hasAccess = true

  if (adminOnly && !isAdmin(user)) {
    hasAccess = false
  }

  if (editOnly && !canEdit(user)) {
    hasAccess = false
  }

  if (deleteOnly && !canDelete(user)) {
    hasAccess = false
  }

  if (requiredRole && !hasRole(user, requiredRole)) {
    hasAccess = false
  }

  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    hasAccess = false
  }

  if (anyPermission && anyPermission.length > 0) {
    const hasAny = anyPermission.some((perm) => hasPermission(user, perm))
    if (!hasAny) hasAccess = false
  }

  if (allPermissions && allPermissions.length > 0) {
    const hasAll = allPermissions.every((perm) => hasPermission(user, perm))
    if (!hasAll) hasAccess = false
  }

  if (!hasAccess) {
    if (hidden) return null
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Hook version for more complex conditional logic
 */
export function useRoleGuard() {
  const user = useAuthStore((state) => state.user)

  return {
    user,
    isAdmin: isAdmin(user),
    canEdit: canEdit(user),
    canDelete: canDelete(user),
    hasPermission: (permission: string) => hasPermission(user, permission),
    hasRole: (role: User['role']) => hasRole(user, role),
  }
}
