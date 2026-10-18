import type { ReviewSchedule } from '@/types'

export function computeNextReview(schedule: ReviewSchedule, from: Date = new Date()): string {
  if (schedule.cadence === 'adhoc') return schedule.adhocDate ?? from.toISOString().split('T')[0]
  const next = new Date(from)
  switch (schedule.cadence) {
    case 'monthly':     next.setMonth(next.getMonth() + 1); break
    case 'quarterly':   next.setMonth(next.getMonth() + 3); break
    case 'semi-annual': next.setMonth(next.getMonth() + 6); break
    case 'yearly':      next.setFullYear(next.getFullYear() + 1); break
  }
  const day = schedule.dayOfMonth ?? 1
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, maxDay))
  return next.toISOString().split('T')[0]
}

export function cadenceToReviewCycleDays(cadence: ReviewSchedule['cadence']): number {
  switch (cadence) {
    case 'monthly':     return 30
    case 'quarterly':   return 90
    case 'semi-annual': return 180
    case 'yearly':      return 365
    default:            return 365
  }
}
