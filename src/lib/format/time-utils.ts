import type { TranslationKey, InterpolationParams } from '@/i18n'
import type { AuditFrequency } from '@/types'

/**
 * Formats a timestamp into a localized relative time string.
 * Uses the existing notification translations for consistency.
 *
 * @param timestamp - Date, timestamp number, or ISO string
 * @param t - Translation function from useTranslation hook
 * @returns Localized relative time string (e.g., "2 hours ago", "Yesterday", "أمس")
 */
export function formatRelativeTime(
  timestamp: Date | number | string,
  t: (key: TranslationKey) => string
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Just now (less than 1 minute)
  if (diffSeconds < 60) {
    return t('notifications.justNow')
  }

  // Minutes ago
  if (diffMinutes < 60) {
    if (diffMinutes === 1) {
      return `1 ${t('notifications.minuteAgo')}`
    }
    return `${diffMinutes} ${t('notifications.minutesAgo')}`
  }

  // Hours ago
  if (diffHours < 24) {
    if (diffHours === 1) {
      return `1 ${t('notifications.hourAgo')}`
    }
    return `${diffHours} ${t('notifications.hoursAgo')}`
  }

  // Yesterday
  if (diffDays === 1) {
    return t('notifications.yesterday')
  }

  // Days ago (up to 7 days)
  if (diffDays < 7) {
    if (diffDays === 1) {
      return `1 ${t('notifications.dayAgo')}`
    }
    return `${diffDays} ${t('notifications.daysAgo')}`
  }

  // For older dates, return formatted date based on locale
  // This will automatically handle RTL for Arabic
  return date.toLocaleDateString()
}

/**
 * Parses a relative time string like "2 hours ago" or "Yesterday"
 * and returns an approximate Date object.
 * Useful for converting mock data timestamps.
 *
 * @param timeString - Relative time string in English
 * @returns Date object representing the approximate time
 */
export function parseRelativeTime(timeString: string): Date {
  const now = new Date()

  // Handle "Yesterday"
  if (timeString.toLowerCase() === 'yesterday') {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday
  }

  // Handle "X hours ago"
  const hoursMatch = timeString.match(/(\d+)\s*hours?\s*ago/i)
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10)
    const date = new Date(now)
    date.setHours(date.getHours() - hours)
    return date
  }

  // Handle "X days ago"
  const daysMatch = timeString.match(/(\d+)\s*days?\s*ago/i)
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10)
    const date = new Date(now)
    date.setDate(date.getDate() - days)
    return date
  }

  // Handle "X minutes ago"
  const minutesMatch = timeString.match(/(\d+)\s*minutes?\s*ago/i)
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10)
    const date = new Date(now)
    date.setMinutes(date.getMinutes() - minutes)
    return date
  }

  // Default to now if we can't parse
  return now
}

/**
 * Formats a date into a localized date string.
 * Uses toLocaleDateString with appropriate locale for Arabic or English.
 *
 * @param date - Date, timestamp number, ISO string, or date string like "Oct 1, 2024"
 * @param isRTL - Whether the app is in RTL (Arabic) mode
 * @param options - Optional Intl.DateTimeFormatOptions for formatting
 * @returns Localized date string
 */
