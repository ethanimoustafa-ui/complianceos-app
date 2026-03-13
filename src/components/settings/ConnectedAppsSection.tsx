'use client'

import { Icon } from '@iconify/react'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/i18n'

const integrations = [
  { name: 'Jira', icon: 'logos:jira' },
  { name: 'Drive', icon: 'logos:google-drive' },
  { name: 'Slack', icon: 'logos:slack-icon' },
  { name: 'GitHub', icon: 'logos:github-icon' },
]

export function ConnectedAppsSection() {
  const { t } = useTranslation()

  return (
    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative">
      <h2 className="text-lg font-bold text-slate-900 font-display mb-1">{t('settings.connectedApps')}</h2>
      <p className="text-sm text-slate-500 mb-6">{t('settings.syncData')}</p>

      {/* Frosted overlay */}
      <div className="absolute inset-0 rounded-2xl bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3">
        <Badge variant="neutral" className="text-sm font-bold text-slate-500 border-slate-300 px-4 py-1.5">
          {t('settings.comingSoon')}
        </Badge>
        <p className="text-xs text-slate-400 max-w-[200px] text-center">{t('settings.integrationsComingSoonNote')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {integrations.map((int) => (
          <div
            key={int.name}
            className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-3"
          >
            <Icon icon={int.icon} className="text-xl" />
            <span className="text-xs font-bold">{int.name}</span>
          </div>
        ))}
      </div>
      <div className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 text-center">
        {t('settings.viewMarketplace')}
      </div>
    </section>
  )
}
