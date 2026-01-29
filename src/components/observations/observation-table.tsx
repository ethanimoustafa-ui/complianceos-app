'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import {
  Observation,
  severityConfig,
  statusConfig,
  sourceConfig,
} from './observation-types'
import { NoResultsEmptyState, NoDataEmptyState } from '@/components/ui/empty-state'
import { RoleGuard } from '@/components/auth/role-guard'
import { useTranslation } from '@/i18n'

type SortField = 'id' | 'source' | 'title' | 'severity' | 'dueDate' | 'status'
type SortDirection = 'asc' | 'desc'

interface ObservationTableProps {
  observations: Observation[]
  onRowClick: (observation: Observation) => void
  currentPage: number
  totalItems: number
  onPageChange: (page: number) => void
  itemsPerPage: number
  onClearFilters?: () => void
  onAddObservation?: () => void
  onEdit?: (observation: Observation) => void
  onDelete?: (observationId: string) => void
  hasFilters?: boolean
}

// Severity order for sorting
const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
// Status order for sorting
const statusOrder = { open: 0, in_progress: 1, resolved: 2, closed: 3 }

// Format date from YYYY-MM-DD with locale support
const formatDate = (dateStr: string, isRTL: boolean) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr // Return as-is if already formatted or invalid
  return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function ObservationTable({
  observations,
  onRowClick,
  currentPage,
  totalItems,
  onPageChange,
  itemsPerPage,
  onClearFilters,
  onAddObservation,
  onEdit,
  onDelete,
  hasFilters = false,
}: ObservationTableProps) {
  const { t, isRTL } = useTranslation()
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new field with ascending direction
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedObservations = useMemo(() => {
    if (!sortField) return observations

    return [...observations].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'id':
          comparison = a.id.localeCompare(b.id)
          break
        case 'source':
          comparison = a.source.localeCompare(b.source)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'severity':
          comparison = severityOrder[a.severity] - severityOrder[b.severity]
          break
        case 'dueDate':
          comparison = new Date(a.dueDate || '').getTime() - new Date(b.dueDate || '').getTime()
          break
        case 'status':
          comparison = statusOrder[a.status] - statusOrder[b.status]
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [observations, sortField, sortDirection])

  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <Icon icon="lucide:arrow-up-down" className={`text-[10px] inline ${isRTL ? 'mr-1' : 'ml-1'} opacity-30`} />
    }
    return (
      <Icon
        icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
        className={`text-[10px] inline ${isRTL ? 'mr-1' : 'ml-1'} text-emerald-600`}
      />
    )
  }

  // Show empty state when no observations
  if (observations.length === 0) {
    if (hasFilters) {
      return (
        <NoResultsEmptyState
          onClearFilters={onClearFilters}
        />
      )
    }
    return (
      <NoDataEmptyState
        entityName="observations"
        onAdd={onAddObservation}
      />
    )
  }

  return (
    <>
      <div className="overflow-x-auto hide-scrollbar">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <th
                className={`${isRTL ? 'text-center' : 'text-left pl-4'} pb-4 cursor-pointer hover:text-slate-600 transition-colors ${isRTL ? '!text-center' : ''}`}
                onClick={() => handleSort('id')}
              >
                {t('observations.table.id')} <SortIcon field="id" />
              </th>
              <th
                className={`${isRTL ? 'text-center' : 'text-left'} pb-4 cursor-pointer hover:text-slate-600 transition-colors`}
                onClick={() => handleSort('source')}
              >
                {t('observations.table.source')} <SortIcon field="source" />
              </th>
              <th
                className={`${isRTL ? 'text-center' : 'text-left'} pb-4 cursor-pointer hover:text-slate-600 transition-colors`}
                onClick={() => handleSort('title')}
              >
                {t('observations.table.findingTitle')} <SortIcon field="title" />
              </th>
              <th
                className="text-center pb-4 cursor-pointer hover:text-slate-600 transition-colors"
                onClick={() => handleSort('severity')}
              >
                {t('observations.table.severity')} <SortIcon field="severity" />
              </th>
              <th
                className={`${isRTL ? 'text-center' : 'text-left'} pb-4 cursor-pointer hover:text-slate-600 transition-colors`}
                onClick={() => handleSort('dueDate')}
              >
                {t('observations.table.dueDate')} <SortIcon field="dueDate" />
              </th>
              <th
                className={`text-center pb-4 cursor-pointer hover:text-slate-600 transition-colors ${isRTL ? '!text-center' : ''}`}
                onClick={() => handleSort('status')}
              >
                {t('observations.table.status')} <SortIcon field="status" />
              </th>
              <th className={`${isRTL ? 'text-center' : 'text-right pr-4'} pb-4`}>{t('observations.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedObservations.map((observation, rowIndex) => {
              const severity = severityConfig[observation.severity]
              const status = statusConfig[observation.status]
              // Safe source lookup with fallback for unknown source values
              const source = sourceConfig[observation.source as keyof typeof sourceConfig] || {
                icon: 'lucide:help-circle',
                iconColor: 'text-slate-400',
                label: observation.source
              }
              const isClosed = observation.status === 'closed'
              // Open dropdown upward if row is near the bottom
              const shouldOpenUpward = rowIndex >= sortedObservations.length - 2

              return (
                <tr
                  key={observation.id}
                  onClick={() => onRowClick(observation)}
                  className={`group bg-white hover:bg-slate-50 transition-all cursor-pointer border border-slate-100 rounded-xl shadow-sm ${
                    isClosed ? 'opacity-60' : ''
                  }`}
                >
                  <td  className={`py-4 ${isRTL ? 'pr-4' : 'pl-4'} text-xs font-bold text-slate-500 ${isRTL ? '!text-center' : ''}`}>
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
                    {observation.subTitle && (
                      <p className={`text-[10px] text-slate-400 mt-0.5 ${isRTL ? 'text-right' : ''}`}>{observation.subTitle}</p>
                    )}
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
                    {formatDate(observation.dueDate, isRTL)}
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
                    ) : (
                      <div className="relative">
                        <RoleGuard
                          editOnly
                          hidden
                          fallback={
                            <Icon
                              icon="lucide:check-circle-2"
                              className="text-slate-300 text-xl"
                            />
                          }
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(openMenuId === observation.id ? null : observation.id)
                            }}
                            className="text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            <Icon icon="lucide:more-horizontal" className="text-xl" />
                          </button>
                        </RoleGuard>

                        {/* Dropdown Menu */}
                        {openMenuId === observation.id && (
                          <>
                            {/* Backdrop to close menu */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId(null)
                              }}
                            />
                            <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} ${shouldOpenUpward ? 'bottom-full mb-1' : 'top-full mt-1'} z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px]`}>
                              <RoleGuard editOnly hidden>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(null)
                                    onEdit?.(observation)
                                  }}
                                  className={`w-full px-4 py-2 ${isRTL ? 'text-right' : 'text-left'} text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                                >
                                  <Icon icon="lucide:pencil" className="text-slate-400" />
                                  {t('observations.actions.edit')}
                                </button>
                              </RoleGuard>
                              <RoleGuard deleteOnly hidden>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(null)
                                    onDelete?.(observation.id)
                                  }}
                                  className={`w-full px-4 py-2 ${isRTL ? 'text-right' : 'text-left'} text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                                >
                                  <Icon icon="lucide:trash-2" />
                                  {t('observations.actions.delete')}
                                </button>
                              </RoleGuard>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className={`flex items-center justify-between mt-8 pt-6 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <p className="text-xs font-bold text-slate-400">
          {t('observations.pagination.showing', { start: startItem, end: endItem, total: totalItems })}
        </p>
        <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t('observations.pagination.previous')}
          </button>
          {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map(
            (page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 border rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  currentPage === page
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            )
          )}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t('observations.pagination.next')}
          </button>
        </div>
      </div>
    </>
  )
}
