'use client'

import { cn } from '@/lib/utils'

export interface FilterOption<T extends string> {
  value: T
  label: string
  color?: { bg: string; text: string; border: string; dot?: string }
}

interface MultiSelectFilterProps<T extends string> {
  label?: string
  options: FilterOption<T>[]
  selected: Set<T>
  onChange: (selected: Set<T>) => void
  showAllOption?: boolean
}

export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  showAllOption = false,
}: MultiSelectFilterProps<T>) {
  const allSelected = options.every(opt => selected.has(opt.value))
  const noneSelected = selected.size === 0

  const toggleAll = () => {
    if (allSelected) {
      onChange(new Set())
    } else {
      onChange(new Set(options.map(opt => opt.value)))
    }
  }

  const toggleOption = (value: T) => {
    const newSelected = new Set(selected)
    if (newSelected.has(value)) {
      newSelected.delete(value)
    } else {
      newSelected.add(value)
    }
    onChange(newSelected)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {label && (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">
          {label}:
        </span>
      )}
      {showAllOption && (
        <button
          onClick={toggleAll}
          className={cn(
            'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
            allSelected
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          )}
        >
          All
        </button>
      )}
      {options.map((option) => {
        const isSelected = selected.has(option.value)
        const color = option.color

        return (
          <button
            key={option.value}
            onClick={() => toggleOption(option.value)}
            className={cn(
              'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer flex items-center gap-1.5',
              isSelected
                ? color
                  ? cn(color.bg, color.text, color.border)
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
            )}
          >
            {color?.dot && isSelected && (
              <span className={cn('w-1.5 h-1.5 rounded-full', color.dot)} />
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
