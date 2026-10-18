import { useMemo } from 'react'
import type { TeamMember, User } from '@/types'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { PERMISSIONS, STANDARD_PERMISSIONS, type Permission } from '@/lib/rbac/permissions-registry'

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
  // Granular per-entity keys (migration 115).
  'policy:create',
  'policy:edit',
  'policy:delete',
  'circular:create',
  'circular:edit',
  'circular:delete',
  'risk:create',
  'risk:edit',
  'risk:delete',
  'letter:create',
  'letter:edit',
  'letter:delete',
  'training:create',
  'training:edit',
  'training:delete',
  // Export + checklist + workflow (migration 117).
  'policy:export',
  'circular:export',
  'observation:export',
  'audit:export',
  'risk:export',
  'letter:export',
  'training:export',
  'policy:checklist',
  'circular:checklist',
  'risk:checklist',
  'audit:checklist',
  'workflow:advance',
  // Observation checklist + Feed/Advisory granular CRUD (migration 118).
  'observation:checklist',
  'feed:create',
  'feed:edit',
  'feed:delete',
  'advisory:create',
  'advisory:edit',
  'advisory:delete',
  // Settings split (migration 119): Frameworks config vs Configurables config.
  'frameworks:config',
  'lists:config',
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

const ROLE_HIERARCHY: User['role'][] = ['auditor', 'officer', 'manager', 'admin']

export { PERMISSIONS, STANDARD_PERMISSIONS }
export type { Permission }

// Granular per-entity keys (migration 115). Officers hold create+edit on every
// entity (not delete); managers/admins hold all of them.
const GRANULAR_CREATE_EDIT = ['policy:create', 'policy:edit', 'circular:create', 'circular:edit', 'risk:create', 'risk:edit', 'letter:create', 'letter:edit', 'training:create', 'training:edit']
const GRANULAR_DELETE = ['policy:delete', 'circular:delete', 'risk:delete', 'letter:delete', 'training:delete']
// Round 6 (migration 117): per-entity export, per-entity checklist, workflow advance.
const GRANULAR_EXPORT = ['policy:export', 'circular:export', 'observation:export', 'audit:export', 'risk:export', 'letter:export', 'training:export']
const GRANULAR_CHECKLIST = ['policy:checklist', 'circular:checklist', 'risk:checklist', 'audit:checklist', 'observation:checklist']
const WORKFLOW_ADVANCE = ['workflow:advance']
// Round 7 (migration 118): Feed + Advisory granular CRUD. Officers hold
// create+edit (NOT delete — mirrors GRANULAR_CREATE_EDIT); managers/admins hold
// all via ALL_PERMISSIONS below.
const GRANULAR_FEED_ADVISORY_CREATE_EDIT = ['feed:create', 'feed:edit', 'advisory:create', 'advisory:edit']
const GRANULAR_FEED_ADVISORY_DELETE = ['feed:delete', 'advisory:delete']
// Round 8 (migration 119): two independent settings-config capabilities. Admin
// tier holds both (managers/admins also pass config routes via settings:edit);
// officers get NEITHER by role — they're grant-only via the Access Matrix.
const SETTINGS_CONFIG = ['frameworks:config', 'lists:config']

// Legacy role-permission map — used as a fallback for the lowercase:colon
// permission strings that pre-date the round-4 registry.
const ALL_PERMISSIONS = ['view', 'comment', 'create', 'edit', 'delete', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'audit:delete', 'observation:view', 'observation:comment', 'observation:create', 'observation:edit', 'observation:delete', 'report:view', 'report:create', 'report:delete', 'export', 'settings:view', 'settings:edit', 'team:view', 'team:invite', 'team:edit', 'team:remove', ...GRANULAR_CREATE_EDIT, ...GRANULAR_DELETE, ...GRANULAR_EXPORT, ...GRANULAR_CHECKLIST, ...WORKFLOW_ADVANCE, ...GRANULAR_FEED_ADVISORY_CREATE_EDIT, ...GRANULAR_FEED_ADVISORY_DELETE, ...SETTINGS_CONFIG]

export const ROLE_PERMISSIONS: Record<User['role'], string[]> = {
  // Mirrors the DB role_permissions seed (migrations 108 + 115). auditor < officer < manager = admin.
  auditor: ['view', 'comment', 'audit:view', 'observation:view', 'observation:comment', 'observation:create', 'observation:edit', 'report:view', 'export'],
  // Ownership model (migration 121): officers do NOT hold 'workflow:advance' by
  // role — they drive a workflow only when they OWN the item, or when explicitly
  // granted "Can Advance Workflow" via the Access Matrix. WORKFLOW_ADVANCE was
  // removed here to mirror the DB role_permissions change.
  officer: ['view', 'comment', 'create', 'edit', 'audit:view', 'audit:comment', 'audit:create', 'audit:edit', 'observation:view', 'observation:comment', 'observation:create', 'observation:edit', 'report:view', 'report:create', 'export', ...GRANULAR_CREATE_EDIT, ...GRANULAR_EXPORT, ...GRANULAR_CHECKLIST, ...GRANULAR_FEED_ADVISORY_CREATE_EDIT],
  manager: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
}

