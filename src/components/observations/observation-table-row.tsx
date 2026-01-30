'use client'

import { memo, useRef, useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { Observation, severityConfig, statusConfig, sourceConfig } from './observation-types'

interface ObservationTableRowProps {
  observation: Observation
  onRowClick: (observation: Observation) => void
  canEdit: boolean
  onEdit?: (observation: Observation) => void
  onDelete?: (observationId: string) => void
  isMenuOpen: boolean
  onMenuToggle: (id: string | null) => void
  shouldOpenUpward: boolean
  isRTL: boolean
}

// Format date from YYYY-MM-DD with locale support
const formatDate = (dateStr: string, isRTL: boolean) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export const ObservationTableRow = memo(function ObservationTableRow({
  observation,
  onRowClick,
  canEdit,
  onEdit,
  onDelete,
  isMenuOpen,
  onMenuToggle,
  shouldOpenUpward,
  isRTL,
}: ObservationTableRowProps) {
  const { t } = useTranslation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const severity = severityConfig[observation.severity]
  const status = statusConfig[observation.status]
  const source = sourceConfig[observation.source as keyof typeof sourceConfig] || {
    icon: 'lucide:help-circle',
    iconColor: 'text-slate-400',
    label: observation.source
  }
  const isClosed = observation.status === 'closed'

  // Calculate menu position when opening
  useEffect(() => {
    if (isMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect()
      const menuHeight = 88 // Approximate menu height (2 items * 40px + padding)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      // Determine if menu should open upward
      const openUp = spaceBelow < menuHeight && spaceAbove > menuHeight

      setMenuPosition({
        top: openUp ? rect.top - menuHeight : rect.bottom + 4,
        left: isRTL ? rect.left : rect.right - 140, // 140px is min-width of menu
      })
    }
  }, [isMenuOpen, isRTL])

  return (
    <tr
      onClick={() => onRowClick(observation)}
      className={`group bg-white hover:bg-slate-50 transition-all cursor-pointer border border-slate-100 rounded-xl shadow-sm ${
        isClosed ? 'opacity-60' : ''
      }`}
    >
      <td className={`py-4 ${isRTL ? 'pr-4' : 'pl-4'} text-xs font-bold text-slate-500 ${isRTL ? '!text-center' : ''}`}>
        #{observation.id}
      </td>
      <td className="py-4">
        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
          <Icon
            icon={source.icon}
            className={isClosed ? 'text-slate-400' : source.iconColor}
          />
          <span className="text-xs font-bold text-slate-700">
            {t(`observations.sources.${observation.source}` as 'observations.sources.sama')}
          </span>
        </div>
      </td>
      <td className="py-4">
        <p className={`text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors`}>
          {observation.title}
        </p>
        {observation.subTitle ? (
          <p className={`text-[10px] text-slate-400 mt-0.5 ${isRTL ? 'text-right' : ''}`}>{observation.subTitle}</p>
        ) : null}
      </td>
      <td className="py-4 text-center">
        <span
          className={`px-2 py-1 ${
            isClosed ? 'bg-slate-100 text-slate-600' : severity.badgeClass
          } text-[10px] font-black rounded-full uppercase`}
        >
          {t(`observations.severityOptions.${observation.severity}` as 'observations.severityOptions.critical')}
        </span>
      </td>
      <td className={`py-4 text-xs font-medium text-slate-600`}>
        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:flag" className="text-rose-400 text-[10px]" />
          <span>{formatDate(observation.dueDate, isRTL)}</span>
        </div>
        {observation.remediationSubmissionDueDate ? (
          <div className={`flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Icon icon="lucide:file-clock" className="text-amber-400 text-[10px]" />
            <span>{formatDate(observation.remediationSubmissionDueDate, isRTL)}</span>
          </div>
        ) : null}
      </td>
      <td className="py-4">
        <div className={`flex items-center gap-2 justify-center ${isRTL ? 'flex-row-reverse' : ''}`}>
          <span
            className={`w-2 h-2 rounded-full ${status.dotColor} ${
              observation.status === 'resolved' ? 'animate-pulse' : ''
            }`}
          />
          <span className={`text-xs font-bold ${status.textColor}`}>
            {t(`observations.statusOptions.${observation.status === 'in_progress' ? 'inProgress' : observation.status === 'resolved' ? 'pendingReview' : observation.status}` as 'observations.statusOptions.open')}
          </span>
        </div>
      </td>
      <td className={`py-4 ${isRTL ? 'pl-4 text-left' : 'pr-4 text-right'}`}>
        {isClosed ? (
          <Icon
            icon="lucide:check-circle-2"
            className="text-emerald-500 text-xl"
          />
        ) : !canEdit ? (
          <Icon
            icon="lucide:check-circle-2"
            className="text-slate-300 text-xl"
          />
        ) : (
          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={(e) => {
                e.stopPropagation()
                onMenuToggle(isMenuOpen ? null : observation.id)
              }}
              className="text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:more-horizontal" className="text-xl" />
            </button>

            {isMenuOpen ? (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMenuToggle(null)
                  }}
                />
                <div
                  className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px]"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMenuToggle(null)
                      onEdit?.(observation)
                    }}
                    className={`w-full px-4 py-2 ${isRTL ? 'text-right' : 'text-left'} text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <Icon icon="lucide:pencil" className="text-slate-400" />
                    {t('observations.actions.edit')}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMenuToggle(null)
                      onDelete?.(observation.id)
                    }}
                    className={`w-full px-4 py-2 ${isRTL ? 'text-right' : 'text-left'} text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <Icon icon="lucide:trash-2" />
                    {t('observations.actions.delete')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  )
})
