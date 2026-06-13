'use client'

// Branded tooltip — replaces native `title=` hover hints with an on-brand
// bubble. Portal-rendered (like EditableSelect) so it escapes any modal /
// overflow-hidden / transform stacking-context ancestor that would clip a
// plain absolutely-positioned bubble.
//
// Usage:
//   <Tooltip content={t('…')}><button>…</button></Tooltip>
//   <HelpTip content={t('…')} />   // a standalone "?" help affordance

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** Preferred side; flips to the other side when there isn't room. */
  side?: 'top' | 'bottom'
  /** Class applied to the inline trigger wrapper. */
  className?: string
  /** Class applied to the bubble (e.g. to widen it). */
  bubbleClassName?: string
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  bubbleClassName,
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [placement, setPlacement] = useState<'top' | 'bottom'>(side)
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => setMounted(true), [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const GAP = 8
    // Flip below the trigger when there isn't ~120px of headroom above.
    const place: 'top' | 'bottom' = side === 'top' && rect.top < 120 ? 'bottom' : side
    setPlacement(place)
    setStyle({
      position: 'fixed',
      left: rect.left + rect.width / 2,
      transform: 'translateX(-50%)',
      ...(place === 'top'
        ? { bottom: window.innerHeight - rect.top + GAP, top: 'auto' }
        : { top: rect.bottom + GAP, bottom: 'auto' }),
      zIndex: 10000,
      maxWidth: 'min(20rem, calc(100vw - 16px))',
    })
  }, [open, side])

  return (
    <span
      ref={triggerRef}
      className={cn('inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open && content ? id : undefined}
    >
      {children}
      {open && mounted && content
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              style={style}
              className={cn(
                'pointer-events-none rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-xl ring-1 ring-black/5',
                bubbleClassName,
              )}
            >
              {content}
              <span
                className={cn(
                  'absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-slate-900',
                  placement === 'top' ? 'top-full -mt-1' : 'bottom-full -mb-1',
                )}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

/** Standalone "?" help affordance with a branded tooltip. */
export function HelpTip({
  content,
  className,
  icon = 'lucide:help-circle',
}: {
  content: ReactNode
  className?: string
  icon?: string
}) {
  return (
    <Tooltip content={content}>
      <Icon
        icon={icon}
        className={cn('cursor-help text-sm text-slate-400 hover:text-slate-600', className)}
      />
    </Tooltip>
  )
}