// ── Effective permissions derivation (RBAC-012) ──────────────────────────────
export function getEffectivePermissions(user: User | null, members: TeamMember[]): Permission[] {
  if (!user) return []
  if (user.role === 'admin' || user.role === 'manager') return [...PERMISSIONS]

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
  if ((user.permissions ?? []).includes(permission)) return true
  // Backend permission keys (role tiers + per-user matrix grants) are fetched
  // from Supabase into auth-store.permissions — NOT onto user.permissions (which
  // stays []). Consult them so a granted `<entity>:<action>` key actually gates
  // the corresponding button. See fetchPermissions (auth-store).
  return useAuthStore.getState().permissions.includes(permission)
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

// Resource name (as passed by call sites) → the granular entity-key PREFIX
// (migrations 115/117). Lets canEdit/canDelete/canCreate/canExport consult the
// `<entity>:<action>` backend key a matrix grant actually writes — without this,
// granting e.g. `circular:edit` had zero client effect (the button still gated
// on the manager-tier label only). Keep in sync with GRANULAR_ENTITIES.
const RESOURCE_ENTITY: Record<string, string> = {
  policy: 'policy', policies: 'policy',
  circular: 'circular', circulars: 'circular', rule: 'circular', rules: 'circular',
  letter: 'letter', letters: 'letter', 'sama-letter': 'letter', 'sama-letters': 'letter',
  risk: 'risk', risks: 'risk',
  audit: 'audit', audits: 'audit',
  observation: 'observation', observations: 'observation',
  training: 'training',
  // Correspondence Feed + Advisory (migration 118).
  feed: 'feed', correspondence: 'feed',
  advisory: 'advisory',
}

export function canEdit(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    const entity = RESOURCE_ENTITY[resource]
    // Granular grant (or role-tier grant) on `<entity>:edit`.
    if (entity && hasPermission(user, `${entity}:edit`)) return true
    // Legacy manager-tier label.
    const label = RESOURCE_EDIT_PERMISSION[resource]
    if (label && hasPermission(user, label)) return true
    // A KNOWN resource with neither grant → denied (don't over-grant via the
    // manager fallback below, which is only for unknown/no-resource call sites).
    if (entity || label) return false
  }
  return hasRole(user, 'manager')
}

export function canDelete(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    const entity = RESOURCE_ENTITY[resource]
    // Granular `<entity>:delete` grant — any role granted it (incl. officers)
    // can delete. (Replaces the old hardcoded "officers never delete".)
    if (entity && hasPermission(user, `${entity}:delete`)) return true
    // Manager-tier: a manager who holds the resource's edit label may delete it.
    const label = RESOURCE_EDIT_PERMISSION[resource]
    if (label && hasRole(user, 'manager') && hasPermission(user, label)) return true
    if (entity || label) return false
  }
  return false
}

export function canCreate(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    const entity = RESOURCE_ENTITY[resource]
    // Granular `<entity>:create` (revocable per-entity). Officers hold these by
    // role (migration 115) so existing create flows keep working.
    if (entity) return hasPermission(user, `${entity}:create`)
  }
  return hasPermission(user, 'create')
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

