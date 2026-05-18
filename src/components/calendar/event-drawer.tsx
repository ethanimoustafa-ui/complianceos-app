'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { CalendarEvent, UnifiedCalendarItem } from '@/types'
import type { CalendarType } from './calendar-types'
import { toHijri, getHijriMonthsFull, getDueStatus, SOURCE_COLORS, SOURCE_LABEL_KEYS, PRIORITY_COLORS } from './calendar-utils'
import { useCalendarStore } from '@/stores/calendar-store'
import { LoadingButton } from '@/components/ui/loading-button'
import { Modal } from '@/components/ui/modal'
import { formatTimelineDate } from '@/lib/format-date'

function exportItemsToCsv(items: UnifiedCalendarItem[], dateLabel: string) {
  const headers = ['Title', 'Source Type', 'Date', 'Status', 'Priority', 'Subtitle', 'Assignee', 'Route']
  const rows = items.map(item => [
    item.title,
    item.sourceType,
    item.date,
    item.status,
    item.priority || '',
    item.subtitle || '',
    item.assignee || '',
    item.route || '',
  ])
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `calendar-report-${dateLabel}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

interface EventDrawerProps {
  selectedDayKey: string | null
  items: UnifiedCalendarItem[]
  calendarType: CalendarType
  onClose: () => void
}

export function EventDrawer({ selectedDayKey, items, calendarType, onClose }: EventDrawerProps) {
  const { t, isRTL } = useTranslation()
  const router = useRouter()
  const calendarEvents = useCalendarStore((s) => s.events)
  const calendarById = useCalendarStore((s) => s.byId)
  const updateEvent = useCalendarStore((s) => s.updateEvent)
  // Delete is optimistic: the store removes the row locally + fires the
  // DELETE request, rolling back if it fails. We surface failures via a
  // simple alert() because the EventDrawer has no toast slot of its own.
  const deleteEvent = useCalendarStore((s) => s.deleteEvent)
  const isMutating = useCalendarStore((s) => s.isMutating)
  const calendarError = useCalendarStore((s) => s.error)
  const clearCalendarError = useCalendarStore((s) => s.clearError)

  // Strong delete confirmation — circular/policy parity. We hold the user-event
  // id that's pending confirmation so the user can't accidentally hit the
  // trash icon and lose attendees/reminders/attachments in one click.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const pendingDeleteEvent: CalendarEvent | null = confirmDeleteId
    ? (calendarById[confirmDeleteId] ?? calendarEvents.find((e) => e.id === confirmDeleteId) ?? null)
    : null

  const dayItems = useMemo(() => {
    if (!selectedDayKey) return []
    return items.filter(i => i.date === selectedDayKey)
  }, [items, selectedDayKey])

  // Surface calendar-store errors (e.g. failed DELETE after optimistic remove)
  // as a quick alert and clear the flag so the next failure surfaces too.
  useEffect(() => {
    if (calendarError) {
      // eslint-disable-next-line no-alert
      alert(calendarError)
      clearCalendarError()
    }
  }, [calendarError, clearCalendarError])

  const stats = useMemo(() => {
    const total = dayItems.length
    const completed = dayItems.filter(i => i.status === 'completed' || i.status === 'closed').length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { rate, done: completed, total }
  }, [dayItems])

  return (
    <aside className={cn(
      `bg-white ${isRTL ? 'border-r' : 'border-l'} border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden`,
      selectedDayKey ? "w-[400px]" : "w-0"
    )}>
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className={`flex items-center justify-between mb-2`}>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{t('calendar.eventDetails')}</span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              <Icon icon="lucide:x" className="text-xl" />
            </button>
          </div>
          <h2 className={`text-xl font-bold text-slate-900 ${isRTL ? 'text-right' : ''}`}>
            {selectedDayKey ? (
              calendarType === 'hijri' ? (() => {
                const h = toHijri(new Date(selectedDayKey))
                return `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`
              })() : new Date(selectedDayKey).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', calendar: 'gregory' })
            ) : '-'}
          </h2>
          <p className={`text-sm text-slate-500 ${isRTL ? 'text-right' : ''}`}>
            {dayItems.length > 0
              ? t('calendar.eventsCount' as TranslationKey).replace('{{count}}', String(dayItems.length))
              : t('calendar.noEventsForDay')}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-8">
          {/* Event List */}
          <section>
            <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between`}>
              <span>{t('calendar.taskInformation')}</span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">{dayItems.length}</span>
            </h3>
            <div className="space-y-3">
              {dayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <Icon icon="lucide:calendar-x" className="text-2xl text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-400 italic">{t('calendar.noEventsForDay')}</p>
                </div>
              )}
              {dayItems.map(item => {
                const colors = SOURCE_COLORS[item.sourceType]
                const labelKey = SOURCE_LABEL_KEYS[item.sourceType] as TranslationKey
                const dueStatus = getDueStatus(item.date, t)
                const priorityColor = item.priority ? PRIORITY_COLORS[item.priority] : ''

                return (
                  <div key={item.id} className={cn('flex flex-col gap-2 p-3 rounded-xl border', colors.border, colors.bg)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
                        <span className="text-xs font-bold text-slate-700">{item.title}</span>
                      </div>
                    </div>
                    {item.subtitle && (
                      <p className="text-[10px] text-slate-500 truncate">{item.subtitle}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded text-white', colors.badge)}>
                        {t(labelKey)}
                      </span>
                      {item.priority && (
                        <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded', priorityColor)}>
                          {item.priority}
                        </span>
                      )}
                      <span className={cn('text-[9px] font-bold px-2 py-1 rounded', dueStatus.className)}>
                        {dueStatus.text}
                      </span>
                    </div>
                    {item.route && (
                      <button
                        onClick={() => router.push(item.route)}
                        className={cn(
                          'mt-1 w-full text-xs font-bold py-2 rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-2',
                          'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                        )}
                      >
                        {t('calendar.goToSource')} <Icon icon="lucide:arrow-right" className={cn("text-sm", isRTL && "flip-x")} />
                      </button>
                    )}
                    {item.sourceType === 'user-event' && (() => {
                      const calEventId = item.id.replace(/^cal-/, '')
                      // Defensive lookup — circular/policy parity. Hit byId
                      // first (O(1)), then fall back to the events array,
                      // then null. Keeps the row visible even if the maps
                      // briefly drift during an optimistic update.
                      const calEvent: CalendarEvent | null =
                        calendarById[calEventId] ?? calendarEvents.find((e) => e.id === calEventId) ?? null
                      const isCompleted = calEvent?.completed

                      // Lazy detail block — attendees, reminders, and the
                      // completed-at timestamp are detail-payload fields. If
                      // the row isn't in `byId` yet (e.g. mid-fetch), show a
                      // skeleton placeholder instead of rendering empty arrays
                      // as "0 attendees" / etc.
                      const detailLoaded = calEvent !== null
                      const attendeesCount = calEvent?.attendees?.length ?? 0
                      const remindersCount = calEvent?.reminders?.length ?? 0

                      const handleDelete = () => {
                        // Open the strong-confirm modal instead of firing the
                        // optimistic delete immediately — calendar events can
                        // carry attendees / reminders / completion history
                        // that we don't want to nuke on a single misclick.
                        setConfirmDeleteId(calEventId)
                      }

                      const deleteBtn = (
                        <LoadingButton
                          onClick={handleDelete}
                          loading={isMutating && confirmDeleteId === calEventId}
                          aria-label={t('common.delete' as TranslationKey)}
                          title={t('common.delete' as TranslationKey)}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'mt-1 shrink-0 px-3 text-xs font-bold py-2 rounded-lg border',
                            'bg-white text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300'
                          )}
                        >
                          <Icon icon="lucide:trash-2" className="text-sm" />
                        </LoadingButton>
                      )

                      return (
                        <>
                          {/* Lazy detail block — kept compact; defers
                              attendees/reminders meta until the row is in
                              `byId`. */}
                          {!detailLoaded ? (
                            <div className="mt-1 space-y-1.5">
                              <div className="h-3 w-32 bg-slate-200/60 rounded animate-pulse" />
                              <div className="h-3 w-20 bg-slate-200/60 rounded animate-pulse" />
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                              {attendeesCount > 0 && (
                                <span className="flex items-center gap-1">
                                  <Icon icon="lucide:users" className="text-xs" />
                                  {attendeesCount}
                                </span>
                              )}
                              {remindersCount > 0 && (
                                <span className="flex items-center gap-1">
                                  <Icon icon="lucide:bell" className="text-xs" />
                                  {remindersCount}
                                </span>
                              )}
                              {calEvent.completedAt && (
                                <span className="flex items-center gap-1">
                                  <Icon icon="lucide:check" className="text-xs" />
                                  {formatTimelineDate(calEvent.completedAt, isRTL)}
                                </span>
                              )}
                            </div>
                          )}
                          {isCompleted ? (
                            <div className="mt-1 flex items-center gap-2">
                              <div className={cn('flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold text-emerald-600')}>
                                <Icon icon="lucide:check-circle-2" className="text-base" />
                                <span>{t('calendar.markAsComplete' as TranslationKey)}</span>
                              </div>
                              {deleteBtn}
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-2">
                              <LoadingButton
                                onClick={() => updateEvent(calEventId, { completed: true, completedAt: new Date().toISOString() })}
                                loading={isMutating}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  'flex-1 text-xs font-bold py-2 rounded-lg border',
                                  'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                                )}
                              >
                                <Icon icon="lucide:check-circle-2" className="text-sm" />
                                {t('calendar.markAsComplete' as TranslationKey)}
                              </LoadingButton>
                              {deleteBtn}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Progress */}
          <section>
            <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>{t('calendar.status')}</h3>
            <div className={`flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100`}>
              <div className="relative w-16 h-16">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-slate-200 stroke-current" strokeWidth="12" fill="transparent" r="40" cx="50" cy="50" />
                  <circle
                    className="text-emerald-500 stroke-current transition-all duration-700"
                    strokeWidth="12"
                    strokeLinecap="round"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * stats.rate / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-900">{stats.rate}%</span>
                </div>
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-sm font-bold text-slate-900">{t('calendar.progress')}</p>
                <p className="text-xs text-slate-500">
                  {stats.total > 0
                    ? t('calendar.tasksCompleted').replace('{done}', stats.done.toString()).replace('{total}', stats.total.toString())
                    : t('calendar.noMetricsFound')}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100">
          <button
            onClick={() => {
              if (dayItems.length > 0 && selectedDayKey) {
                exportItemsToCsv(dayItems, selectedDayKey)
              }
            }}
            disabled={dayItems.length === 0}
            className={cn(
              'w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Icon icon="lucide:download" />
            {t('calendar.fullReport')} (CSV)
          </button>
        </div>
      </div>

      {/* Strong Delete Event Confirm — circular/policy parity. We don't reuse
          DeleteConfirmationDialog here because the drawer surfaces inline
          mutations and we want the language to spell out exactly what's
          cascading: attendees + reminders + attachments. */}
      <Modal
        isOpen={confirmDeleteId !== null}
        onClose={() => { if (!isMutating) setConfirmDeleteId(null) }}
        size="sm"
      >
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
              <Icon icon="lucide:alert-triangle" className="text-3xl text-rose-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
            {t('calendar.deleteEventTitle' as TranslationKey) || 'Delete event?'}
          </h2>
          {pendingDeleteEvent?.title && (
            <p className="text-sm font-semibold text-slate-700 text-center mb-2 truncate">
              {pendingDeleteEvent.title}
            </p>
          )}
          <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
            This will permanently delete the event and all its attendees, reminders, and attachments. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmDeleteId(null)}
              disabled={isMutating}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <LoadingButton
              loading={isMutating}
              onClick={() => {
                if (!confirmDeleteId) return
                // Optimistic remove + background DELETE — `deleteEvent`
                // rolls back if the network call fails. Errors surface via
                // the calendarError effect above.
                deleteEvent(confirmDeleteId)
                setConfirmDeleteId(null)
              }}
              variant="danger"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold"
            >
              {t('common.delete' as TranslationKey)}
            </LoadingButton>
          </div>
        </div>
      </Modal>
    </aside>
  )
}
