// Escalation rung logic — pure, unit-testable. The daily scan calls these to
// decide which (if any) notification an item is due for, and to whom.

export type Rung = 'due7' | 'due3' | 'due1' | 'overdue'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type NotifType = 'info' | 'warning' | 'error' | 'success'

/** Whole days from `today` to a date-only `deadline`. Positive = in the future. */
export function daysUntil(deadline: string, today: Date): number {
  const d = new Date(`${deadline.slice(0, 10)}T00:00:00Z`).getTime()
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((d - t) / 86_400_000)
}

/**
 * Which reminder bucket an item falls in, given days-until-deadline.
 *
 * Bucketed (not exact-match) so a missed scan day never skips a rung; the
 * per-rung dedup key keeps each bucket firing exactly once.
 *
 *   (3, 7]  → due7      (1, 3] → due3      [0, 1] → due1      ≤ -3 → overdue
 *
 * Between due and 3-days-overdue there is deliberately nothing: the single
 * overdue escalation (assignee + manager) only fires once the item is ~3 days
 * past due.
 */
export function rungFor(daysOut: number): Rung | null {
  if (daysOut > 7) return null
  if (daysOut > 3) return 'due7'
  if (daysOut > 1) return 'due3'
  if (daysOut >= 0) return 'due1'
  if (daysOut <= -3) return 'overdue'
  return null
}

const KNOWN = new Set<Severity>(['low', 'medium', 'high', 'critical'])

/** Normalise the assorted severity/priority/risk_level text columns to 4 levels. */
export function normalizeSeverity(raw: string | null | undefined): Severity {
  const s = (raw ?? '').toLowerCase().trim()
  if (KNOWN.has(s as Severity)) return s as Severity
  if (s === 'urgent' || s === 'severe') return 'critical'
  if (s === 'major') return 'high'
  if (s === 'moderate' || s === 'normal') return 'medium'
  if (s === 'minor' || s === 'info' || s === 'informational') return 'low'
  return 'medium'
}

/** The notifications.type (drives the bell colour/icon) for a rung + severity. */
export function notifType(rung: Rung, severity: Severity): NotifType {
  if (rung === 'overdue') return 'error'
  if (rung === 'due1') return 'warning'
  return severity === 'critical' || severity === 'high' ? 'warning' : 'info'
}
