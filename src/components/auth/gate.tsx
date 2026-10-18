'use client'

import { ReactNode } from 'react'
import { useCan, useCanAny, useEntityCan, type EntityAction } from '@/lib/rbac/permissions'
import type { Permission } from '@/lib/rbac/permissions-registry'

interface GateProps {
  /** Permission(s) required to render the children. Array means ALL required. */
  perm?: Permission | Permission[]
  /** Permission list — render if the user has ANY of these. Mutually exclusive with `perm`. */
  anyOf?: Permission[]
  /** Optional fallback rendered when the user lacks the permission(s). Defaults to null. */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Gate — conditionally renders `children` based on the current user's
 * effective permissions. Use this for surfaces that should disappear
 * entirely when the user lacks access (buttons, menu items, sections).
 *
 * For "render with disabled+tooltip" use `useCan` directly.
 *
 * @example
 *   <Gate perm="Approve Policy Reviews">
 *     <Button>Approve</Button>
 *   </Gate>
 *
 * @example
 *   <Gate perm="Manage Settings" fallback={<ForbiddenPanel />}>
 *     <SettingsPage />
 *   </Gate>
 */
export function Gate({ perm, anyOf, fallback = null, children }: GateProps) {
  if (perm && anyOf) {
    throw new Error('<Gate> received both `perm` and `anyOf` — pick one.')
  }
  // Hooks must be called unconditionally; pass safe defaults when one form is unused.
  const allowedAll = useCan(perm ?? [])
  const allowedAny = useCanAny(anyOf ?? [])

  let allowed: boolean
  if (perm !== undefined) allowed = allowedAll
  else if (anyOf !== undefined) allowed = allowedAny
  else allowed = true // No perms specified — render unconditionally.

  return <>{allowed ? children : fallback}</>
}

/**
 * EntityGate — like <Gate> but gates on a GRANULAR per-entity action key
 * (`<entity>:<action>`) via useEntityCan. Use this for entity Create / Edit /
 * Delete / Export affordances so a matrix grant (or role tier) actually enables
 * them — instead of gating on the coarse manager-tier label.
 *
 * @example
 *   <EntityGate action="create" entity="policy"><Button>New Policy</Button></EntityGate>
 *   <EntityGate action="delete" entity="letter"><DeleteButton /></EntityGate>
 */
export function EntityGate({
  action,
  entity,
  fallback = null,
  children,
}: {
  action: EntityAction
  entity: string
  fallback?: ReactNode
  children: ReactNode
}) {
  const allowed = useEntityCan(action, entity)
  return <>{allowed ? children : fallback}</>
}
