'use client'

// Branded "coming soon" state for the Help Center. Shown while
// HELP_CENTER_ENABLED is false (see src/config/help-center.ts +
// docs/help-center/README.md). Matches the HelpPanel slide-in shell.

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

interface Props {
  onClose: () => void
  isRTL?: boolean
}

export function HelpComingSoon({ onClose, isRTL = false }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full ${isRTL ? 'me-auto animate-slide-in-left' : 'ms-auto animate-slide-in-right'}`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">{t('sidebar.helpCenter')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <Icon icon="lucide:x" className="text-2xl" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-5">
            <Icon icon="lucide:life-buoy" className="text-4xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            {t('sidebar.helpComingSoonTitle' as TranslationKey)}
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
            {t('sidebar.helpComingSoonBody' as TranslationKey)}
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            <Icon icon="lucide:clock" className="text-xs" />
            {t('settings.comingSoon' as TranslationKey)}
          </span>
        </div>
      </div>
    </div>
  )
}
