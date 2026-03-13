'use client'

import { cn } from '@/lib/utils'
import type { CalendarSourceType, UnifiedCalendarItem } from '@/types'
import type { CalendarType } from './calendar-types'
import { formatDateKey, toHijri, isSaudiWeekend, SAUDI_HOLIDAYS, DAYS_SAUDI, SOURCE_COLORS } from './calendar-utils'

interface MonthViewProps {
  currentDate: Date
  itemsByDate: Record<string, UnifiedCalendarItem[]>
  selectedDayKey: string | null
  selectedSourceTypes: Set<CalendarSourceType>
  calendarType: CalendarType
  onSelectDay: (key: string) => void
}

export function MonthView({ currentDate, itemsByDate, selectedDayKey, selectedSourceTypes, calendarType, onSelectDay }: MonthViewProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const startOffset = (firstDay.getDay() + 1) % 7
  const days: (Date | null)[] = []

  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i))

  return (
    <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm m-6">
      {DAYS_SAUDI.map((d, i) => (
        <div
          key={d}
          className={cn(
            "bg-slate-50 py-3 text-center text-[10px] font-black uppercase tracking-widest",
            (i === 0 || i === 6) ? "text-emerald-600 bg-emerald-50/50" : "text-slate-400"
          )}
        >
          {d}
        </div>
      ))}

      {days.map((date, idx) => {
        if (!date) return <div key={idx} className="bg-slate-50/50 min-h-[140px]" />

        const key = formatDateKey(date)
        const allItems = itemsByDate[key] || []
        const filteredItems = allItems.filter(item => selectedSourceTypes.has(item.sourceType))
        const isSelected = key === selectedDayKey
        const isWeekend = isSaudiWeekend(date)
        const holiday = SAUDI_HOLIDAYS[key]
        const hijri = toHijri(date)

        const hasCritical = filteredItems.some(i => i.priority === 'critical')
        const hasItems = filteredItems.length > 0

        let heatmapClass = ''
        if (hasItems) {
          if (hasCritical) heatmapClass = 'heatmap-critical'
          else heatmapClass = 'heatmap-pending'
        }

        // Get unique source types present
        const presentSources = new Set(filteredItems.map(i => i.sourceType))

        return (
          <div
            key={idx}
            onClick={() => onSelectDay(key)}
            className={cn(
              'min-h-[140px] p-4 border-r border-b border-slate-100 flex flex-col cursor-pointer transition-all hover:bg-slate-50 relative group',
              isWeekend ? 'bg-slate-100/70' : 'bg-white',
              heatmapClass,
              isSelected && 'day-card-selected'
            )}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                {calendarType === 'gregorian' ? (
                  <>
                    <span className="text-sm font-bold">{date.getDate()}</span>
                    <span className="text-[9px] text-slate-400 font-medium">{hijri.day}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold">{hijri.day}</span>
                    <span className="text-[9px] text-slate-400 font-medium">{date.getDate()}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {holiday && (
                  <div className="group/holiday relative">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="absolute right-0 top-4 hidden group-hover/holiday:block bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {holiday}
                    </div>
                  </div>
                )}
                {/* Source type dots */}
                {Array.from(presentSources).slice(0, 3).map(src => (
                  <div key={src} className={cn('w-1.5 h-1.5 rounded-full', SOURCE_COLORS[src].dot)} />
                ))}
              </div>
            </div>

            {holiday && <span className="text-[8px] font-bold text-red-600 mt-1">{holiday}</span>}

            {/* Show first 2 items */}
            {filteredItems.slice(0, 2).map(item => (
              <div key={item.id} className="mt-1.5 bg-white/80 p-1.5 rounded-lg border border-slate-200/50 shadow-sm">
                <p className="text-[10px] font-bold text-slate-700 truncate">{item.title}</p>
                <span className={cn('inline-block mt-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white', SOURCE_COLORS[item.sourceType].badge)}>
                  {item.sourceType.split('-')[0]}
                </span>
              </div>
            ))}

            {filteredItems.length > 2 && (
              <span className="text-[9px] font-bold text-slate-400 mt-1">+{filteredItems.length - 2} more</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
