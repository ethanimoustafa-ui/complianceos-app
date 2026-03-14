'use client'

import { memo } from 'react'
import { useTranslation } from '@/i18n'
import { formatLocalizedDateShort } from '@/lib/time-utils'
import type { ObservationTimelineEntry } from '@/types'

export interface ActivityTimelineProps {
  timeline: ObservationTimelineEntry[]
  isRTL: boolean
}

export const ActivityTimeline = memo(function ActivityTimeline({
  timeline,
  isRTL,
}: ActivityTimelineProps) {
  const { t } = useTranslation()

  if (!timeline?.length) return null

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.activityTimeline')}
      </h4>
      <div className={`space-y-3 ${isRTL ? 'border-r-2 mr-1 pr-4' : 'border-l-2 ml-1 pl-4'} border-slate-200`}>
        {timeline.map((event, index) => {
          // Format the timeline date - use dateKey translation or format the date
          const formattedDate = event.dateKey
            ? t(`observations.detail.${event.dateKey}` as 'observations.detail.today')
            : formatLocalizedDateShort(event.date, isRTL)

          // Format the timeline description - prefer translation key, then Arabic, then English
          const formattedDescription = event.descriptionKey
            ? t(event.descriptionKey as 'observations.detail.timeline.checklistAdded', event.descriptionParams as Record<string, string>)
            : (isRTL && event.descriptionAr) ? event.descriptionAr : event.description

          return (
            <div
              key={event.id}
              className={`relative hover:bg-slate-50 rounded-lg p-2 transition-colors ${isRTL ? '-mr-2' : '-ml-2'}`}
            >
              {/* Timeline dot - centered ON the border line */}
              <div
                className={`absolute ${isRTL ? '-right-[14px]' : '-left-[14px]'} top-3 w-2.5 h-2.5 rounded-full border-2 border-slate-50 ${
                  index === 0 ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              />
              <div className={`flex items-center gap-2`}>
                {event.userAvatar ? (
                  <div className="relative group">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${event.userAvatar}`}
                      className="w-4 h-4 rounded-full cursor-pointer hover:ring-2 hover:ring-emerald-300 transition-all"
                      alt={event.userName || 'User'}
                    />
                    {/* User Tooltip */}
                    <div className={`absolute left-0 bottom-full mb-2 hidden group-hover:block z-10`}>
                      <div className={`bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg`}>
                        <p className="font-bold">{event.userName}</p>
                        {event.userRole ? <p className="text-slate-300">{event.userRole}</p> : null}
                        {event.userDepartment ? <p className="text-slate-400 text-[10px]">{event.userDepartment}</p> : null}
                      </div>
                      {/* Tooltip arrow */}
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
      </div>
    </div>
  )
})
