// Small ISO-timestamp formatter for activity timelines.
//
// Server timestamps arrive as full ISO strings (e.g.
// `2026-05-17T17:26:58.561758+00:00`). Date-only strings (`YYYY-MM-DD`)
// pass through untouched so existing "day" rows still render legibly.

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Format an ISO timestamp as e.g. `May 17, 2026 · 5:26 PM`.
 * Returns the original string if it's already a `YYYY-MM-DD` day or
 * fails to parse. Set `isRTL` for Arabic localisation.
 */
export function formatTimelineDate(input: string | Date | null | undefined, isRTL = false): string {
  if (!input) return ''
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) return input
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : ''
  const locale = isRTL ? 'ar-SA' : 'en-US'
  const datePart = d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    calendar: 'gregory',
  })
  const timePart = d.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart} · ${timePart}`
}
