// Small ISO-timestamp formatter for activity timelines.
//
// Server timestamps arrive as full ISO strings (e.g.
// `2026-05-17T17:26:58.561758+00:00`). Date-only strings (`YYYY-MM-DD`)
// pass through untouched so existing "day" rows still render legibly.

'use client'

import { useEffect, useState } from 'react'

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

/**
 * HANI-4: render a relative tail like "3 days ago" / "5 minutes ago".
 * Returns '' for date-only (`YYYY-MM-DD`) strings — those have no clock time
 * so a minute-precision relative label would be misleading. Set `isRTL` for
 * Arabic localisation via `Intl.RelativeTimeFormat`.
 */
export function formatRelativeTime(
  input: string | Date | null | undefined,
  isRTL = false,
  now: number = Date.now(),
): string {
  if (!input) return ''
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = d.getTime() - now
  const rtf = new Intl.RelativeTimeFormat(isRTL ? 'ar' : 'en', { numeric: 'auto' })
  const absSec = Math.abs(diffMs) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]
  for (const [unit, secs] of units) {
    if (absSec >= secs || unit === 'second') {
      const value = Math.round(diffMs / 1000 / secs)
      return rtf.format(value, unit)
    }
  }
  return ''
}

/**
 * HANI-4: live relative-time hook. Recomputes the "N ago" label every 60s so
 * timeline rows stay current without a reload. The absolute portion is static
 * and should be rendered with `formatTimelineDate`.
 */
export function useRelativeTime(
  input: string | Date | null | undefined,
  isRTL = false,
): string {
  const [label, setLabel] = useState(() => formatRelativeTime(input, isRTL))
  useEffect(() => {
    setLabel(formatRelativeTime(input, isRTL))
    const id = setInterval(() => {
      setLabel(formatRelativeTime(input, isRTL))
    }, 60_000)
    return () => clearInterval(id)
  }, [input, isRTL])
  return label
}
