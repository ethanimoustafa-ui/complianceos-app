import type { DateFormatPreference } from '@/types'

export function formatDateWithPreference(
  date: string | Date,
  format: DateFormatPreference,
  locale?: string
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : ''

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()

  if (locale === 'ar') {
    const arabicNumerals = (s: string) =>
      s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])

    switch (format) {
      case 'DD/MM/YYYY':
        return arabicNumerals(`${day}/${month}/${year}`)
      case 'MM/DD/YYYY':
        return arabicNumerals(`${month}/${day}/${year}`)
      case 'YYYY-MM-DD':
        return arabicNumerals(`${year}-${month}-${day}`)
    }
  }

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`
  }
}
