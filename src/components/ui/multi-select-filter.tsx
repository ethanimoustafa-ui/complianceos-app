'use client'

import { useState } from 'react'
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
  allLabel?: string
  // W46: when provided, the chip's color dot opens a palette popover so each
  // user can recolor filter chips to taste (persistence is the caller's job).
  colorPalette?: Record<string, { dot: string; bg: string; text: string; border: string }>
  onColorChange?: (value: T, paletteKey: string) => void
}

export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  showAllOption = false,
  allLabel = 'All',
  colorPalette,
  onColorChange,
}: MultiSelectFilterProps<T>) {
  const allSelected = options.every(opt => selected.has(opt.value))
  const [paletteFor, setPaletteFor] = useState<T | null>(null)
  const colorable = Boolean(colorPalette && onColorChange)

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
          {allLabel}
        </button>
      )}
      {options.map((option) => {
        const isSelected = selected.has(option.value)
        const color = option.color

        return (
          <div key={option.value} className="relative">
            <button
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
                colorable ? (
                  <span
                    role="button"
                    aria-label={`${option.label} — color`}
                    title="Change color"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPaletteFor(paletteFor === option.value ? null : option.value)
                    }}
                    className={cn('w-2 h-2 rounded-full ring-offset-1 hover:ring-2 hover:ring-slate-300', color.dot)}
                  />
                ) : (
                  <span className={cn('w-1.5 h-1.5 rounded-full', color.dot)} />
                )
              )}
              {option.label}
            </button>
            {colorable && paletteFor === option.value && (
              <div
                className="absolute top-full mt-1.5 start-0 z-[90] bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1.5 w-max"
                onClick={(e) => e.stopPropagation()}
              >
                {Object.entries(colorPalette!).map(([key, c]) => (
                  <button
                    key={key}
                    title={key}
                    onClick={() => {
                      onColorChange!(option.value, key)
                      setPaletteFor(null)
                    }}
                    className={cn('w-5 h-5 rounded-full cursor-pointer hover:scale-110 transition-transform', c.dot)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
