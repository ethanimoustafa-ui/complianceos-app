'use client'

import { type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface HeaderProps {
  title: string
  subtitle?: string
  /** Legacy single-action export button (kept for back-compat). */
  onExport?: () => void
  exportLabel?: string
  /**
   * Optional slot rendered in the right area of the header.
   * Use this to inject an `<ExportMenu>` or any other action button
   * when `onExport` is too coarse.
   */
  exportSlot?: ReactNode
}

export function Header({ title, subtitle, onExport, exportLabel, exportSlot }: HeaderProps) {
  const { t, isRTL } = useTranslation()

  return (
    <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-8">
        <div>
          <h1 className="text-xl font-bold font-display text-slate-900">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {(exportSlot || onExport) && (
        <div className={`flex items-center gap-4`}>
          {exportSlot}
          {onExport && !exportSlot && (
            <button
              onClick={onExport}
              className={`bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all cursor-pointer`}
            >
              <Icon icon="lucide:download" />
              {exportLabel || t('common.exportCsv')}
            </button>
          )}
        </div>
      )}
    </header>
  )
}
