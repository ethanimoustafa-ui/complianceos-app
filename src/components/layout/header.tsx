'use client'

import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
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

      <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        {/* Search */}
        <div className={`hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:search" className="text-slate-400" />
          <input
            type="text"
            placeholder={t('common.searchRecords')}
            className={`bg-transparent border-none text-sm focus:outline-none text-slate-600 w-48 ${isRTL ? 'text-right' : ''}`}
          />
        </div>

        {/* Export Button */}
        <button className={`bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:download" />
          {t('common.exportCsv')}
        </button>
      </div>
    </header>
  )
}
