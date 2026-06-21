// Pure mapping from a letter approval-chain step's human role title
// ('Compliance Officer' / 'Department Head' / 'Compliance Director') to the
// minimum 4-tier role (auditor < officer < manager < admin) required to act on
// that step — separation of duties. Used by BOTH the approve-step / reject-step
// API routes and the ApprovalStepActions client gate so the affordance matches
// what the server enforces. No imports → safe to use on client and server.

const TIER: Record<string, number> = { auditor: 0, officer: 1, manager: 2, admin: 3 }

/**
 * Minimum role tier required to act on an approval step, derived from its
 * human-readable role title. Unknown/blank titles map to the OFFICER tier (the
 * lenient default) so a mislabeled step never locks the whole chain out.
 */
export function stepRequiredTier(stepRole: string | null | undefined): number {
  const r = (stepRole ?? '').toLowerCase()
  if (r.includes('director') || r.includes('admin') || r.includes('chief')) return TIER.admin
  if (r.includes('head') || r.includes('manager') || r.includes('lead')) return TIER.manager
  return TIER.officer
}

/**
 * True if a caller holding `callerRole` (a 4-tier role key) may act on an
 * approval step whose required role is `stepRole`. Hierarchy-based: a higher tier
 * clears a lower step (an admin clears every step). Unknown caller roles → tier 0
 * (cannot act on anything above auditor).
 */
export function callerMeetsStepRole(
  callerRole: string | null | undefined,
  stepRole: string | null | undefined,
): boolean {
  const callerTier = TIER[(callerRole ?? '').toLowerCase()] ?? 0
  return callerTier >= stepRequiredTier(stepRole)
}
