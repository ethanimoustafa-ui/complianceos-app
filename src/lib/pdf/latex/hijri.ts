// Hijri (Umm al-Qura) and Gregorian date formatting for SAMA letters.
//
// The real Tasheel letter is dated in BOTH calendars:
//   التاريخ: 02/11/1446 هـ   /   الموافق: 30/04/2025 م
//
// We derive the Hijri date from the Gregorian one via the Intl Umm al-Qura
// calendar (`islamic-umalqura`) — the variant SAMA uses — so callers only need
// to supply a single JS Date. No external dependency. The numeric "dd/MM/yyyy"
// shape is locale-stable; the calendar suffixes (هـ / م) are added by the
// template, not here.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Gregorian date as "dd/MM/yyyy" (Western digits, fixed order). */
export function formatGregorian(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

/**
 * Hijri (Umm al-Qura) date as "dd/MM/yyyy" with Western digits.
 * Uses Intl with the `islamic-umalqura` calendar and Latin numbering so the
 * output is purely numeric (the template adds the "هـ" marker).
 */
export function formatHijri(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = get('day')
  const month = get('month')
  const year = get('year').replace(/[^0-9]/g, '') // strip any era/AH marker

  if (!day || !month || !year) {
    // Defensive fallback — should not happen on supported runtimes.
    return formatGregorian(date)
  }
  return `${day}/${month}/${year}`
}

/** Both calendar strings for a given date (defaults to now via caller). */
export function formatDualDates(date: Date): { hijriDate: string; gregorianDate: string } {
  return { hijriDate: formatHijri(date), gregorianDate: formatGregorian(date) }
}
