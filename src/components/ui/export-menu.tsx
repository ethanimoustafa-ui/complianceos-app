'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

export interface ExportOption {
  /** Localised label shown in the dropdown (e.g. t('common.exportCsv')) */
  label: string
  /** Optional Iconify icon name — defaults to lucide:file */
  icon?: string
  /** Called when the user selects this option */
  onSelect: () => void
  /** When true, shows a spinner and disables the item */
  loading?: boolean
}

interface ExportMenuProps {
  /** The format options to show. Pass only the formats the page supports. */
  options: ExportOption[]
  /** Extra classes on the trigger button wrapper */
  className?: string
  /** Button size — matches the app Button sizes */
  size?: 'sm' | 'md'
  /**
   * When true the trigger is rendered as a compact icon-only button
   * (matching the bare icon buttons used in audits/risks headers).
   * When false (default) renders an outline Button with "Export" label.
   */
  iconOnly?: boolean
}

/**
 * ExportMenu — a single "Export" trigger that opens a small dropdown listing
 * the available export formats. Replaces the pattern of having separate
 * "Export CSV" and "Export PDF" buttons on every page.
 *
 * Usage:
 * ```tsx
 * <ExportMenu
 *   options={[
 *     { label: t('common.exportCsv'), icon: 'lucide:table', onSelect: handleCsvExport },
 *     { label: t('common.exportPdf'), icon: 'lucide:file-text', onSelect: handlePdfExport, loading: pdfBusy },
 *   ]}
 * />
 * ```
 */
export function ExportMenu({ options, className, size = 'md', iconOnly = false }: ExportMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])

  // Position the portal-rendered dropdown relative to the trigger
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const DROPDOWN_HEIGHT = 44 * options.length + 16 // approx item height + padding
    const spaceBelow = viewportHeight - rect.bottom
    const flipUp = spaceBelow < DROPDOWN_HEIGHT && rect.top > DROPDOWN_HEIGHT
    setDropdownStyle({
      position: 'fixed',
      ...(flipUp
        ? { bottom: viewportHeight - rect.top + 4, top: 'auto' }
        : { top: rect.bottom + 4, bottom: 'auto' }),
      // Align dropdown right edge with trigger right edge
      left: rect.right - Math.max(rect.width, 180),
      width: Math.max(rect.width, 180),
      zIndex: 9999,
    })
  }, [open, options.length])

  // Close on outside click and Escape
  useEffect(() => {
    if (!open) return
    const openedAt = Date.now()
    const handleMouseDown = (e: MouseEvent) => {
      if (Date.now() - openedAt < 150) return
      const target = e.target as Node
      const insideTrigger = triggerRef.current?.contains(target) ?? false
      const insideDropdown = dropdownRef.current?.contains(target) ?? false
      if (!insideTrigger && !insideDropdown) setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const anyLoading = options.some((o) => o.loading)

  const padY = size === 'sm' ? 'py-1.5' : 'py-2'
  const padX = size === 'sm' ? 'px-3' : 'px-4'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div ref={triggerRef} className={cn('relative inline-block', className)}>
      {iconOnly ? (
        // Compact icon-only variant — matches the bare icon buttons in audits/risks
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={anyLoading}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer',
            anyLoading && 'opacity-50 cursor-not-allowed',
          )}
          title={t('common.download' as TranslationKey)}
        >
          <Icon
            icon={anyLoading ? 'lucide:loader-2' : 'lucide:download'}
            className={cn('text-lg', anyLoading && 'animate-spin')}
          />
        </button>
      ) : (
        // Full labelled outline button variant
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={anyLoading}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all cursor-pointer',
            'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500',
            'disabled:pointer-events-none disabled:opacity-50',
            padX,
            padY,
            textSize,
          )}
        >
          {anyLoading ? (
            <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />
          ) : (
            <Icon icon="lucide:download" className="w-4 h-4" />
          )}
          {t('common.download' as TranslationKey)}
          <Icon icon="lucide:chevron-down" className="w-3 h-3 text-slate-400" />
        </button>
      )}

      {open && mounted && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={dropdownStyle}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
          onWheel={(e) => e.stopPropagation()}
        >
          {options.map((option, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={option.loading}
              aria-busy={option.loading ?? undefined}
              onClick={() => {
                if (option.loading) return
                option.onSelect()
                setOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 text-left',
                'hover:bg-slate-50 transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                idx < options.length - 1 && 'border-b border-slate-100',
              )}
            >
              {option.loading ? (
                <Icon icon="lucide:loader-2" className="w-4 h-4 shrink-0 text-slate-400 animate-spin" />
              ) : (
                <Icon icon={option.icon ?? 'lucide:file'} className="w-4 h-4 shrink-0 text-slate-400" />
              )}
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
