'use client'

import { memo } from 'react'
import { useTranslation } from '@/i18n'

export interface TablePaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  showingLabel?: string
}

export const TablePagination = memo(function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: TablePaginationProps) {
  const { t } = useTranslation()

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  // Calculate visible page numbers
  const getVisiblePages = () => {
    const pages: number[] = []
    const maxVisible = 3

    for (let i = 1; i <= Math.min(totalPages, maxVisible); i++) {
      pages.push(i)
    }

    return pages
  }

  const visiblePages = getVisiblePages()

  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
      <p className="text-xs font-bold text-slate-400">
        {t('observations.pagination.showing', { start: startItem, end: endItem, total: totalItems })}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {t('observations.pagination.previous')}
        </button>
        {visiblePages.map((page) => (
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
        ))}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {t('observations.pagination.next')}
        </button>
      </div>
    </div>
  )
})
