'use client'

import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { FrameworksSection } from '@/components/settings/FrameworksSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'
import { ConnectedAppsSection } from '@/components/settings/ConnectedAppsSection'
import { UserPreferencesSection } from '@/components/settings/UserPreferencesSection'
import { AuditTemplatesSection } from '@/components/settings/AuditTemplatesSection'
import { PolicyTemplatesSection } from '@/components/settings/PolicyTemplatesSection'
import { ListsAndCategoriesSection } from '@/components/settings/ListsAndCategoriesSection'

export default function SettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('settings.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('settings.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 me-4 text-slate-400">
            <span className="text-xs font-bold uppercase tracking-widest">{t('common.autoSaveActive')}</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <Button variant="primary" className="shadow-lg shadow-emerald-100">
            <Icon icon="lucide:save" />
            {t('common.saveChanges')}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        <div className="max-w-6xl mx-auto space-y-10">
          <FrameworksSection />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <NotificationsSection />
            <ConnectedAppsSection />
          </div>

          <UserPreferencesSection />
          <AuditTemplatesSection />
          <PolicyTemplatesSection />
          <ListsAndCategoriesSection />
        </div>
      </div>
    </>
  )
}
