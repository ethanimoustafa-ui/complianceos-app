'use client'

import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { ObservationSource, ObservationSeverity, ObservationStatus } from './observation-types'
import { useTranslation, type TranslationKey } from '@/i18n'
import { EditableSelect } from '@/components/ui/editable-select'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'

// Observation sources derive from enabled correspondence-based frameworks —
// matching the create/edit picker (observation-form-fields). The standalone
// "Sources" configurable was removed because it duplicated this signal.
const SOURCE_ORDER = ['sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'citc', 'sharia', 'internal']
const SOURCE_TO_FRAMEWORK_ID: Record<string, string | null> = {
  sama: 'sama', cma: 'cma', ia: 'ia', zatca: 'zatca', misa: 'misa', safiu: 'safiu', citc: 'citc', internal: null, sharia: 'sharia-board',
}
const SOURCE_LABEL_KEYS: Record<string, string> = {
  sama: 'observations.sama',
  cma: 'observations.sources.cma',
  ia: 'observations.sources.ia',
  zatca: 'observations.sources.zatca',
  misa: 'observations.sources.misa',
  safiu: 'observations.sources.safiu',
  citc: 'observations.sources.citc',
  internal: 'observations.sources.internal',
  sharia: 'observations.sources.sharia',
}

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

  // Source options = 'all' + enabled correspondence-based frameworks (seed
  // sources gated by their framework, plus any custom correspondence frameworks).
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const sourceItems = useMemo(() => {
    const allOption = { id: 'all', label: t('observations.filters.allSources') }
    const seedFwIds = new Set(
      Object.values(SOURCE_TO_FRAMEWORK_ID).filter((v): v is string => !!v),
    )
    const seed = SOURCE_ORDER.filter((source) => {
      if (source === 'internal') return true
      const fwId = SOURCE_TO_FRAMEWORK_ID[source]
      if (!fwId) return true
      const fw = frameworks.find((f) => f.id === fwId)
      return !!fw?.enabled && !!fw.correspondenceBased
    }).map((source) => ({ id: source, label: t(SOURCE_LABEL_KEYS[source] as TranslationKey) }))
    const custom = frameworks
      .filter((f) => f.enabled && f.correspondenceBased && !seedFwIds.has(f.id))
      .map((f) => ({ id: f.id, label: language === 'ar' ? f.nameAr : f.name }))
    return [allOption, ...seed, ...custom]
  }, [frameworks, language, t])

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
            { id: 'remediated', label: t('observations.statusOptions.remediated') },
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
