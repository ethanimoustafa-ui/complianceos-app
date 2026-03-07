'use client'

import { Icon } from '@iconify/react'

export type SortState<T extends string> = { col: T; dir: 'asc' | 'desc' } | null

interface SortHeaderProps<T extends string> {
  label: string
  column: T
  activeColumn: T | null
  direction: 'asc' | 'desc'
  onSort: (col: T) => void
  onClear?: () => void
}

export function SortHeader<T extends string>({
  label, column, activeColumn, direction, onSort, onClear,
}: SortHeaderProps<T>) {
  const isActive = activeColumn === column

  return (
    <button
      onClick={() => onSort(column)}
      onDoubleClick={() => onClear?.()}
      className="flex items-center gap-1.5 cursor-pointer hover:text-slate-600 transition-colors group"
    >
      <span>{label}</span>
      {isActive ? (
        <Icon
          icon={direction === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          className="text-xs text-emerald-600"
        />
      ) : (
        <Icon icon="lucide:chevrons-up-down" className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
