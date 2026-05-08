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
] as const

export type Permission = (typeof PERMISSIONS)[number]

// Backwards-compat alias for the team-store `perms()` helper.
export const STANDARD_PERMISSIONS = PERMISSIONS
