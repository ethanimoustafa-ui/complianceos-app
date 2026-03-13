import { useCallback } from 'react'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { formatDateWithPreference } from '@/lib/date-format'
import { useTranslation } from '@/i18n'

export function useFormattedDate() {
  const dateFormat = useUserPreferencesStore((s) => s.dateFormat)
  const { language } = useTranslation()

  const formatDate = useCallback(
    (date: string | Date) => formatDateWithPreference(date, dateFormat, language),
    [dateFormat, language]
  )

  return { formatDate, dateFormat }
}
