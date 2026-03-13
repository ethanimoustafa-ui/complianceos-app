'use client'

import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { CalendarSourceType } from '@/types'
import type { ViewMode, CalendarType } from './calendar-types'
import { getMonthsFull, getHijriMonthsFull, toHijri, SOURCE_COLORS, SOURCE_LABEL_KEYS, ALL_SOURCE_TYPES } from './calendar-utils'

interface CalendarHeaderProps {
  viewMode: ViewMode
  currentDate: Date
  calendarType: CalendarType
  selectedSourceTypes: Set<CalendarSourceType>
  submissionGroupBy: 'date' | 'month' | 'year'
  showCompleted: boolean
  submissionFilterDate: string | null
  onChangeView: (view: ViewMode) => void
  onNavigate: (offset: number) => void
  onNavigateToday: () => void
  onOpenPicker: () => void
  onToggleCalendarType: () => void
  onToggleSourceType: (type: CalendarSourceType) => void
  onToggleAllSourceTypes: () => void
  onSetSubmissionGroupBy: (groupBy: 'date' | 'month' | 'year') => void
  onToggleShowCompleted: () => void
  onClearSubmissionFilter: () => void
  onCreateEvent: () => void
}

export function CalendarHeader({
  viewMode,
  currentDate,
  calendarType,
  selectedSourceTypes,
  submissionGroupBy,
  showCompleted,
  submissionFilterDate,
  onChangeView,
  onNavigate,
  onNavigateToday,
  onOpenPicker,
  onToggleCalendarType,
  onToggleSourceType,
  onToggleAllSourceTypes,
  onSetSubmissionGroupBy,
  onToggleShowCompleted,
  onClearSubmissionFilter,
  onCreateEvent,
}: CalendarHeaderProps) {
  const { t, isRTL } = useTranslation()

  const getDisplayLabel = () => {
    if (calendarType === 'hijri') {
      const hijri = toHijri(currentDate)
      if (viewMode === 'year') return `${hijri.year} هـ`
      return `${getHijriMonthsFull(t)[hijri.month - 1]} ${hijri.year} هـ`
    }
    if (viewMode === 'year') return `${currentDate.getFullYear()}`
    return `${getMonthsFull(t)[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  return (
    <>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold text-slate-900">{t('calendar.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('calendar.subtitle')}</p>
          </div>

          {/* View Toggle */}
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            {viewMode === 'submissions' && (
              <button
                onClick={() => onSetSubmissionGroupBy('date')}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                  submissionGroupBy === 'date' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {t('calendar.dateView')}
              </button>
            )}
            <button
              onClick={() => {
                if (viewMode === 'submissions') onSetSubmissionGroupBy('month')
                else onChangeView('month')
              }}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                viewMode === 'month' || (viewMode === 'submissions' && submissionGroupBy === 'month')
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('calendar.monthView')}
            </button>
            <button
              onClick={() => {
                if (viewMode === 'submissions') onSetSubmissionGroupBy('year')
                else onChangeView('year')
              }}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                viewMode === 'year' || (viewMode === 'submissions' && submissionGroupBy === 'year')
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('calendar.yearView')}
            </button>
          </div>

          {/* All / Submissions Toggle */}
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'mr-3' : 'ml-3'} ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => onChangeView('month')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                viewMode !== 'submissions' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900',
                isRTL && 'flex-row-reverse'
              )}
            >
              <Icon icon="lucide:layout-grid" className="text-sm" />
              {t('calendar.allItems')}
            </button>
            <button
              onClick={() => onChangeView('submissions')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                viewMode === 'submissions' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900',
                isRTL && 'flex-row-reverse'
              )}
            >
              <Icon icon="lucide:list-checks" className="text-sm" />
              {t('calendar.submissions')}
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* Date Navigation */}
          <div className={`flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button onClick={() => onNavigate(-1)} className="p-1.5 hover:bg-slate-50 rounded transition-colors cursor-pointer">
              <Icon icon="lucide:chevron-left" className={cn("text-slate-600", isRTL && "flip-x")} />
            </button>
            <button onClick={onNavigateToday} className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
              {t('calendar.today')}
            </button>
            <button
              onClick={onOpenPicker}
              className="px-4 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors border-x border-slate-100 flex items-center gap-2 cursor-pointer"
            >
              <span>{getDisplayLabel()}</span>
              <Icon icon="lucide:calendar-range" className="text-xl text-emerald-500" />
            </button>
            <button onClick={() => onNavigate(1)} className="p-1.5 hover:bg-slate-50 rounded transition-colors cursor-pointer">
              <Icon icon="lucide:chevron-right" className={cn("text-slate-600", isRTL && "flip-x")} />
            </button>
          </div>

          {/* Submissions view filters */}
          {viewMode === 'submissions' && (
            <>
              <button
                onClick={onToggleShowCompleted}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2',
                  showCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:text-slate-900',
                  isRTL && 'flex-row-reverse'
                )}
              >
                <Icon icon="lucide:check-circle" className="text-sm" />
                {t('calendar.showCompleted')}
              </button>
              {submissionFilterDate && (
                <button
                  onClick={onClearSubmissionFilter}
                  className={cn(
                    'px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-2',
                    isRTL && 'flex-row-reverse'
                  )}
                >
                  <Icon icon="lucide:x" className="text-sm" />
                  {t('calendar.removeFilter')}
                </button>
              )}
            </>
          )}

          <button
            onClick={onCreateEvent}
            className={cn(
              'bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer',
              isRTL && 'flex-row-reverse'
            )}
          >
            <Icon icon="lucide:plus" className="w-5 h-5" />
            {t('calendar.createTask')}
          </button>
        </div>
      </header>

      {/* Source Type Filter Bar */}
      <div className={`flex items-center justify-between p-6 pb-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
          <span className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest ${isRTL ? 'ml-2' : 'mr-2'}`}>
            {t('calendar.filterByType')}:
          </span>
          <button
            onClick={onToggleAllSourceTypes}
            className={cn(
              'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
              selectedSourceTypes.size === ALL_SOURCE_TYPES.length
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            )}
          >
            {t('common.all')}
          </button>
          {ALL_SOURCE_TYPES.map((type) => {
            const isSelected = selectedSourceTypes.has(type)
            const colors = SOURCE_COLORS[type]
            const labelKey = SOURCE_LABEL_KEYS[type] as TranslationKey
            return (
              <button
                key={type}
                onClick={() => onToggleSourceType(type)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer flex items-center gap-1.5',
                  isSelected
                    ? cn(colors.bg, colors.text, colors.border)
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                )}
              >
                {isSelected && <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />}
                {t(labelKey)}
              </button>
            )
          })}
        </div>

        {/* Hijri/Gregorian Toggle */}
        <button
          onClick={onToggleCalendarType}
          className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Icon icon="lucide:calendar" />
          {calendarType === 'gregorian' ? t('calendar.hijriCalendar') : t('calendar.gregorianCalendar')}
        </button>
      </div>
    </>
  )
}
