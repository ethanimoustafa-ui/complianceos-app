'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { PlaceholderDef, PlaceholderValue } from '@/types'
import { formatRef } from '@/lib/letter-placeholders'
import { PlaceholderPicker } from './PlaceholderPicker'
import { useTranslation } from '@/i18n'

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
  const { t, language } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideRoot = rootRef.current?.contains(target)
      const insidePopover = popoverRef.current?.contains(target)
      if (!insideRoot && !insidePopover) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Compute fixed-position coords each time the popover opens. Using
  // `position: fixed` lets the popover escape any `overflow:hidden` ancestor
  // (the chip lives in a contenteditable region with hidden overflow).
  useLayoutEffect(() => {
    if (!open) return
    if (!triggerRef.current) return
    const POPOVER_WIDTH = 288 // 18rem max
    const compute = () => {
      const node = triggerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const top = rect.bottom + 4
      const left = isRTL
        ? Math.max(8, rect.right - POPOVER_WIDTH)
        : Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)
      setPopPos({ top, left })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, isRTL])

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
        ref={triggerRef}
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
            title={t('placeholderPicker.clear')}
          >
            <Icon icon="lucide:x" className={size === 'sm' ? 'text-[10px]' : 'text-xs'} />
          </span>
        )}
      </button>

      {open && popPos && (
        <span
          ref={popoverRef}
          className="z-[60] min-w-[260px] max-w-[320px]"
          style={{
            position: 'fixed',
            top: popPos.top,
            left: popPos.left,
            width: 288,
          }}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
        >
          <span className="block bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-normal break-words">
              {def.label}{' '}
              <code className="ms-1 text-[10px] text-slate-400 font-mono break-all">{`{{${def.key}}}`}</code>
            </span>
            <PlaceholderPicker
              def={def}
              value={value}
              onChange={(v) => {
                onChange(v)
                // Only date and reference exist now — both are discrete
                // picks, so always auto-close.
                setOpen(false)
              }}
            />
            <span className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                {t('placeholderPicker.done')}
              </button>
            </span>
          </span>
        </span>
      )}
    </span>
  )
}
