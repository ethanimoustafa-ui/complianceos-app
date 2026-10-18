// Small ISO-timestamp formatter for activity timelines.
//
// Server timestamps arrive as full ISO strings (e.g.
// `2026-05-17T17:26:58.561758+00:00`). Date-only strings (`YYYY-MM-DD`)
// pass through untouched so existing "day" rows still render legibly.
//
// W24-1 — locale-aware helpers added so every date-rendering site can
// consult the current locale ('ar' → 'ar-SA' with Arabic-Indic numerals)
// instead of hardcoding 'en-US'. Import `formatLocalizedDate` or
// `formatLocalizedQuarter` rather than calling `toLocaleDateString('en-US', …)`
// directly.

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

// ── W24-1: locale-aware date formatting helpers ─────────────────────────────

/**
 * Resolve the Intl locale string from the app's language setting.
 * 'ar' → 'ar-SA-u-nu-arab' (Arabic-Indic numerals, Arabic month names).
 * 'en' (or any other value) → 'en-US'.
 *
 * The `-u-nu-arab` extension requests the Arabic-Indic digit set
 * (٠١٢٣٤٥٦٧٨٩) instead of Western Arabic (0123456789).
 */
export function intlLocale(language: string): string {
  return language === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US'
}

/**
 * W24-1 — Format a `YYYY-MM-DD` or ISO date string for display in the current
 * locale. Produces output like:
 *   EN: "May 24, 2026"
 *   AR: "٢٤ مايو ٢٠٢٦"
 *
 * Falls back to the raw string if the input can't be parsed.
 */
export function formatLocalizedDate(
  input: string | Date | null | undefined,
  language: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
): string {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : ''
  // Use gregorian calendar explicitly to avoid hijri fallback on ar-SA.
  return d.toLocaleDateString(intlLocale(language), {
    calendar: 'gregory',
    ...options,
  })
}

/**
 * W24-1 — Format a quarter label like "Q2 2026" in the current locale.
 *   EN: "Q2 2026"
 *   AR: "الربع ٢ ٢٠٢٦"  (uses Arabic ordinal + Arabic-Indic year)
 *
 * Accepts a `Date` (defaults to current date when omitted).
 */
export function formatLocalizedQuarter(language: string, date: Date = new Date()): string {
  const q = Math.floor(date.getMonth() / 3) + 1
  const year = date.getFullYear()
  if (language !== 'ar') return `Q${q} ${year}`
  // Arabic-Indic numerals via Intl
  const nf = new Intl.NumberFormat('ar-SA-u-nu-arab')
  const quarterNames: Record<number, string> = {
    1: 'الربع الأول',
    2: 'الربع الثاني',
    3: 'الربع الثالث',
    4: 'الربع الرابع',
  }
  return `${quarterNames[q] ?? `الربع ${nf.format(q)}`} ${nf.format(year)}`
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
