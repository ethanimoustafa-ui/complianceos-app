'use client'

import Link from 'next/link'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { APP_VERSION } from '@/lib/version'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t, language, toggleLanguage, isRTL } = useTranslation()

  return (
    <div className="min-h-screen bg-white" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50">
        <div className={`max-w-7xl mx-auto px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <Link href="/" className={`flex items-center gap-3 group`}>
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
                <Icon icon="lucide:shield-check" className="text-white text-2xl" />
              </div>
              <span className="text-xl font-display font-bold text-slate-900">ComplianceOS</span>
            </Link>
            {/* Build-stage badge — also shown compactly in the app sidebar. */}
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 whitespace-nowrap">
              {t('common.alphaVersion', { version: APP_VERSION })}
            </span>
          </div>

          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer`}
          >
            <Icon icon="lucide:globe" className="text-lg" />
            <span>{language === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-20 min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-4">
        <div className={`max-w-7xl mx-auto px-6 flex items-center justify-between text-sm`}>
          <p className="text-slate-500">© 2026 ComplianceOS. {t('auth.allRightsReserved')}</p>
          {/* Legal pages aren't published yet — greyed out, non-interactive. */}
          <div className={`flex items-center gap-6`}>
            <span
              className="text-slate-300 cursor-not-allowed select-none"
              title={t('common.comingSoon')}
              aria-disabled="true"
            >
              {t('auth.privacyPolicy')}
            </span>
            <span
              className="text-slate-300 cursor-not-allowed select-none"
              title={t('common.comingSoon')}
              aria-disabled="true"
            >
              {t('auth.termsOfService')}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
