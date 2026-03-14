'use client'

import { Icon } from '@iconify/react'
import { ObservationSource, ObservationSeverity, ObservationStatus } from './observation-types'
import { useTranslation } from '@/i18n'

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
}: ObservationFiltersProps) {
  const { t, isRTL } = useTranslation()

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
        <select
          value={sourceFilter}
          onChange={(e) => onSourceChange(e.target.value as ObservationSource | 'all')}
          className={`bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500`}
        >
          <option value="all">{t('observations.filters.allSources')}</option>
          <option value="sama">{t('observations.sources.sama')}</option>
          <option value="internal">{t('observations.sources.internal')}</option>
          <option value="sharia">{t('observations.sources.sharia')}</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value as ObservationSeverity | 'all')}
          className={`bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500`}
        >
          <option value="all">{t('observations.filters.allSeverity')}</option>
          <option value="critical">{t('observations.severityOptions.critical')}</option>
          <option value="high">{t('observations.severityOptions.high')}</option>
          <option value="medium">{t('observations.severityOptions.medium')}</option>
          <option value="low">{t('observations.severityOptions.low')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as ObservationStatus | 'all')}
          className={`bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center`}
        >
          <option value="all">{t('observations.filters.allStatus')}</option>
          <option value="open">{t('observations.statusOptions.open')}</option>
          <option value="in_progress">{t('observations.statusOptions.inProgress')}</option>
          <option value="resolved">{t('observations.statusOptions.pendingReview')}</option>
          <option value="closed">{t('observations.statusOptions.closed')}</option>
        </select>
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
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <Icon icon="lucide:filter" className="text-xl" />
        </button>
      </div>
    </div>
  )
}
