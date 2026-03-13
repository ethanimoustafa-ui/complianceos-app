'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/i18n'
import type { ViewMode, CalendarType } from './calendar-types'
import { formatDateKey, toHijri, getMonthsShort, getHijriMonthsShort, getHijriMonthsFull } from './calendar-utils'

interface DatePickerModalProps {
  currentDate: Date
  onClose: () => void
  onSelectMonth: (month: number) => void
  onSelectYear: (year: number) => void
  onOpenMonthView: () => void
  onOpenYearView: () => void
  viewMode: ViewMode
  onSelectDay?: (dateKey: string) => void
  selectedDate?: string | null
  onClearFilter?: () => void
  calendarType: CalendarType
  t: (key: TranslationKey) => string
  isRTL: boolean
}

export function DatePickerModal({
  currentDate, onClose, onSelectMonth, onSelectYear, onOpenYearView,
  viewMode, onSelectDay, selectedDate, onClearFilter, calendarType, t, isRTL,
}: DatePickerModalProps) {
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()
  const [showDayPicker, setShowDayPicker] = useState(false)

  const radius = 120

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in">
        {/* Month Dial */}
        <div className="p-12 border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-10">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('calendar.monthSelector')}</h3>
          <div className="relative w-[320px] h-[320px] flex items-center justify-center">
            <div className="absolute w-24 h-24 bg-white rounded-full shadow-2xl flex flex-col items-center justify-center z-10 border-4 border-emerald-500">
              <span className="text-lg font-bold text-slate-900">
                {calendarType === 'hijri'
                  ? getHijriMonthsShort(t)[toHijri(currentDate).month - 1]
                  : getMonthsShort(t)[currentMonth]}
              </span>
              <span className="text-[8px] font-black text-emerald-600 tracking-widest uppercase">{t('calendar.active')}</span>
            </div>

            {(calendarType === 'hijri' ? getHijriMonthsShort(t) : getMonthsShort(t)).map((m, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180)
              const x = Math.cos(angle) * radius
              const y = Math.sin(angle) * radius
              const isActive = calendarType === 'hijri' ? i === toHijri(currentDate).month - 1 : i === currentMonth

              return (
                <button
                  key={m}
                  onClick={() => onSelectMonth(i)}
                  className={cn(
                    'absolute w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer',
                    isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white text-slate-600 hover:bg-emerald-50'
                  )}
                  style={{ left: `calc(50% + ${x}px - 24px)`, top: `calc(50% + ${y}px - 24px)` }}
                >
                  {m}
                </button>
              )
            })}

            {/* Day picker overlay */}
            {showDayPicker && (
              <div className="absolute inset-0 bg-white rounded-xl p-4 border border-slate-200 shadow-lg z-20 flex flex-col">
                {selectedDate && (
                  <div className="text-center text-xs text-emerald-600 font-bold mb-2">
                    Filtered: {calendarType === 'hijri'
                      ? (() => {
                          const [y, m, d] = selectedDate.split('-').map(Number)
                          const h = toHijri(new Date(y, m - 1, d))
                          return `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`
                        })()
                      : new Date(selectedDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', calendar: 'gregory' })
                    }
                  </div>
                )}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <span key={i} className="text-center text-[10px] text-slate-400 font-bold">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 flex-1 content-start">
                  {Array.from({ length: (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: new Date(currentYear, currentMonth + 1, 0).getDate() }).map((_, d) => {
                    const day = d + 1
                    const dateKey = formatDateKey(new Date(currentYear, currentMonth, day))
                    const isSelected = dateKey === selectedDate
                    return (
                      <button
                        key={day}
                        onClick={() => onSelectDay?.(dateKey)}
                        className={cn(
                          'w-9 h-9 rounded-full text-sm font-medium transition-colors cursor-pointer flex items-center justify-center',
                          isSelected ? 'bg-emerald-500 text-white' : 'hover:bg-emerald-100 hover:text-emerald-700'
                        )}
                      >
                        {calendarType === 'hijri' ? toHijri(new Date(currentYear, currentMonth, day)).day : day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {viewMode === 'submissions' ? (
            <div className="w-full flex items-center gap-2">
              <button
                onClick={() => setShowDayPicker(!showDayPicker)}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon icon="lucide:calendar-days" /> {showDayPicker ? t('calendar.hideDatePicker') : t('calendar.openDatePicker')}
              </button>
              {selectedDate && (
                <button
                  onClick={onClearFilter}
                  className="p-3 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors cursor-pointer"
                  title="Clear day filter"
                >
                  <Icon icon="lucide:x" className="text-lg" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowDayPicker(!showDayPicker)}
              className="w-full px-6 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon icon="lucide:calendar-days" /> {showDayPicker ? t('calendar.hideCalendar') : t('calendar.openCalendar')}
            </button>
          )}
        </div>

        {/* Year Selection */}
        <div className="flex-1 p-10 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('calendar.yearSelection')}</h3>
              <p className="text-[10px] text-slate-500">
                {calendarType === 'hijri' ? t('calendar.browseArchivesHijri') : t('calendar.browseArchivesGregorian')}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-full cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar grid grid-cols-5 gap-3 pr-6">
            {calendarType === 'hijri' ? (
              Array.from({ length: 12 }).map((_, decadeIdx) => {
                const decade = 1420 + decadeIdx * 10
                const currentHijriYear = toHijri(currentDate).year
                return (
                  <div key={decade} className="contents">
                    <div className="col-span-5 pt-4 pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {decade}s هـ
                    </div>
                    {Array.from({ length: Math.min(10, 1531 - decade) }).map((_, yIdx) => {
                      const y = decade + yIdx
                      const isActive = y === currentHijriYear
                      return (
                        <button key={y} onClick={() => onSelectYear(y)}
                          className={cn('py-3 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            isActive ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 scale-105' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          )}>
                          {y}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            ) : (
              Array.from({ length: 11 }).map((_, decadeIdx) => {
                const decade = 2000 + decadeIdx * 10
                return (
                  <div key={decade} className="contents">
                    <div className="col-span-5 pt-4 pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {decade}s
                    </div>
                    {Array.from({ length: Math.min(10, 2101 - decade) }).map((_, yIdx) => {
                      const y = decade + yIdx
                      const isActive = y === currentYear
                      return (
                        <button key={y} onClick={() => onSelectYear(y)}
                          className={cn('py-3 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            isActive ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 scale-105' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          )}>
                          {y}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center shrink-0">
            <div className="flex gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> {t('calendar.selectedYear')}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <div className="w-2 h-2 rounded-full bg-slate-200" /> {t('calendar.available')}
              </span>
            </div>
            <button onClick={onOpenYearView} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">
              {t('calendar.switchToFullYearView')} {isRTL ? '\u2190' : '\u2192'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
