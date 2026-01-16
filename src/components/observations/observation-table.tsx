'use client'

import { Icon } from '@iconify/react'
import {
  Observation,
  severityConfig,
  statusConfig,
  sourceConfig,
} from './observation-types'

interface ObservationTableProps {
  observations: Observation[]
  onRowClick: (observation: Observation) => void
  currentPage: number
  totalItems: number
  onPageChange: (page: number) => void
  itemsPerPage: number
}

export function ObservationTable({
  observations,
  onRowClick,
  currentPage,
  totalItems,
  onPageChange,
  itemsPerPage,
}: ObservationTableProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <th className="text-left pb-4 pl-4">ID</th>
              <th className="text-left pb-4">Source</th>
              <th className="text-left pb-4">Finding Title</th>
              <th className="text-left pb-4">Severity</th>
              <th className="text-left pb-4">Due Date</th>
              <th className="text-left pb-4">Status</th>
              <th className="text-right pb-4 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((observation) => {
              const severity = severityConfig[observation.severity]
              const status = statusConfig[observation.status]
              const source = sourceConfig[observation.source]
              const isClosed = observation.status === 'closed'

              return (
                <tr
                  key={observation.id}
                  onClick={() => onRowClick(observation)}
                  className={`group bg-white hover:bg-slate-50 transition-all cursor-pointer border border-slate-100 rounded-xl shadow-sm ${
                    isClosed ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-4 pl-4 text-xs font-bold text-slate-500">
                    #{observation.id}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={source.icon}
                        className={isClosed ? 'text-slate-400' : source.iconColor}
                      />
                      <span className="text-xs font-bold text-slate-700">
                        {source.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-4">
                    <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {observation.title}
                    </p>
                    <p className="text-[10px] text-slate-400">{observation.reference}</p>
                  </td>
                  <td className="py-4">
                    <span
                      className={`px-2 py-1 ${
                        isClosed ? 'bg-slate-100 text-slate-600' : severity.badgeClass
                      } text-[10px] font-black rounded-full uppercase`}
                    >
                      {severity.label}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-medium text-slate-600">
                    {observation.dueDate}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${status.dotColor} ${
                          observation.status === 'resolved' ? 'animate-pulse' : ''
                        }`}
                      />
                      <span className={`text-xs font-bold ${status.textColor}`}>
                        {status.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-right">
                    {isClosed ? (
                      <Icon
                        icon="lucide:check-circle-2"
                        className="text-emerald-500 text-xl"
                      />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                        className="text-slate-400 hover:text-slate-900 transition-colors"
                      >
                        <Icon icon="lucide:more-horizontal" className="text-xl" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
        <p className="text-xs font-bold text-slate-400">
          Showing {startItem}-{endItem} of {totalItems} observations
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map(
            (page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 border rounded-lg text-xs font-bold transition-colors ${
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
            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}
