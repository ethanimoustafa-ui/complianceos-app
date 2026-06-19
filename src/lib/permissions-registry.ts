// Permission registry — leaf module with zero imports so it can be consumed
// by both permissions.ts (which imports auth-store + team-store) and
// team-store.ts (which feeds into permissions.ts) without a circular cycle.
//
// Keep the order stable: it's the order toggles render in the member detail
// drawer. New permissions append.

export const PERMISSIONS = [
  // Manager-tier permissions (carried over from round 3)
  'Approve Policy Reviews',
  'Approve SAMA Letters',
  'Manage Audit Findings',
  'View Risk Register',
  'Export Compliance Data',
  'Can Act As Approver',
  'Manage Training Programs',
  // Admin-tier permissions (round 4 — see SPRINT-PLAN-ROUND-4-RBAC.md §2.2)
  'Manage Settings',
  'Manage Team & Permissions',
  'Configure Frameworks',
  'Configure Lists & Categories',
  'Manage Letter Templates',
  'Manage Policy Templates',
  'Manage Audit Templates',
  'Switch User (Demo)',
  // Round 6 — a dedicated, separately-grantable capability for moving policy +
  // rule workflow steps forward (submit / complete / initiate review).
  'Can Advance Workflow',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// Backwards-compat alias for the team-store `perms()` helper.
export const STANDARD_PERMISSIONS = PERMISSIONS

// ── Label → backend permission keys ──────────────────────────────────────────
// The Access Matrix toggles are LABELS (the `Permission` union above), but the
// server enforces lowercase:colon backend keys via `public.has_permission()`
// (RLS) + the custom_access_token_hook (JWT). `user_permissions.permission_key`
// FK-references `public.permissions.key`, so the matrix MUST persist the backend
// keys a label grants — NOT the label text (that was the FK-violation 500).
//
// A label maps to ZERO OR MORE real backend keys. Labels that are purely a
// client-side affordance (no server-enforced key) map to `[]`; toggling them
// updates only the in-memory `accessControls` and writes nothing to
// `user_permissions` (so no FK error, no phantom grant).
//
// IMPORTANT: every key on the right-hand side MUST exist in `public.permissions`
// (migrations 018 + 115). Keep this in sync with that seed.
export const PERMISSION_BACKEND_KEYS: Record<Permission, readonly string[]> = {
  // Policy review approval ⇒ ability to edit policies (drive the workflow).
  'Approve Policy Reviews': ['policy:edit'],
  // Letter approval ⇒ edit letters.
  'Approve SAMA Letters': ['letter:edit'],
  // Audit findings management ⇒ edit audits + observations.
  'Manage Audit Findings': ['audit:edit', 'observation:edit'],
  // Pure client labels (no server-enforced key yet).
  'View Risk Register': [],
  'Export Compliance Data': ['export'],
  'Can Act As Approver': [],
  'Manage Training Programs': ['training:edit'],
  // Admin-tier — these map to the existing settings/team backend keys so an
  // officer granted them in the matrix can actually reach those server routes.
  'Manage Settings': ['settings:edit', 'settings:view'],
  'Manage Team & Permissions': ['team:edit', 'team:invite', 'team:remove', 'team:view'],
  // Round 8 (migration 119): two INDEPENDENT settings capabilities. Frameworks
  // (incl. the company compliance threshold) vs Configurables (lists, categories,
  // tiers, departments, AND all template managers — templates live in the
  // Configurables hub). Each is its own backend key so granting one in the matrix
  // does NOT grant the other. settings:edit remains the manager/admin superuser
  // key (config routes OR it in), so those tiers keep full access.
  'Configure Frameworks': ['frameworks:config'],
  'Configure Lists & Categories': ['lists:config'],
  'Manage Letter Templates': ['lists:config'],
  'Manage Policy Templates': ['lists:config'],
  'Manage Audit Templates': ['lists:config'],
  'Switch User (Demo)': [],
  // Workflow advancement is enforced by a dedicated backend key (migration 117)
  // OR'd alongside edit/ownership on the policy + rule advance routes.
  'Can Advance Workflow': ['workflow:advance'],
}

// ── Granular per-entity permissions (round 5 — migration 115) ─────────────────
// These are backend permission KEYS surfaced directly in the Access Matrix
// (one toggle per key, grouped by entity). Unlike the labels above they are not
// part of the `Permission` union — they're persisted straight to
// `user_permissions` and enforced by the entity create/edit/delete routes.
//
// `audit` + `observation` already had granular keys (migrations 018); they're
// listed here so the matrix can expose them in the same grouped UI.
export interface GranularEntity {
  /** i18n key for the entity column-group header. */
  readonly groupKey: string
  /** Backend keys for create / edit / delete (always present). */
  readonly create: string
  readonly edit: string
  readonly delete: string
  /** Export (PDF/CSV) — most entities have an export affordance. */
  readonly export?: string
  /** Checklist management (add deadline / check / delete / reorder). Only the
   *  entities that actually have checklists: policies, rules, risks, audits. */
  readonly checklist?: string
}

export const GRANULAR_ENTITIES: readonly GranularEntity[] = [
  { groupKey: 'accessMatrix.entityPolicies', create: 'policy:create', edit: 'policy:edit', delete: 'policy:delete', export: 'policy:export', checklist: 'policy:checklist' },
  { groupKey: 'accessMatrix.entityCirculars', create: 'circular:create', edit: 'circular:edit', delete: 'circular:delete', export: 'circular:export', checklist: 'circular:checklist' },
  { groupKey: 'accessMatrix.entityObservations', create: 'observation:create', edit: 'observation:edit', delete: 'observation:delete', export: 'observation:export', checklist: 'observation:checklist' },
  { groupKey: 'accessMatrix.entityAudits', create: 'audit:create', edit: 'audit:edit', delete: 'audit:delete', export: 'audit:export', checklist: 'audit:checklist' },
  { groupKey: 'accessMatrix.entityRisks', create: 'risk:create', edit: 'risk:edit', delete: 'risk:delete', export: 'risk:export', checklist: 'risk:checklist' },
  { groupKey: 'accessMatrix.entityLetters', create: 'letter:create', edit: 'letter:edit', delete: 'letter:delete', export: 'letter:export' },
  { groupKey: 'accessMatrix.entityTraining', create: 'training:create', edit: 'training:edit', delete: 'training:delete', export: 'training:export' },
  // Round 7 (migration 118) — correspondence Feed + Advisory granular CRUD.
  { groupKey: 'accessMatrix.entityFeed', create: 'feed:create', edit: 'feed:edit', delete: 'feed:delete' },
  { groupKey: 'accessMatrix.entityAdvisory', create: 'advisory:create', edit: 'advisory:edit', delete: 'advisory:delete' },
] as const

/** The ordered action keys a granular entity exposes (used by the matrix UI). */
export const GRANULAR_ACTIONS = ['create', 'edit', 'delete', 'export', 'checklist'] as const
export type GranularAction = (typeof GRANULAR_ACTIONS)[number]

// Flat list of every granular backend key the matrix manages, in render order.
export const GRANULAR_PERMISSION_KEYS: readonly string[] = GRANULAR_ENTITIES.flatMap(
  (e) => GRANULAR_ACTIONS.map((a) => e[a]).filter((k): k is string => !!k),
)

// ── Hydration: backend grants → matrix accessControls ─────────────────────────
// The matrix toggle state lives on `TeamMember.accessControls` as
// `{ label, enabled }[]`, where `label` is EITHER one of the 15 `Permission`
// labels OR a granular backend key. Given the member's explicit per-user grants
// (user_permissions where granted = true), reconstruct that array so a reload
// shows the same toggles the operator set.
//
//   • A label is enabled iff it maps to ≥1 backend key and EVERY one of those
//     keys is granted (it represents the whole bundle being on).
//   • A granular key is enabled iff it appears in the grant set.
export function accessControlsFromGrants(
  grantedKeys: readonly string[],
): { label: string; enabled: boolean }[] {
  const granted = new Set(grantedKeys)
  const out: { label: string; enabled: boolean }[] = []
  for (const label of PERMISSIONS) {
    const keys = PERMISSION_BACKEND_KEYS[label]
    const enabled = keys.length > 0 && keys.every((k) => granted.has(k))
    out.push({ label, enabled })
  }
  for (const key of GRANULAR_PERMISSION_KEYS) {
    out.push({ label: key, enabled: granted.has(key) })
  }
  return out
}
