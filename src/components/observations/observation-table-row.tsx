'use client'

import { memo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import {
  formatObservationSeverity,
  formatObservationStatus,
  formatObservationSource,
} from '@/lib/format/enum'
import { Observation, severityConfig, statusConfig, sourceConfig } from './observation-types'

interface ObservationTableRowProps {
  observation: Observation
  onRowClick: (observation: Observation) => void
  canEdit: boolean
  canDelete: boolean
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
  canDelete,
  onEdit,
  onDelete,
  isMenuOpen,
  onMenuToggle,
  isRTL,
}: ObservationTableRowProps) {
  const { t } = useTranslation()
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  const severity = severityConfig[observation.severity]
  const status = statusConfig[observation.status]
  const source = sourceConfig[observation.source as keyof typeof sourceConfig] || {
    icon: 'lucide:help-circle',
    iconColor: 'text-slate-400',
    label: observation.source
  }
  const isClosed = observation.status === 'closed'

  // Edit is shown only for open rows the user can edit; Delete only when granted.
  const showEdit = !isClosed && canEdit
  const showDelete = canDelete

  const MENU_WIDTH = 172
  // O6: closed rows (or edit-less grants) show a single Delete item, so the menu
  // is shorter. Both items present → taller.
  const MENU_HEIGHT = showEdit && showDelete ? 92 : 52

  // Position the action menu next to the cursor. In LTR, the menu's left edge sits
  // just right of the cursor; in RTL, the menu's right edge sits just left of the cursor.
  // Always clamp so the menu never spills off-screen.
  const positionMenuAtCursor = (e: React.MouseEvent) => {
    const OFFSET = 6
    const maxLeft = window.innerWidth - MENU_WIDTH - 8
    const maxTop  = window.innerHeight - MENU_HEIGHT - 8
    const desiredLeft = isRTL ? e.clientX - MENU_WIDTH - OFFSET : e.clientX + OFFSET
    const left = Math.max(8, Math.min(desiredLeft, maxLeft))
    const top  = Math.max(8, Math.min(e.clientY + OFFSET, maxTop))
    setMenuPosition({ top, left })
  }

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
        <div className={`flex items-center gap-2 `}>
          <Icon
            icon={source.icon}
            className={isClosed ? 'text-slate-400' : source.iconColor}
          />
          <span className="text-xs font-bold text-slate-700">
            {/* Wave-20.cleanup — single shared enum formatter. */}
            {formatObservationSource(t, observation.source)}
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
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {observation.department && (
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wide">
              {observation.department}
            </span>
          )}
          {(() => {
            const leader = observation.assignees?.find(
              (a) => a.role === 'leader' || (observation.leaderId && a.id === observation.leaderId)
            )
            if (!leader) return null
            const initials = leader.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
            return (
              <span
                title={leader.name}
                className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-black flex items-center justify-center flex-shrink-0"
              >
                {initials}
              </span>
            )
          })()}
        </div>
      </td>
      <td className="py-4 text-center">
        <span
          className={`px-2 py-1 ${
            isClosed ? 'bg-slate-100 text-slate-600' : severity.badgeClass
          } text-[10px] font-black rounded-full uppercase`}
        >
          {/* Wave-20.cleanup — single shared enum formatter. */}
          {formatObservationSeverity(t, observation.severity)}
        </span>
      </td>
      <td className={`py-4 text-xs font-medium text-slate-600`}>
        {/* O1: completed (closed) observations no longer show a deadline. */}
        {isClosed ? (
          <span className="text-slate-300">—</span>
        ) : (
          <>
            <div className={`flex items-center gap-1`}>
              <Icon icon="lucide:flag" className="text-rose-400 text-[10px]" />
              <span>{formatDate(observation.dueDate, isRTL)}</span>
            </div>
            {observation.remediationSubmissionDueDate ? (
              <div className={`flex items-center gap-1 mt-0.5 text-[10px] text-slate-400`}>
                <Icon icon="lucide:file-clock" className="text-amber-400 text-[10px]" />
                <span>{formatDate(observation.remediationSubmissionDueDate, isRTL)}</span>
              </div>
            ) : null}
          </>
        )}
      </td>
      <td className="py-4">
        <div className={`flex items-center gap-2 justify-center`}>
          <span
            className={`w-2 h-2 rounded-full ${status.dotColor} ${
              observation.status === 'resolved' ? 'animate-pulse' : ''
            }`}
          />
          <span className={`text-xs font-bold ${status.textColor}`}>
            {/* Wave-20.cleanup — single shared enum formatter. The helper
                already maps in_progress→inProgress and resolved→pendingReview
                via its OBSERVATION_STATUS_KEYS table. */}
            {formatObservationStatus(t, observation.status)}
          </span>
        </div>
      </td>
      <td className={`py-4 ${isRTL ? 'pl-4 text-left' : 'pr-4 text-right'}`}>
        {!(canEdit || canDelete) ? (
          // O6: closed rows still get the emerald "verified" check when the user
          // can't act; non-actionable open rows show the muted check.
          <span className="inline-flex justify-end w-full">
            <Icon
              icon="lucide:check-circle-2"
              className={isClosed ? 'text-emerald-500 text-xl' : 'text-slate-300 text-xl'}
            />
          </span>
        ) : (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isMenuOpen) positionMenuAtCursor(e)
                onMenuToggle(isMenuOpen ? null : observation.id)
              }}
              className="text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:more-horizontal" className="text-xl" />
            </button>

            {isMenuOpen && isMounted
              ? createPortal(
                  <>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onMenuToggle(null)
                      }}
                      style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                    />
                    <div
                      style={{
                        position: 'fixed',
                        top: menuPosition.top,
                        left: menuPosition.left,
                        width: MENU_WIDTH,
                        zIndex: 9999,
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        boxShadow: '0 10px 30px -10px rgba(15, 23, 42, 0.25)',
                        padding: '4px 0',
                      }}
                    >
                      {/* O6: Edit is hidden for completed (closed) observations —
                          verified findings stay immutable; only Delete is offered.
                          Also hidden when the user only holds observation:delete. */}
                      {showEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onMenuToggle(null)
                            onEdit?.(observation)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 16px',
                            fontSize: 14,
                            color: '#334155',
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            textAlign: isRTL ? 'right' : 'left',
                            justifyContent: isRTL ? 'flex-end' : 'flex-start',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Icon icon="lucide:pencil" style={{ color: '#94a3b8' }} />
                          <span>{t('observations.actions.edit')}</span>
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onMenuToggle(null)
                            onDelete?.(observation.id)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 16px',
                            fontSize: 14,
                            color: '#e11d48',
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            textAlign: isRTL ? 'right' : 'left',
                            justifyContent: isRTL ? 'flex-end' : 'flex-start',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fff1f2')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Icon icon="lucide:trash-2" />
                          <span>{t('observations.actions.delete')}</span>
                        </button>
                      )}
                    </div>
                  </>,
                  document.body,
                )
              : null}
          </div>
        )}
      </td>
    </tr>
  )
})
