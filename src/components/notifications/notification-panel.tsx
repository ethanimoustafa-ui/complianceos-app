'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format/time-utils'
import { useNotificationStore } from '@/stores/notification-store'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/i18n'
import type { AppNotification } from '@/types'

const typeColors: Record<AppNotification['type'], string> = {
  info: 'border-s-blue-500',
  warning: 'border-s-amber-500',
  success: 'border-s-emerald-500',
  error: 'border-s-rose-500',
}

const typeIcons: Record<AppNotification['type'], string> = {
  info: 'lucide:info',
  warning: 'lucide:alert-triangle',
  success: 'lucide:check-circle',
  error: 'lucide:alert-circle',
}

const typeBg: Record<AppNotification['type'], string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
}

// Page size for the notification list's incremental display.
const PAGE = 20

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t, isRTL } = useTranslation()
  const router = useRouter()
  const { notifications, markAsRead, markAllAsRead, clearAll } = useNotificationStore()
  const isLoading = useNotificationStore((s) => s.isLoading)
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications)
  // First-fetch gate: show skeletons only on the initial load (empty + loading).
  const showSkeleton = isLoading && notifications.length === 0
  // Incremental display pagination. The list is already bounded server-side
  // (retention keeps ≤100 per user), so we render in pages of 20 rather than
  // dumping the whole set into the DOM at once.
  const [visibleCount, setVisibleCount] = useState(PAGE)
  // Reset the visible window to the first page each time the panel (re)opens.
  // Done during render (not in an effect) to avoid a cascading-render warning.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setVisibleCount(PAGE)
  }

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  // Refresh on open so the panel reflects the latest server state.
  useEffect(() => {
    if (isOpen) void fetchNotifications()
  }, [isOpen, fetchNotifications])

  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.read) markAsRead(notif.id)
    if (notif.route) {
      onClose()
      router.push(notif.route)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="ms-auto relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('sidebar.notifications')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {notifications.filter(n => !n.read).length} {t('sidebar.unread')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <Icon icon="lucide:x" className="text-2xl" />
          </button>
        </div>

        {/* Action buttons */}
        {notifications.length > 0 && (
          <div className="flex gap-2 px-6 py-3 border-b border-slate-100">
            <button
              onClick={markAllAsRead}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer"
            >
              {t('sidebar.markAllRead')}
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={clearAll}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              {t('sidebar.clearAll')}
            </button>
          </div>
        )}

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {showSkeleton ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/5" />
                    <Skeleton className="h-2.5 w-4/5" />
                    <Skeleton className="h-2 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div data-empty-state="true" className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Icon icon="lucide:bell-off" className="text-4xl mb-3" />
              <p className="text-sm font-medium">{t('emptyStates.notifications.title')}</p>
              <p className="text-xs text-slate-300 mt-1 text-center px-4">{t('emptyStates.notifications.description')}</p>
            </div>
          ) : (
            <>
            <div className="divide-y divide-slate-100">
              {notifications.slice(0, visibleCount).map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={cn(
                    'w-full text-start p-4 border-s-4 transition-colors cursor-pointer hover:bg-slate-50',
                    typeColors[notif.type],
                    !notif.read && 'bg-slate-50/80'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0', typeBg[notif.type])}>
                      <Icon icon={typeIcons[notif.type]} className="text-sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm truncate', !notif.read ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5">{formatRelativeTime(notif.createdAt, t)}</p>
                    </div>
                    {notif.route && (
                      <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="text-slate-300 shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            {visibleCount < notifications.length && (
              <div className="p-3">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE)}
                  className="w-full py-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  {t('common.loadMore')} ({notifications.length - visibleCount})
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
