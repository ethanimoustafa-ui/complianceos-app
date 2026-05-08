// Round 4 Phase 6 — internal helper used by mutating store actions to
// authorise the current user against a registry permission. Consolidates the
// pattern documented in SPRINT-PLAN-ROUND-4-RBAC.md §8.1:
//
//   const user = useAuthStore.getState().user
//   const members = useTeamStore.getState().members
//   const can = getEffectivePermissions(user, members).includes(permission)
//   if (!user || !can) {
//     useUserLogStore.getState().log({ ... })
//     throw new RBACError(permission)
//   }
//
// Returns the resolved user so callers can replace removed `actor`/
// `approverName` parameters with `user.name`. Throws `RBACError` on denial
// (caller need not re-throw).

import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useUserLogStore } from '@/stores/user-log-store'
import { getEffectivePermissions, type Permission } from '@/lib/permissions'
import { RBACError } from '@/lib/rbac-error'
import type { User } from '@/types'

export interface GateContext {
  storeName: string
  actionName: string
  /**
   * Free-form id of the record being mutated. For permission_denied logs the
   * target is rendered as `${storeName}:${id}:${actionName}`.
   */
  id?: string
}

export function requirePermission(
  permission: Permission,
  ctx: GateContext,
): User {
  const user = useAuthStore.getState().user
  const members = useTeamStore.getState().members
  const can = !!user && getEffectivePermissions(user, members).includes(permission)
  if (!user || !can) {
    useUserLogStore.getState().log({
      userId: user?.id ?? 'anonymous',
      action: 'auth.permission_denied',
      target: `${ctx.storeName}:${ctx.id ?? 'n/a'}:${ctx.actionName}`,
    })
    throw new RBACError(permission)
  }
  return user
}
