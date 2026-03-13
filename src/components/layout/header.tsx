'use client'

import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface HeaderProps {
  title: string
  subtitle?: string
  onExport?: () => void
  exportLabel?: string
}

export function Header({ title, subtitle, onExport, exportLabel }: HeaderProps) {
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

      {onExport && (
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={onExport}
            className={`bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <Icon icon="lucide:download" />
            {exportLabel || t('common.exportCsv')}
          </button>
        </div>
      )}
    </header>
  )
}
