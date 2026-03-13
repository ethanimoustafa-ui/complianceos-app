import type { TranslationKey } from '@/i18n'
import type { CalendarSourceType } from '@/types'

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toHijri(date: Date): { year: number; month: number; day: number } {
  const utcTime = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const jd = Math.floor((utcTime / 86400000) + 2440588)
  const l = jd - 1948440 + 10632
  const n = Math.floor((l - 1) / 10631)
  const l2 = l - 10631 * n + 354
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238)
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29
  const month = Math.floor((24 * l3) / 709)
  const day = l3 - Math.floor((709 * month) / 24)
  const year = 30 * n + j - 30
  return { year, month, day }
}

export function isSaudiWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 5 || day === 6
}

export const SAUDI_HOLIDAYS: Record<string, string> = {
  // 2024
  '2024-02-22': 'Founding Day',
  '2024-09-23': 'National Day',
  '2024-04-10': 'Eid al-Fitr',
  '2024-04-11': 'Eid al-Fitr',
  '2024-04-12': 'Eid al-Fitr',
  '2024-06-16': 'Eid al-Adha',
  '2024-06-17': 'Eid al-Adha',
  '2024-06-18': 'Eid al-Adha',
  '2024-06-19': 'Eid al-Adha',
  // 2025
  '2025-02-22': 'Founding Day',
  '2025-09-23': 'National Day',
  '2025-03-30': 'Eid al-Fitr',
  '2025-03-31': 'Eid al-Fitr',
  '2025-04-01': 'Eid al-Fitr',
  '2025-06-06': 'Eid al-Adha',
  '2025-06-07': 'Eid al-Adha',
  '2025-06-08': 'Eid al-Adha',
  '2025-06-09': 'Eid al-Adha',
  // 2026
  '2026-02-22': 'Founding Day',
  '2026-09-23': 'National Day',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-21': 'Eid al-Fitr',
  '2026-03-22': 'Eid al-Fitr',
  '2026-05-27': 'Eid al-Adha',
  '2026-05-28': 'Eid al-Adha',
  '2026-05-29': 'Eid al-Adha',
  '2026-05-30': 'Eid al-Adha',
}

export function getDueStatus(dateKey: string, t?: (key: TranslationKey) => string): { text: string; className: string } {
  const taskDate = new Date(dateKey)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  taskDate.setHours(0, 0, 0, 0)

  const diffTime = taskDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const text = t ? t('calendar.daysOverdue' as TranslationKey).replace('{days}', String(Math.abs(diffDays))) : `${Math.abs(diffDays)}d overdue`
    return { text, className: 'text-red-600 bg-red-50' }
  }
  if (diffDays === 0) {
    const text = t ? t('calendar.dueToday' as TranslationKey) : 'Due today'
    return { text, className: 'text-orange-600 bg-orange-50' }
  }
  if (diffDays === 1) {
    const text = t ? t('calendar.dueTomorrow' as TranslationKey) : 'Due tomorrow'
    return { text, className: 'text-amber-600 bg-amber-50' }
  }
  const text = t ? t('calendar.dueInDays' as TranslationKey).replace('{days}', String(diffDays)) : `Due in ${diffDays}d`
  if (diffDays <= 7) return { text, className: 'text-slate-600 bg-slate-50' }
  return { text, className: 'text-slate-500 bg-slate-50' }
}

export function getMonthsShort(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.monthsShort.jan' as TranslationKey), t('calendar.monthsShort.feb' as TranslationKey), t('calendar.monthsShort.mar' as TranslationKey),
    t('calendar.monthsShort.apr' as TranslationKey), t('calendar.monthsShort.may' as TranslationKey), t('calendar.monthsShort.jun' as TranslationKey),
    t('calendar.monthsShort.jul' as TranslationKey), t('calendar.monthsShort.aug' as TranslationKey), t('calendar.monthsShort.sep' as TranslationKey),
    t('calendar.monthsShort.oct' as TranslationKey), t('calendar.monthsShort.nov' as TranslationKey), t('calendar.monthsShort.dec' as TranslationKey),
  ]
}

export function getMonthsFull(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.monthsFull.january' as TranslationKey), t('calendar.monthsFull.february' as TranslationKey), t('calendar.monthsFull.march' as TranslationKey),
    t('calendar.monthsFull.april' as TranslationKey), t('calendar.monthsFull.may' as TranslationKey), t('calendar.monthsFull.june' as TranslationKey),
    t('calendar.monthsFull.july' as TranslationKey), t('calendar.monthsFull.august' as TranslationKey), t('calendar.monthsFull.september' as TranslationKey),
    t('calendar.monthsFull.october' as TranslationKey), t('calendar.monthsFull.november' as TranslationKey), t('calendar.monthsFull.december' as TranslationKey),
  ]
}

