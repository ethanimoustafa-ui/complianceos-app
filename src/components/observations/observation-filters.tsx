'use client'

import { Icon } from '@iconify/react'
import { ObservationSource, ObservationSeverity, ObservationStatus } from './observation-types'

interface ObservationFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  sourceFilter: ObservationSource | 'all'
  onSourceChange: (source: ObservationSource | 'all') => void
  severityFilter: ObservationSeverity | 'all'
  onSeverityChange: (severity: ObservationSeverity | 'all') => void
  statusFilter: ObservationStatus | 'all'
  onStatusChange: (status: ObservationStatus | 'all') => void
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
}: ObservationFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
      <div className="w-full lg:w-96 relative">
        <Icon
          icon="lucide:search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Search by ID or Finding title..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={sourceFilter}
          onChange={(e) => onSourceChange(e.target.value as ObservationSource | 'all')}
          className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Sources</option>
          <option value="sama">SAMA Inspection</option>
          <option value="internal">Internal Audit</option>
          <option value="sharia">Sharia Audit</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value as ObservationSeverity | 'all')}
          className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as ObservationStatus | 'all')}
          className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Pending Review</option>
          <option value="closed">Closed</option>
        </select>
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <Icon icon="lucide:filter" className="text-xl" />
        </button>
      </div>
    </div>
  )
}
