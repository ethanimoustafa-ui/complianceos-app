'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { CalendarSourceType, UnifiedCalendarItem } from '@/types'
import type { CalendarType } from './calendar-types'
import { getDueStatus, getHijriMonthsFull, toHijri, SOURCE_COLORS, SOURCE_LABEL_KEYS, PRIORITY_COLORS } from './calendar-utils'

interface SubmissionsListProps {
  items: UnifiedCalendarItem[]
  selectedSourceTypes: Set<CalendarSourceType>
  showCompleted: boolean
  filterMonth: number
  filterYear: number
  filterDate: string | null
  groupBy: 'date' | 'month' | 'year'
  calendarType: CalendarType
  onSelectDay: (dateKey: string) => void
}

export function SubmissionsList({
  items,
  selectedSourceTypes,
  showCompleted,
  filterMonth,
  filterYear,
  filterDate,
  groupBy,
  calendarType,
  onSelectDay,
}: SubmissionsListProps) {
  const { t, isRTL } = useTranslation()
  const router = useRouter()

  // Filter items
  const filteredItems = items.filter(item => {
    if (!selectedSourceTypes.has(item.sourceType)) return false
    if (!showCompleted && (item.status === 'completed' || item.status === 'closed')) return false

    if (filterDate) {
      return item.date === filterDate
    }
    if (groupBy === 'date') {
      const d = new Date(item.date)
      return d.getMonth() === filterMonth && d.getFullYear() === filterYear
    }
    return true
  })

  filteredItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Group
  const grouped: Record<string, UnifiedCalendarItem[]> = {}
  for (const item of filteredItems) {
    let groupKey: string
    const d = new Date(item.date)
    if (groupBy === 'date') groupKey = item.date
    else if (groupBy === 'month') groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    else groupKey = `${d.getFullYear()}`
    if (!grouped[groupKey]) grouped[groupKey] = []
    grouped[groupKey].push(item)
  }

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
          <Icon icon="lucide:check-circle" className="text-5xl text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{t('calendar.noEventsForDay')}</h3>
        <p className="text-sm text-slate-500 text-center">
          {showCompleted ? 'No events found.' : 'No pending events found.'}
        </p>
      </div>
    )
  }

  const getGroupHeader = (key: string): { main: string; sub?: string } => {
    const dateLocale = isRTL ? 'ar-SA' : 'en-US'
    if (groupBy === 'date') {
      const dateObj = new Date(key)
      if (calendarType === 'hijri') {
        const h = toHijri(dateObj)
        return { main: `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`, sub: dateObj.toLocaleDateString(dateLocale, { weekday: 'long', calendar: 'gregory' }) }
      }
      return { main: dateObj.toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric', calendar: 'gregory' }), sub: dateObj.toLocaleDateString(dateLocale, { weekday: 'long', calendar: 'gregory' }) }
    } else if (groupBy === 'month') {
      const [year, month] = key.split('-')
      if (calendarType === 'hijri') {
        const h = toHijri(new Date(parseInt(year), parseInt(month) - 1, 15))
        return { main: `${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ` }
      }
      return { main: new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric', calendar: 'gregory' }) }
    } else {
      if (calendarType === 'hijri') {
        const h = toHijri(new Date(parseInt(key), 6, 1))
        return { main: `${h.year} هـ` }
      }
      return { main: key }
    }
  }

  return (
    <div className="p-6 pt-0 space-y-6">
      {Object.keys(grouped).sort().map(groupKey => {
        const groupItems = grouped[groupKey]
        const header = getGroupHeader(groupKey)

        return (
          <div key={groupKey}>
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900">{header.main}</h3>
                {header.sub && <span className="text-xs font-bold text-slate-400 uppercase">{header.sub}</span>}
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {groupItems.length} {groupItems.length === 1 ? t('calendar.taskSingular') : t('calendar.taskPlural')}
                </span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {groupItems.map(item => {
                const colors = SOURCE_COLORS[item.sourceType]
                const dueStatus = getDueStatus(item.date, t)
                const priorityColor = item.priority ? PRIORITY_COLORS[item.priority] : ''
                const labelKey = SOURCE_LABEL_KEYS[item.sourceType] as TranslationKey
                const isCompleted = item.status === 'completed' || item.status === 'closed'

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectDay(item.date)}
                    className={cn(
                      'task-row bg-white border-l-4 border border-slate-200 rounded-xl p-4 cursor-pointer flex items-center gap-4 transition-all hover:bg-slate-50 hover:translate-x-1 hover:shadow-md',
                      colors.border,
                      isCompleted && 'opacity-60 bg-slate-50'
                    )}
                  >
                    {/* Source badge */}
                    <div className="flex items-center gap-3">
                      <div className={cn('w-3 h-3 rounded-full', isCompleted ? 'bg-emerald-500' : colors.dot)} />
                      <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded text-white', isCompleted ? 'bg-emerald-500' : colors.badge)}>
                        {isCompleted ? t('common.completed') : t(labelKey)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className={cn('text-sm font-bold text-slate-900 truncate mb-0.5', isCompleted && 'line-through')}>{item.title}</h4>
                      {item.subtitle && <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>}
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 shrink-0">
                      {item.priority && (
                        <span className={cn('text-[9px] font-black uppercase px-2 py-1 rounded', priorityColor)}>
                          {item.priority}
                        </span>
                      )}
                      <span className={cn('text-[10px] font-bold px-2 py-1 rounded', dueStatus.className)}>
                        {dueStatus.text}
                      </span>
                      {item.route && (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(item.route) }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer"
                          title={t('calendar.goToSource')}
                        >
                          <Icon icon="lucide:external-link" className="text-sm" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