export function getHijriMonthsShort(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.hijriMonthsShort.muharram' as TranslationKey), t('calendar.hijriMonthsShort.safar' as TranslationKey),
    t('calendar.hijriMonthsShort.rabiAwwal' as TranslationKey), t('calendar.hijriMonthsShort.rabiThani' as TranslationKey),
    t('calendar.hijriMonthsShort.jumadaAwwal' as TranslationKey), t('calendar.hijriMonthsShort.jumadaThani' as TranslationKey),
    t('calendar.hijriMonthsShort.rajab' as TranslationKey), t('calendar.hijriMonthsShort.shaban' as TranslationKey),
    t('calendar.hijriMonthsShort.ramadan' as TranslationKey), t('calendar.hijriMonthsShort.shawwal' as TranslationKey),
    t('calendar.hijriMonthsShort.dhuQidah' as TranslationKey), t('calendar.hijriMonthsShort.dhuHijjah' as TranslationKey),
  ]
}

export function getHijriMonthsFull(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.hijriMonthsFull.muharram' as TranslationKey), t('calendar.hijriMonthsFull.safar' as TranslationKey),
    t('calendar.hijriMonthsFull.rabiAwwal' as TranslationKey), t('calendar.hijriMonthsFull.rabiThani' as TranslationKey),
    t('calendar.hijriMonthsFull.jumadaAwwal' as TranslationKey), t('calendar.hijriMonthsFull.jumadaThani' as TranslationKey),
    t('calendar.hijriMonthsFull.rajab' as TranslationKey), t('calendar.hijriMonthsFull.shaban' as TranslationKey),
    t('calendar.hijriMonthsFull.ramadan' as TranslationKey), t('calendar.hijriMonthsFull.shawwal' as TranslationKey),
    t('calendar.hijriMonthsFull.dhuQidah' as TranslationKey), t('calendar.hijriMonthsFull.dhuHijjah' as TranslationKey),
  ]
}

export const DAYS_SAUDI = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export const SOURCE_COLORS: Record<CalendarSourceType, { bg: string; border: string; badge: string; text: string; dot: string }> = {
  audit:          { bg: 'bg-emerald-50', border: 'border-emerald-300', badge: 'bg-emerald-500', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  observation:    { bg: 'bg-rose-50',    border: 'border-rose-300',    badge: 'bg-rose-500',    text: 'text-rose-600',    dot: 'bg-rose-500' },
  policy:         { bg: 'bg-blue-50',    border: 'border-blue-300',    badge: 'bg-blue-500',    text: 'text-blue-600',    dot: 'bg-blue-500' },
  'sama-letter':  { bg: 'bg-amber-50',   border: 'border-amber-300',   badge: 'bg-amber-500',   text: 'text-amber-600',   dot: 'bg-amber-500' },
  circular:       { bg: 'bg-violet-50',  border: 'border-violet-300',  badge: 'bg-violet-500',  text: 'text-violet-600',  dot: 'bg-violet-500' },
  training:       { bg: 'bg-cyan-50',    border: 'border-cyan-300',    badge: 'bg-cyan-500',    text: 'text-cyan-600',    dot: 'bg-cyan-500' },
  correspondence: { bg: 'bg-slate-100',  border: 'border-slate-300',   badge: 'bg-slate-500',   text: 'text-slate-600',   dot: 'bg-slate-500' },
  advisory:       { bg: 'bg-indigo-50',  border: 'border-indigo-300',  badge: 'bg-indigo-500',  text: 'text-indigo-600',  dot: 'bg-indigo-500' },
  risk:           { bg: 'bg-orange-50',  border: 'border-orange-300',  badge: 'bg-orange-500',  text: 'text-orange-600',  dot: 'bg-orange-500' },
  'user-event':   { bg: 'bg-teal-50',   border: 'border-teal-300',    badge: 'bg-teal-500',    text: 'text-teal-600',    dot: 'bg-teal-500' },
}

export const SOURCE_LABEL_KEYS: Record<CalendarSourceType, string> = {
  audit:          'calendar.sourceAudit',
  observation:    'calendar.sourceObservation',
  policy:         'calendar.sourcePolicy',
  'sama-letter':  'calendar.sourceSamaLetter',
  circular:       'calendar.sourceCircular',
  training:       'calendar.sourceTraining',
  correspondence: 'calendar.sourceCorrespondence',
  advisory:       'calendar.sourceAdvisory',
  risk:           'calendar.sourceRisk',
  'user-event':   'calendar.sourceUserEvent',
}

export const ALL_SOURCE_TYPES: CalendarSourceType[] = [
  'audit', 'observation', 'policy', 'sama-letter', 'circular',
  'training', 'correspondence', 'advisory', 'risk', 'user-event',
]

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-slate-400 text-white',
  standard: 'bg-slate-300 text-white',
}