export function formatLocalizedDate(
  date: Date | number | string,
  isRTL: boolean,
  options?: Intl.DateTimeFormatOptions
): string {
  let dateObj: Date

  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'number') {
    dateObj = new Date(date)
  } else if (typeof date === 'string') {
    // Try parsing ISO format first
    dateObj = new Date(date)

    // If invalid, try parsing common date formats like "Oct 1, 2024"
    if (isNaN(dateObj.getTime())) {
      // Parse month day, year format
      const monthDayYear = date.match(/([A-Za-z]+)\s+(\d+),?\s*(\d{4})/)
      if (monthDayYear) {
        const months: Record<string, number> = {
          jan: 0, january: 0,
          feb: 1, february: 1,
          mar: 2, march: 2,
          apr: 3, april: 3,
          may: 4,
          jun: 5, june: 5,
          jul: 6, july: 6,
          aug: 7, august: 7,
          sep: 8, september: 8,
          oct: 9, october: 9,
          nov: 10, november: 10,
          dec: 11, december: 11
        }
        const monthName = monthDayYear[1].toLowerCase()
        const day = parseInt(monthDayYear[2], 10)
        const year = parseInt(monthDayYear[3], 10)
        const monthNum = months[monthName]
        if (monthNum !== undefined) {
          dateObj = new Date(year, monthNum, day)
        }
      }
    }
  } else {
    dateObj = new Date()
  }

  // If still invalid, return original string if it was a string, otherwise return empty
  if (isNaN(dateObj.getTime())) {
    return typeof date === 'string' ? date : ''
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'gregory'
  }

  const locale = isRTL ? 'ar-SA' : 'en-US'
  return dateObj.toLocaleDateString(locale, options || defaultOptions)
}

/**
 * Formats a date into a short localized date string.
 * Example: "Oct 1, 2024" in English, Arabic equivalent in Arabic
 *
 * @param date - Date, timestamp number, ISO string, or date string
 * @param isRTL - Whether the app is in RTL (Arabic) mode
 * @returns Short localized date string
 */
export function formatLocalizedDateShort(
  date: Date | number | string,
  isRTL: boolean
): string {
  return formatLocalizedDate(date, isRTL, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    calendar: 'gregory'
  })
}

/**
 * Calculates the next occurrence date for a recurring audit.
 * Advances from the due date by the frequency interval until the date is in the future.
 *
 * @param dueDate - The audit's due date as a string (YYYY-MM-DD or parseable date)
 * @param frequency - The audit frequency (annual, semi_annual, quarterly, monthly, ad_hoc)
 * @returns The next occurrence Date, or null for ad_hoc / missing values
 */
export function calculateNextOccurrence(
  dueDate: string,
  frequency: AuditFrequency | undefined
): Date | null {
  if (!dueDate || !frequency || frequency === 'ad_hoc') return null

  const monthsToAdd: Record<string, number> = {
    annual: 12,
    semi_annual: 6,
    quarterly: 3,
    monthly: 1,
  }

  const interval = monthsToAdd[frequency]
  if (!interval) return null

  const base = new Date(dueDate)
  if (isNaN(base.getTime())) return null

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  let next = new Date(base)
  next.setMonth(next.getMonth() + interval)

  while (next < now) {
    next.setMonth(next.getMonth() + interval)
  }

  return next
}

/**
 * Formats a future date as a localized countdown string.
 * Examples: "today", "in 1 day", "in 3 months", "in 1 year, 2 months"
 *
 * @param futureDate - A Date in the future
 * @param t - Translation function supporting interpolation params
 * @returns Localized countdown string
 */
export function formatFutureCountdown(
  futureDate: Date,
  t: (key: TranslationKey, params?: InterpolationParams) => string
): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const target = new Date(futureDate)
  target.setHours(0, 0, 0, 0)

  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return t('auditDetail.nextOccurrenceToday')
  if (diffDays === 1) return t('auditDetail.inOneDay')
  if (diffDays < 30) return t('auditDetail.inDays', { count: String(diffDays) })

  const totalMonths =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth())

  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12

  if (years === 0) {
    if (months === 1) return t('auditDetail.inOneMonth')
    return t('auditDetail.inMonths', { count: String(months) })
  }

  if (months === 0) {
    if (years === 1) return t('auditDetail.inOneYear')
    return t('auditDetail.inYears', { count: String(years) })
  }

  if (years === 1) return t('auditDetail.inOneYearAndMonths', { months: String(months) })
  return t('auditDetail.inYearsAndMonths', { years: String(years), months: String(months) })
}
