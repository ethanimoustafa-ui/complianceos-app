'use client'

import { ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { hasPermission, hasRole, isAdmin, canEdit, canDelete, useEffectivePermissions } from '@/lib/rbac/permissions'
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
 * RoleGuard component - conditionally renders children based on user permissions.
 *
 * Round 4 Phase 2: this component is the legacy entry point. New code should
 * prefer `<Gate>` from `@/components/auth/gate` (cleaner Permission-typed API).
 * RoleGuard's internals subscribe to the new effective-permissions hook so
 * that runtime permission edits in the member detail drawer take effect
 * immediately.
 *
 * Role hierarchy: officer < manager < admin
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
  // Subscribe to effective permissions so toggle changes re-render gated UI.
  // The hook return value is unused directly; the helpers consult the same
  // store internally via `useTeamStore.getState()`.
  void useEffectivePermissions()

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
 * Hook version for more complex conditional logic.
 */
export function useRoleGuard() {
  const user = useAuthStore((state) => state.user)
  // Subscribe so consumers re-render on permission changes.
  void useEffectivePermissions()

  return {
    user,
    isAdmin: isAdmin(user),
    canEdit: canEdit(user),
    canDelete: canDelete(user),
    hasPermission: (permission: string) => hasPermission(user, permission),
    hasRole: (role: User['role']) => hasRole(user, role),
  }
}
