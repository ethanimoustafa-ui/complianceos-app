'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { PlaceholderDef, PlaceholderValue } from '@/types'
import { formatRef } from '@/lib/letter-placeholders'
import { PlaceholderPicker } from './PlaceholderPicker'

interface PlaceholderChipProps {
  def: PlaceholderDef
  value?: PlaceholderValue
  onChange: (next: PlaceholderValue) => void
  onClear?: () => void
  // RTL flag — chips inside Arabic body need their popover anchored on the
  // opposite side. Caller (CreateLetterForm) flips this for the AR side.
  isRTL?: boolean
  // 'body' | 'subject' — affects sizing only.
  size?: 'sm' | 'md'
}

// Inline @-mention-style chip that represents a single {{token}} in the
// rendered letter view. Click → popover with the existing PlaceholderPicker
// content. Storage stays as `{{token}}` plus the placeholderValues map.
export function PlaceholderChip({
  def,
  value,
  onChange,
  onClear,
  isRTL = false,
  size = 'md',
}: PlaceholderChipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filled = !!value && (
    (value.type === 'reference' && !!value.value?.id) ||
    (value.type !== 'reference' && !!value.value)
  )

  const display = (() => {
    if (!value) return null
    if (value.type === 'reference') {
      return value.value ? formatRef(value.value) : null
    }
    return value.value || null
  })()

  const sizeCls = size === 'sm'
    ? 'px-2 py-0.5 text-[11px]'
    : 'px-2.5 py-1 text-xs'

  return (
    <span ref={rootRef} className="relative inline-flex align-baseline" dir="ltr">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-medium transition-all cursor-pointer max-w-full',
          sizeCls,
          filled
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
            : 'bg-amber-50 text-amber-800 border border-dashed border-amber-400 hover:bg-amber-100',
        )}
        title={def.label}
      >
        <Icon
          icon={filled ? 'lucide:check' : 'lucide:edit-3'}
          className={cn('shrink-0', size === 'sm' ? 'text-[10px]' : 'text-xs')}
        />
        <span className="truncate">
          {filled ? display : `{{${def.key}}}`}
        </span>
        {filled && onClear && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="ms-0.5 opacity-60 hover:opacity-100 cursor-pointer"
            title="Clear"
          >
            <Icon icon="lucide:x" className={size === 'sm' ? 'text-[10px]' : 'text-xs'} />
          </span>
        )}
      </button>

      {open && (
        <span
          className={cn(
            'absolute z-50 top-full mt-1 w-72',
            isRTL ? 'right-0' : 'left-0',
          )}
          // Popovers should always render LTR for picker controls regardless of body dir.
          dir="ltr"
        >
          <span className="block bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {def.label}{' '}
              <code className="ms-1 text-[10px] text-slate-400 font-mono">{`{{${def.key}}}`}</code>
            </span>
            <PlaceholderPicker
              def={def}
              value={value}
              onChange={(v) => {
                onChange(v)
                if (def.type !== 'text') {
                  // Auto-close after a discrete pick (date/reference);
                  // text input stays open so the user can keep typing.
                  setOpen(false)
                }
              }}
            />
            <span className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Done
              </button>
            </span>
          </span>
        </span>
      )}
    </span>
  )
}
