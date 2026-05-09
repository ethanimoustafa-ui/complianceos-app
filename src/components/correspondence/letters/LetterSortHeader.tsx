'use client'

import { Icon } from '@iconify/react'
import type { LetterSortCol, LetterSortState } from './letter-helpers'

export function LetterSortHeader({ label, col, sort, onSort, onClear }: {
  label: string; col: LetterSortCol
  sort: LetterSortState; onSort: (c: LetterSortCol) => void; onClear: () => void
}) {
  const active = sort?.col === col
  const icon = active ? (sort!.dir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down') : 'lucide:chevrons-up-down'
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onSort(col)}
        className={`flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer ${active ? 'text-emerald-600' : ''}`}>
        {label}<Icon icon={icon} className="text-sm" />
      </button>
      {active && (
        <button onClick={onClear} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Clear sort">
          <Icon icon="lucide:x" className="text-xs" />
        </button>
      )}
    </div>
  )
}
