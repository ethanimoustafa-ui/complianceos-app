'use client'

import { memo, useMemo, useState } from 'react'
import { useTranslation } from '@/i18n'
import { formatTimelineDate } from '@/lib/format-date'
import { dicebearAvatar } from '@/lib/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import type { ObservationTimelineEntry } from '@/types'

// H4: default number of timeline entries visible before "Load More".
const TIMELINE_PAGE_SIZE = 5

export interface ActivityTimelineProps {
  timeline: ObservationTimelineEntry[]
  isRTL: boolean
  /**
   * When false, the timeline shows skeleton rows. The detail GET hasn't
   * resolved yet so any entries from the list response are partial.
   */
  isLoaded?: boolean
}

export const ActivityTimeline = memo(function ActivityTimeline({
  timeline,
  isRTL,
  isLoaded = true,
}: ActivityTimelineProps) {
  const { t } = useTranslation()
  // H4: track how many entries to show; reset to default when timeline changes.
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE)

  // Newest-first. The store appends most entries at index 0 already, but
  // re-sort defensively in case mixed sources interleave older rows.
  const sorted = useMemo(() => {
    if (!timeline?.length) return []
    return [...timeline].sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0
      const bd = b.date ? new Date(b.date).getTime() : 0
      return bd - ad
    })
  }, [timeline])

  if (!isLoaded) {
    return (
      <div>
        <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
          {t('observations.detail.activityTimeline')}
        </h4>
        <div
          className={`space-y-3 ${isRTL ? 'border-r-2 mr-1 pr-4' : 'border-l-2 ml-1 pl-4'} border-slate-200`}
          data-testid="observation-activity-skeleton"
          aria-busy="true"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.activityTimeline')}
      </h4>
      {sorted.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{t('auditDetail.noActivityYet')}</p>
      ) : (
        <div className={`space-y-3 ${isRTL ? 'border-r-2 mr-1 pr-4' : 'border-l-2 ml-1 pl-4'} border-slate-200`}>
          {sorted.slice(0, visibleCount).map((event, index) => {
            // Prefer absolute formatTimelineDate; legacy local rows fall back
            // to translated dateKey.
            const formattedDate = event.dateKey
              ? t(`observations.detail.${event.dateKey}` as 'observations.detail.today')
              : formatTimelineDate(event.date, isRTL)

            // Wave-20.cleanup — canonical reader. Prefer the dual-store
            // `textEn` / `textAr` columns (server-emitted, mirror of Policy +
            // Rules); fall back to legacy `description` / `descriptionAr` for
            // optimistic in-memory rows synthesised by the store. The
            // descriptionKey path (translated client-only strings) still wins
            // when present.
            const localized = isRTL
              ? (event.textAr ?? event.descriptionAr ?? event.textEn ?? event.description)
              : (event.textEn ?? event.description ?? event.textAr ?? event.descriptionAr)
            const formattedDescription = event.descriptionKey
              ? t(event.descriptionKey as 'observations.detail.timeline.checklistAdded', event.descriptionParams as Record<string, string>)
              : localized

            return (
              <div
                key={event.id}
                className={`relative hover:bg-slate-50 rounded-lg p-2 transition-colors ${isRTL ? '-mr-2' : '-ml-2'}`}
              >
                <div
                  className={`absolute ${isRTL ? '-right-[14px]' : '-left-[14px]'} top-3 w-2.5 h-2.5 rounded-full border-2 border-slate-50 ${
                    index === 0 ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                <div className={`flex items-center gap-2`}>
                  {event.userAvatar ? (
                    <div className="relative group">
                      <img
                        src={dicebearAvatar(event.userAvatar)}
                        className="w-4 h-4 rounded-full cursor-pointer hover:ring-2 hover:ring-emerald-300 transition-all"
                        alt={event.userName || 'User'}
                      />
                      <div className={`absolute left-0 bottom-full mb-2 hidden group-hover:block z-10`}>
                        <div className={`bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg`}>
                          <p className="font-bold">{event.userName}</p>
                          {event.userRole ? <p className="text-slate-300">{event.userRole}</p> : null}
                          {event.userDepartment ? <p className="text-slate-400 text-[10px]">{event.userDepartment}</p> : null}
                        </div>
                        <div className={`absolute left-1 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900`} />
                      </div>
                    </div>
                  ) : null}
                  <p className={`text-[10px] font-black text-slate-400`}>
                    {formattedDate}
                    {event.userName ? (
                      <span className={`text-emerald-600 normal-case ml-1`}> {t('observations.detail.by')} {event.userName}</span>
                    ) : null}
                  </p>
                </div>
                <p className={`text-xs font-medium text-slate-700 mt-1`}>
                  {formattedDescription}
                </p>
              </div>
            )
          })}
          {/* H4: Load More button — shown when there are hidden entries */}
          {sorted.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + TIMELINE_PAGE_SIZE)}
              className={`mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer ${isRTL ? 'text-right' : 'text-left'}`}
            >
              {t('common.loadMore')} ({sorted.length - visibleCount} {t('common.more')})
            </button>
          )}
        </div>
      )}
    </div>
  )
})
