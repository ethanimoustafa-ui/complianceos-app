'use client'

import { useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { ObservationSource, ObservationSeverity, ObservationStatus } from './observation-types'
import { useTranslation } from '@/i18n'
import { EditableSelect } from '@/components/ui/editable-select'
import { useEnumValuesStore } from '@/stores/enum-values-store'

// W19.7-BUG-1 fix: stable empty reference to prevent useSyncExternalStore loop.
import type { EnumValue } from '@/stores/enum-values-store'
const EMPTY_SOURCES: EnumValue[] = []

interface ObservationFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  sourceFilter: ObservationSource | 'all'
  onSourceChange: (source: ObservationSource | 'all') => void
  severityFilter: ObservationSeverity | 'all'
  onSeverityChange: (severity: ObservationSeverity | 'all') => void
  statusFilter: ObservationStatus | 'all'
  onStatusChange: (status: ObservationStatus | 'all') => void
  dueDateFilter?: string
  onDueDateChange?: (date: string) => void
  submissionDueDateFilter?: string
  onSubmissionDueDateChange?: (date: string) => void
  // O7: archive toggle
  archiveFilter?: 'active' | 'archived'
  onArchiveFilterChange?: (filter: 'active' | 'archived') => void
  // O13: clear all filters
  onClearFilters?: () => void
}

