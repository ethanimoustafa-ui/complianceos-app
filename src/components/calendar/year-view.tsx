'use client'

import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { CalendarSourceType, UnifiedCalendarItem } from '@/types'
import { formatDateKey, getMonthsFull, SOURCE_COLORS } from './calendar-utils'

interface YearViewProps {
  currentDate: Date
  itemsByDate: Record<string, UnifiedCalendarItem[]>
  selectedSourceTypes: Set<CalendarSourceType>
  onSelectMonth: (month: number) => void
}

export function YearView({ currentDate, itemsByDate, selectedSourceTypes, onSelectMonth }: YearViewProps) {
  const { t } = useTranslation()
  const year = currentDate.getFullYear()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 p-6">
      {getMonthsFull(t).map((monthName, m) => {
        const daysInMonth = new Date(year, m + 1, 0).getDate()
        const startOffset = (new Date(year, m, 1).getDay() + 6) % 7

        return (
          <div
            key={monthName}
            onClick={() => onSelectMonth(m)}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer"
          >
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-3">{monthName}</h4>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="text-[8px] font-bold text-slate-300">{d}</span>
              ))}
              {Array.from({ length: startOffset }).map((_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, d) => {
                const dayKey = formatDateKey(new Date(year, m, d + 1))
                const dayItems = itemsByDate[dayKey] || []
                const filteredItems = dayItems.filter(item => selectedSourceTypes.has(item.sourceType))
                const topSource = filteredItems[0]?.sourceType

                return (
                  <span
                    key={d}
                    className={cn(
                      'text-[9px] font-medium p-0.5',
                      filteredItems.length > 0 && topSource
                        ? cn(SOURCE_COLORS[topSource].badge, 'text-white rounded-full')
                        : 'text-slate-600'
                    )}
                  >
                    {d + 1}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
