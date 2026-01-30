'use client'

import { useState, useMemo, memo } from 'react'
import { Icon } from '@iconify/react'
import { Observation } from './observation-types'
import { NoResultsEmptyState, NoDataEmptyState } from '@/components/ui/empty-state'
import { useTranslation } from '@/i18n'
import { useAuthStore } from '@/stores/auth-store'
import { canEditObservation } from '@/lib/permissions'
import { ObservationTableRow } from './observation-table-row'
import { TablePagination } from '@/components/ui/table-pagination'

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

export const ObservationTable = memo(function ObservationTable({
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
  const user = useAuthStore((state) => state.user)
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
      <div className="overflow-x-auto overflow-y-visible hide-scrollbar">
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
            {sortedObservations.map((observation, rowIndex) => (
              <ObservationTableRow
                key={observation.id}
                observation={observation}
                onRowClick={onRowClick}
                canEdit={canEditObservation(user, observation)}
                onEdit={onEdit}
                onDelete={onDelete}
                isMenuOpen={openMenuId === observation.id}
                onMenuToggle={setOpenMenuId}
                shouldOpenUpward={sortedObservations.length > 2 && rowIndex >= sortedObservations.length - 2}
                isRTL={isRTL}
              />
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
      />
    </>
  )
})
