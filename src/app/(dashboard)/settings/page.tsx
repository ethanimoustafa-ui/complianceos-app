'use client'

import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { FrameworksSection } from '@/components/settings/FrameworksSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'
import { ConnectedAppsSection } from '@/components/settings/ConnectedAppsSection'
import { UserPreferencesSection } from '@/components/settings/UserPreferencesSection'
// Configurables hub — folds in Audit/Policy Templates, Approval Tiers,
// Departments, and Observation Sources (each opens as a modal).
import { ListsAndCategoriesSection } from '@/components/settings/ListsAndCategoriesSection'
import { Gate } from '@/components/auth/gate'

export default function SettingsPage() {
  const { t } = useTranslation()

  // Settings is open to EVERY signed-in user — the personal sections (preferences,
  // notifications, connected apps) always render. Each ADMIN/CONFIG surface gates
  // on its OWN capability label instead of a blanket "Manage Settings" wall:
  //   • Frameworks (incl. the company compliance threshold) → "Configure Frameworks"
  //   • Configurables hub (lists/categories/templates/tiers/departments)
  //       → self-gates internally on "Configure Lists & Categories"
  // So an officer with neither still sees their personal preferences; granting
  // just "Configure Frameworks" reveals only the frameworks card, etc.
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

        {/* W44: the "Save Changes" button was dead UI (no onClick — every
            section auto-saves). The auto-save indicator is the truth. */}
        <div className="flex items-center gap-4 text-slate-400">
          <span className="text-xs font-bold uppercase tracking-widest">{t('common.autoSaveActive')}</span>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        <div className="max-w-6xl mx-auto space-y-10">
          {/* Framework access (+ the overall business compliance threshold) is its
              own toggleable capability — hidden entirely without it. */}
          <Gate perm="Configure Frameworks">
            <FrameworksSection />
          </Gate>

          {/* Personal preferences — always available to everyone. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <NotificationsSection />
            <ConnectedAppsSection />
          </div>

          <UserPreferencesSection />

          {/* Configurables hub self-gates on "Configure Lists & Categories". */}
          <ListsAndCategoriesSection />
        </div>
      </div>
    </>
  )
}
