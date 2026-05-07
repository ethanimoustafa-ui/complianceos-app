'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { validateChildDeadline, isOverdue } from '@/lib/deadline-validation'

interface InlineDeadlinePickerProps {
  value: string | undefined           // YYYY-MM-DD
  onChange: (next: string | undefined) => boolean | void  // return false to reject (validation failure)
  parentDeadline?: string | undefined
  label?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function InlineDeadlinePicker({
  value,
  onChange,
  parentDeadline,
  label = 'Deadline',
  disabled = false,
  size = 'sm',
}: InlineDeadlinePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setError(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const submit = () => {
    const next = draft || undefined
    const validation = validateChildDeadline(next, parentDeadline)
    if (!validation.ok) {
      setError(
        validation.reason === 'after-parent'
          ? `Cannot be after parent deadline (${parentDeadline ?? 'unknown'})`
          : 'Invalid date',
      )
      return
    }
    const result = onChange(next)
    if (result === false) return
    setOpen(false)
    setError(null)
  }

  const clear = () => {
    setDraft('')
    onChange(undefined)
    setOpen(false)
    setError(null)
  }

  const triggerPad = size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
  const overdue = isOverdue(value)

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 font-bold rounded-full border transition-all',
          triggerPad,
          value
            ? overdue
              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 border-dashed',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer',
        )}
      >
        <Icon icon={value ? 'lucide:calendar-clock' : 'lucide:calendar-plus'} className="text-[11px]" />
        {value ? value : `+ ${label}`}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
          <input
            type="date"
            value={draft}
            max={parentDeadline}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {parentDeadline && (
            <p className="text-[10px] text-slate-400 mt-1">Must be ≤ {parentDeadline}</p>
          )}
          {error && <p className="text-[10px] text-rose-600 mt-1">{error}</p>}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={submit}
              className="flex-1 px-2 py-1.5 text-[10px] font-bold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 cursor-pointer"
            >
              Save
            </button>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="px-2 py-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 rounded-md hover:bg-rose-100 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              className="px-2 py-1.5 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