export function ObservationFilters({
  searchQuery,
  onSearchChange,
  sourceFilter,
  onSourceChange,
  severityFilter,
  onSeverityChange,
  statusFilter,
  onStatusChange,
  dueDateFilter,
  onDueDateChange,
  submissionDueDateFilter,
  onSubmissionDueDateChange,
  archiveFilter = 'active',
  onArchiveFilterChange,
  onClearFilters,
}: ObservationFiltersProps) {
  const { t, isRTL, language } = useTranslation()

  const hasActiveFilters =
    searchQuery !== '' ||
    sourceFilter !== 'all' ||
    severityFilter !== 'all' ||
    statusFilter !== 'all' ||
    (dueDateFilter !== undefined && dueDateFilter !== '') ||
    (submissionDueDateFilter !== undefined && submissionDueDateFilter !== '')

  // W24-6c: read source options from the configurable enum store so that
  // admin-added sources appear here automatically.
  const sourceEnumRows = useEnumValuesStore((s) => s.byDomain['observation.source'] ?? EMPTY_SOURCES)
  const fetchEnumValues = useEnumValuesStore((s) => s.fetch)
  useEffect(() => { void fetchEnumValues('observation.source') }, [fetchEnumValues])

  const sourceItems = useMemo(() => {
    const allOption = { id: 'all', label: t('observations.filters.allSources') }
    if (sourceEnumRows.length === 0) {
      // Fallback to hard-coded seeds while the fetch is in flight.
      return [
        allOption,
        { id: 'sama',     label: t('observations.sama') },
        { id: 'cma',      label: t('observations.sources.cma') },
        { id: 'ia',       label: t('observations.sources.ia') },
        { id: 'zatca',    label: t('observations.sources.zatca') },
        { id: 'misa',     label: t('observations.sources.misa') },
        { id: 'safiu',    label: t('observations.sources.safiu') },
        { id: 'citc',     label: t('observations.sources.citc') },
        { id: 'internal', label: t('observations.sources.internal') },
        { id: 'sharia',   label: t('observations.sources.sharia') },
      ]
    }
    const sorted = sourceEnumRows.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    return [
      allOption,
      ...sorted.map((row) => ({
        id: row.key,
        label: language === 'ar' ? row.nameAr : row.nameEn,
      })),
    ]
  }, [sourceEnumRows, language, t])

  return (
    <div className={`flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 `}>
      <div className="w-full lg:w-96 relative">
        <Icon
          icon="lucide:search"
          className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
        />
        <input
          type="text"
          placeholder={t('observations.filters.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full ${isRTL ? 'pr-4' : 'pl-10 pr-4'} py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all`}
        />
      </div>
      <div className={`flex flex-wrap gap-2`}>
        <EditableSelect
          locked
          className="min-w-[160px]"
          size="sm"
          value={sourceFilter}
          onChange={(id) => onSourceChange(id as ObservationSource | 'all')}
          items={sourceItems}
          isRTL={isRTL}
        />
        <EditableSelect
          locked
          className="min-w-[160px]"
          size="sm"
          value={severityFilter}
          onChange={(id) => onSeverityChange(id as ObservationSeverity | 'all')}
          items={[
            { id: 'all', label: t('observations.filters.allSeverity') },
            { id: 'critical', label: t('observations.severityOptions.critical') },
            { id: 'high', label: t('observations.severityOptions.high') },
            { id: 'medium', label: t('observations.severityOptions.medium') },
            { id: 'low', label: t('observations.severityOptions.low') },
          ]}
          isRTL={isRTL}
        />
        <EditableSelect
          locked
          className="min-w-[160px]"
          size="sm"
          value={statusFilter}
          onChange={(id) => onStatusChange(id as ObservationStatus | 'all')}
          items={[
            { id: 'all', label: t('observations.filters.allStatus') },
            { id: 'open', label: t('observations.statusOptions.open') },
            { id: 'in_progress', label: t('observations.statusOptions.inProgress') },
            { id: 'resolved', label: t('observations.statusOptions.pendingReview') },
            { id: 'closed', label: t('observations.statusOptions.closed') },
          ]}
          isRTL={isRTL}
        />
        {/* Remediation Deadline Filter */}
        {onDueDateChange ? (
          <div className={`relative flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2`}>
            <Icon icon="lucide:flag" className="text-rose-400 text-sm" />
            <input
              type="date"
              value={dueDateFilter || ''}
              onChange={(e) => onDueDateChange(e.target.value)}
              className={`bg-transparent py-2 text-xs font-bold text-slate-600 focus:outline-none ${dueDateFilter ? 'pr-6' : ''}`}
              title={t('observations.filters.remediationDeadline')}
            />
            {dueDateFilter ? (
              <button
                onClick={() => onDueDateChange('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <Icon icon="lucide:x" className="text-sm" />
              </button>
            ) : null}
          </div>
        ) : null}
        {/* Plan Submission Deadline Filter */}
        {onSubmissionDueDateChange ? (
          <div className={`relative flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2`}>
            <Icon icon="lucide:file-clock" className="text-amber-400 text-sm" />
            <input
              type="date"
              value={submissionDueDateFilter || ''}
              onChange={(e) => onSubmissionDueDateChange(e.target.value)}
              className={`bg-transparent py-2 text-xs font-bold text-slate-600 focus:outline-none ${submissionDueDateFilter ? 'pr-6' : ''}`}
              title={t('observations.filters.planSubmissionDeadline')}
            />
            {submissionDueDateFilter ? (
              <button
                onClick={() => onSubmissionDueDateChange('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <Icon icon="lucide:x" className="text-sm" />
              </button>
            ) : null}
          </div>
        ) : null}
        {/* O13: Clear filters button */}
        {onClearFilters && hasActiveFilters ? (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            <Icon icon="lucide:filter-x" className="text-sm" />
            {t('observations.clearFilters' as import('@/i18n').TranslationKey)}
          </button>
        ) : null}
        {/* O7: Archived filter chip */}
        {onArchiveFilterChange ? (
          <button
            onClick={() => onArchiveFilterChange(archiveFilter === 'archived' ? 'active' : 'archived')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              archiveFilter === 'archived'
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon icon="lucide:archive" className="text-sm" />
            {t('observations.detail.archivedFilter' as import('@/i18n').TranslationKey)}
          </button>
        ) : null}
        {/* O5: non-functional funnel icon removed */}
      </div>
    </div>
  )
}