export function canExport(user: User | null, resource?: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (resource) {
    const entity = RESOURCE_ENTITY[resource]
    if (entity && hasPermission(user, `${entity}:export`)) return true
  }
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

// W38: author-or-admin only — aligned with the server gate on
// PATCH/DELETE /api/observations/[id]/comments/[commentId] (author, or a
// holder of `observation:delete`, i.e. org_admin). The old
// 'Manage Audit Findings' loophole showed a delete button the server 403'd.
export function canDeleteComment(user: User | null, authorId: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.id === authorId
}

export function isObservationLeader(user: User | null, obs: { leaderId?: string }): boolean {
  return user?.id === obs.leaderId
}

// W39 (product rule): "only people added to the observation can do things to
// the observation" — managing (review verdicts, transfer, edit, reopen) is
// the LEADER's job; org_admin retains oversight. The old global
// 'Manage Audit Findings' fallthrough let unrelated staff manage any
// observation, which the server now rejects.
export function canManageObservation(user: User | null, obs: { leaderId?: string }): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return isObservationLeader(user, obs)
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

// ── Ownership-or-permission edit gates (circular rules + policy workflow) ─────
// A user may edit a rule's article checklist / advance a policy's workflow if
// they hold the backend 'edit' permission (managers & admins do via their role;
// officers via the access matrix) OR they are the single owner/assignee of that
// resource — "only one person works on a rule". These MIRROR the API route
// guards + the RLS predicates (migration 114) so the client affordance matches
// exactly what the server enforces.
export function canEditCircular(
  user: User | null,
  circular: { assignedTo?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (hasPermission(user, 'edit')) return true
  return !!circular?.assignedTo && user.id === circular.assignedTo
}

export function canAdvancePolicyWorkflow(
  user: User | null,
  policy: { ownerId?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  // Ownership model: advancing requires the global 'workflow:advance' grant
  // (managers/admins by role; officers only via the Access Matrix) OR being the
  // policy's owner. The generic 'edit' no longer grants advance — editing and
  // advancing are distinct. Mirrors the policy advance route.
  if (hasPermission(user, 'workflow:advance')) return true
  return !!policy?.ownerId && user.id === policy.ownerId
}

// Advancing a rule's workflow: global 'workflow:advance' OR being the rule's
// assignee (owner). Mirrors the circular advance route.
export function canAdvanceCircular(
  user: User | null,
  circular: { assignedTo?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (hasPermission(user, 'workflow:advance')) return true
  return !!circular?.assignedTo && user.id === circular.assignedTo
}

// Starting / completing an audit: global 'workflow:advance' OR being the audit's
// assignee (owner). Mirrors the audit start/complete routes.
export function canAdvanceAudit(
  user: User | null,
  audit: { assigneeId?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (hasPermission(user, 'workflow:advance')) return true
  return !!audit?.assigneeId && user.id === audit.assigneeId
}

// Driving a letter's approval workflow (submit-for-approval, approve, approve-step,
// reject-step, send): global 'workflow:advance' OR being the letter's CREATOR
// (letters.created_by — exposed to the client as `createdById`, NOT the
// display-name `createdBy`). The generic 'edit'/'letter:edit' does NOT grant it —
// editing a letter and driving its approval are distinct (the ownership model).
// Mirrors `canDriveWorkflow` on the server + the letter submit/approve/send routes
// so the client affordance matches exactly what the API enforces.
//
// FLAG (needs design): the per-step approval-chain role (letter_approval_steps.role
// holds 'Compliance Officer'/'Department Head'/'Compliance Director') is NOT
// enforced here or on the server — there is no clean mapping to profiles.role
// (admin/manager/officer). So any workflow:advance holder (or the creator) can act
// on ANY step. See the server approve-step route comment.
export function canDriveLetter(
  user: User | null,
  letter: { createdById?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (hasPermission(user, 'workflow:advance')) return true
  return !!letter?.createdById && user.id === letter.createdById
}

// Alias for the approval verdict (approve-step / reject-step) actions — same gate
// as driving the workflow. Kept as a distinct name so call sites read clearly.
export const canApproveLetter = canDriveLetter

// Driving a risk's mitigation workflow (OWNER-SIDE actions: send-to-department,
// accept-plan, and the resolving mitigation-checklist toggle): global
// 'workflow:advance' OR being the risk's owner (risks.owner_id). The generic
// 'edit'/'audit:edit' does NOT grant it. Mirrors `canDriveWorkflow` on the
// server + the risk workflow routes, so the client affordance matches exactly
// what the API enforces. Note: this gates OWNER-SIDE actions only — the
// department-side submit-plan is NOT gated by this helper.
export function canAdvanceRisk(
  user: User | null,
  risk: { ownerId?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (hasPermission(user, 'workflow:advance')) return true
  return !!risk?.ownerId && user.id === risk.ownerId
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

// ── Granular entity-action hooks (reactive wrappers over canEdit/…) ───────────
// Subscribe to the auth user + backend permission keys + team members so a gated
// button re-renders the instant a grant changes. They consult the
// `<entity>:<action>` granular keys (matrix grants + role tiers) AND the legacy
// manager-tier labels — so granting e.g. `circular:edit` enables the rules Edit
// button without a manager role. Pass the resource name (e.g. 'circular',
// 'policy', 'letter', 'risk', 'audit', 'observation', 'training').
function useGranularGate(
  fn: (u: User | null, r?: string) => boolean,
  resource: string,
): boolean {
  const user = useAuthStore((s) => s.user)
  // Subscribe for reactivity — fn reads these via getState() internally.
  useAuthStore((s) => s.permissions)
  useTeamStore((s) => s.members)
  return fn(user, resource)
}

export function useCanEditEntity(resource: string): boolean {
  return useGranularGate(canEdit, resource)
}
export function useCanDeleteEntity(resource: string): boolean {
  return useGranularGate(canDelete, resource)
}
export function useCanCreateEntity(resource: string): boolean {
  return useGranularGate(canCreate, resource)
}
export function useCanExportEntity(resource: string): boolean {
  return useGranularGate(canExport, resource)
}

// Unified dispatcher — `useEntityCan('edit', 'circular')`. Powers <EntityGate>.
export type EntityAction = 'create' | 'edit' | 'delete' | 'export'
export function useEntityCan(action: EntityAction, resource: string): boolean {
  const user = useAuthStore((s) => s.user)
  // Subscribe for reactivity — the canX helpers read these via getState().
  useAuthStore((s) => s.permissions)
  useTeamStore((s) => s.members)
  switch (action) {
    case 'create':
      return canCreate(user, resource)
    case 'edit':
      return canEdit(user, resource)
    case 'delete':
      return canDelete(user, resource)
    case 'export':
      return canExport(user, resource)
  }
}

export { ROLE_HIERARCHY }
