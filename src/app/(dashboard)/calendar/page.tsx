'use client'

import { useState, useCallback, useMemo } from 'react'
import type { CalendarSourceType, CalendarEvent } from '@/types'
import type { ViewMode, CalendarType } from '@/components/calendar/calendar-types'
import { ALL_SOURCE_TYPES } from '@/components/calendar/calendar-utils'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useTranslation } from '@/i18n'
import { CalendarHeader } from '@/components/calendar/calendar-header'
import { MonthView } from '@/components/calendar/month-view'
import { YearView } from '@/components/calendar/year-view'
import { SubmissionsList } from '@/components/calendar/submissions-list'
import { EventDrawer } from '@/components/calendar/event-drawer'
import { DatePickerModal } from '@/components/calendar/date-picker-modal'
import { CreateEventModal } from '@/components/calendar/create-event-modal'
import { EditEventModal } from '@/components/calendar/edit-event-modal'
import { ToastHost } from '@/components/ui/toast-host'

export default function CalendarPage() {
  const { t, isRTL } = useTranslation()
  const { items, itemsByDate } = useCalendarEvents()

  // View state
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [calendarType, setCalendarType] = useState<CalendarType>('gregorian')
  const [selectedSourceTypes, setSelectedSourceTypes] = useState<Set<CalendarSourceType>>(
    () => new Set(ALL_SOURCE_TYPES)
  )

  // Completion filter — drives every view (month/year/submissions/drawer).
  // 'due' = not-yet-done, 'completed' = crossed-out done items, 'all' = both.
  const [completionFilter, setCompletionFilter] = useState<'all' | 'due' | 'completed'>('all')

  // Submissions filter state
  const [submissionFilterDate, setSubmissionFilterDate] = useState<string | null>(null)
  const [submissionGroupBy, setSubmissionGroupBy] = useState<'date' | 'month' | 'year'>('date')

  // Apply the completion filter once, here, so all views stay consistent.
  const visibleItems = useMemo(() => {
    if (completionFilter === 'all') return items
    return items.filter((i) => (completionFilter === 'completed' ? i.done : !i.done))
  }, [items, completionFilter])
  const visibleItemsByDate = useMemo(() => {
    const map: Record<string, typeof items> = {}
    for (const i of visibleItems) {
      if (!map[i.date]) map[i.date] = []
      map[i.date].push(i)
    }
    return map
  }, [visibleItems])

  // Modal state
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState(() => new Date())
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  // W43: the EditEventModal existed but nothing ever opened it — create was
  // the only mutation reachable from the UI.
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  // Navigation
  const navigateDate = useCallback((offset: number) => {
    setCurrentDate(prev => {
      if (viewMode === 'year') return new Date(prev.getFullYear() + offset, prev.getMonth(), 1)
      return new Date(prev.getFullYear(), prev.getMonth() + offset, 1)
    })
  }, [viewMode])

  const navigateToday = useCallback(() => setCurrentDate(new Date()), [])

  const changeView = useCallback((view: ViewMode) => setViewMode(view), [])

  const selectDay = useCallback((key: string) => setSelectedDayKey(key), [])

  const closeDrawer = useCallback(() => setSelectedDayKey(null), [])

  const toggleSourceType = useCallback((type: CalendarSourceType) => {
    setSelectedSourceTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const toggleAllSourceTypes = useCallback(() => {
    setSelectedSourceTypes(prev =>
      prev.size === ALL_SOURCE_TYPES.length ? new Set() : new Set(ALL_SOURCE_TYPES)
    )
  }, [])

  const toggleCalendarType = useCallback(() => {
    setCalendarType(prev => prev === 'gregorian' ? 'hijri' : 'gregorian')
  }, [])

  return (
    <div className="flex-1 flex overflow-hidden">
      <main className="flex-1 flex flex-col overflow-hidden">
        <CalendarHeader
          viewMode={viewMode}
          currentDate={currentDate}
          calendarType={calendarType}
          selectedSourceTypes={selectedSourceTypes}
          submissionGroupBy={submissionGroupBy}
          completionFilter={completionFilter}
          submissionFilterDate={submissionFilterDate}
          onChangeView={changeView}
          onNavigate={navigateDate}
          onNavigateToday={navigateToday}
          onOpenPicker={() => { setPickerDate(new Date(currentDate)); setIsPickerOpen(true) }}
          onToggleCalendarType={toggleCalendarType}
          onToggleSourceType={toggleSourceType}
          onToggleAllSourceTypes={toggleAllSourceTypes}
          onSetSubmissionGroupBy={setSubmissionGroupBy}
          onSetCompletionFilter={setCompletionFilter}
          onClearSubmissionFilter={() => setSubmissionFilterDate(null)}
          onCreateEvent={() => setIsCreateModalOpen(true)}
        />

        <div className="flex-1 overflow-auto bg-slate-50 hide-scrollbar">
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              itemsByDate={visibleItemsByDate}
              selectedDayKey={selectedDayKey}
              selectedSourceTypes={selectedSourceTypes}
              calendarType={calendarType}
              onSelectDay={selectDay}
            />
          )}
          {viewMode === 'year' && (
            <YearView
              currentDate={currentDate}
              itemsByDate={visibleItemsByDate}
              selectedSourceTypes={selectedSourceTypes}
              onSelectMonth={(month) => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setViewMode('month') }}
            />
          )}
          {viewMode === 'submissions' && (
            <SubmissionsList
              items={visibleItems}
              selectedSourceTypes={selectedSourceTypes}
              showCompleted={true}
              filterMonth={currentDate.getMonth()}
              filterYear={currentDate.getFullYear()}
              filterDate={submissionFilterDate}
              groupBy={submissionGroupBy}
              calendarType={calendarType}
              onSelectDay={selectDay}
            />
          )}
        </div>
      </main>

      <EventDrawer
        selectedDayKey={selectedDayKey}
        items={visibleItems}
        calendarType={calendarType}
        onClose={closeDrawer}
        onEditEvent={setEditingEvent}
      />

      {isPickerOpen && (
        <DatePickerModal
          currentDate={pickerDate}
          onClose={() => setIsPickerOpen(false)}
          onSelectMonth={(month) => {
            const newDate = new Date(pickerDate.getFullYear(), month, 1)
            setPickerDate(newDate)
            setCurrentDate(newDate)
            setIsPickerOpen(false)
          }}
          onSelectYear={(year) => setPickerDate(new Date(year, pickerDate.getMonth(), 1))}
          onOpenMonthView={() => { setViewMode('month'); setIsPickerOpen(false) }}
          onOpenYearView={() => { setViewMode('year'); setIsPickerOpen(false) }}
          viewMode={viewMode}
          onSelectDay={(dateKey) => { setSubmissionFilterDate(dateKey); setIsPickerOpen(false) }}
          selectedDate={submissionFilterDate}
          onClearFilter={() => setSubmissionFilterDate(null)}
          calendarType={calendarType}
          t={t}
          isRTL={isRTL}
        />
      )}

      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(dateKey) => selectDay(dateKey)}
      />

      <EditEventModal
        isOpen={editingEvent !== null}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSuccess={(updated) => {
          setEditingEvent(null)
          // Keep the drawer on the (possibly new) date of the edited event.
          if (updated.date) selectDay(updated.date.substring(0, 10))
        }}
      />

      {/* Surfaces calendar mutation/rollback errors as toasts (see EventDrawer). */}
      <ToastHost />
    </div>
  )
}
