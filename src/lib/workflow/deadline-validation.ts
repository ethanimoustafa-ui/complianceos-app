// Validation helpers for child deadlines (phase / checklist item) against a parent
// deadline (rule due date, policy nextReviewDate, observation dueDate, etc.).

export type DeadlineValidationResult =
  | { ok: true }
  | { ok: false; reason: 'after-parent' | 'invalid-date' }

export function validateChildDeadline(
  childDeadline: string | undefined | null,
  parentDeadline: string | undefined | null,
): DeadlineValidationResult {
  if (!childDeadline) return { ok: true }
  const childTime = Date.parse(childDeadline)
  if (Number.isNaN(childTime)) return { ok: false, reason: 'invalid-date' }
  if (parentDeadline) {
    const parentTime = Date.parse(parentDeadline)
    if (!Number.isNaN(parentTime) && childTime > parentTime) {
      return { ok: false, reason: 'after-parent' }
    }
  }
  return { ok: true }
}

export function isOverdue(deadline: string | undefined | null, now: Date = new Date()): boolean {
  if (!deadline) return false
  const t = Date.parse(deadline)
  if (Number.isNaN(t)) return false
  // Compare against start-of-today so the day itself is not yet overdue.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return t < startOfToday
}
