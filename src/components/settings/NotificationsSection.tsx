'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useTranslation } from '@/i18n'
import type { NotificationModule, NotificationEvent, NotificationScope } from '@/types'

const MODULE_CONFIG: { key: NotificationModule; icon: string; labelKey: string }[] = [
  { key: 'rules', icon: 'lucide:scroll-text', labelKey: 'settings.moduleRules' },
  { key: 'policies', icon: 'lucide:file-text', labelKey: 'settings.modulePolicies' },
  { key: 'audits', icon: 'lucide:clipboard-check', labelKey: 'settings.moduleAudits' },
  { key: 'observations', icon: 'lucide:eye', labelKey: 'settings.moduleObservations' },
  { key: 'samaLetters', icon: 'lucide:mail', labelKey: 'settings.moduleSamaLetters' },
  { key: 'training', icon: 'lucide:graduation-cap', labelKey: 'settings.moduleTraining' },
]

const EVENT_CONFIG: { key: NotificationEvent; icon: string; labelKey: string }[] = [
  { key: 'dueDates', icon: 'lucide:calendar-clock', labelKey: 'settings.eventDueDates' },
  { key: 'criticalAlerts', icon: 'lucide:alert-triangle', labelKey: 'settings.eventCriticalAlerts' },
  { key: 'approvalRequests', icon: 'lucide:check-circle', labelKey: 'settings.eventApprovalRequests' },
  { key: 'overdueItems', icon: 'lucide:clock', labelKey: 'settings.eventOverdueItems' },
  { key: 'statusChanges', icon: 'lucide:refresh-cw', labelKey: 'settings.eventStatusChanges' },
]

const SCOPE_OPTIONS: { key: NotificationScope; labelKey: string }[] = [
  { key: 'own', labelKey: 'settings.scopeOwn' },
  { key: 'managed', labelKey: 'settings.scopeManaged' },
  { key: 'all', labelKey: 'settings.scopeAll' },
]

export function NotificationsSection() {
  const { t } = useTranslation()
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const {
    notificationPreferences,
    toggleModuleNotification,
    toggleEventNotification,
    setNotificationScope,
    setEmailDigest,
    setEmailDigestAddress,
  } = useUserPreferencesStore()

  const enabledModules = useMemo(
    () => Object.values(notificationPreferences.modules).filter(Boolean).length,
    [notificationPreferences.modules]
  )
  const enabledEvents = useMemo(
    () => Object.values(notificationPreferences.events).filter(Boolean).length,
    [notificationPreferences.events]
  )
  const notificationsEnabled = enabledModules > 0 || enabledEvents > 0

  function handleMasterToggle() {
    // Toggle all modules and events on/off
    const allOn = enabledModules === 6 && enabledEvents === 5
    for (const { key } of MODULE_CONFIG) {
      if (allOn === notificationPreferences.modules[key]) toggleModuleNotification(key)
    }
    for (const { key } of EVENT_CONFIG) {
      if (allOn === notificationPreferences.events[key]) toggleEventNotification(key)
    }
  }

  return (
    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 font-display mb-1">{t('settings.notifications')}</h2>
      <p className="text-sm text-slate-500 mb-6">{t('settings.manageAlerts')}</p>

      <div className="space-y-5">
        {/* Master enable toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Icon icon="lucide:bell" className="text-xl text-slate-400" />
            <div>
              <p className="text-sm font-bold text-slate-900">{t('settings.enableNotifications')}</p>
              <p className="text-xs text-slate-500">
                {notificationsEnabled
                  ? t('settings.notificationsActiveCount', { modules: String(enabledModules), events: String(enabledEvents) })
                  : t('settings.notificationsDisabledHint')}
              </p>
            </div>
          </div>
          <button
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
              notificationsEnabled ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
            onClick={handleMasterToggle}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                notificationsEnabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Configure button */}
        {notificationsEnabled && (
          <button
            onClick={() => setIsConfigOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer w-full justify-center"
          >
            <Icon icon="lucide:settings" className="text-base" />
            {t('settings.configureNotifications')}
          </button>
        )}

        {/* Email Digest */}
        <ToggleRow
          icon="lucide:mail"
          title={t('settings.emailDigests')}
          description={t('settings.emailDigestsDescription')}
          isOn={notificationPreferences.emailDigestEnabled}
          onToggle={() => setEmailDigest(!notificationPreferences.emailDigestEnabled)}
        />
        {notificationPreferences.emailDigestEnabled && (
          <div className="ms-10 space-y-2">
            <input
              type="email"
              value={notificationPreferences.emailDigestAddress}
              onChange={(e) => setEmailDigestAddress(e.target.value)}
              placeholder={t('settings.emailDigestAddressPlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <p className="text-[11px] text-slate-400 italic">{t('settings.emailNotConnectedNote')}</p>
          </div>
        )}

        {/* Slack */}
        <div className="relative">
          <ToggleRow
            icon="lucide:message-square"
            title={t('settings.slackIntegration')}
            description={t('settings.slackIntegrationDescription')}
            isOn={false}
            onToggle={() => {}}
            disabled
          />
          <div className="absolute end-0 top-0">
            <Badge variant="neutral" className="text-[10px] font-bold text-slate-400 border-slate-200">
              {t('settings.comingLater')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Configure Notifications Modal */}
      <Modal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title={t('settings.configureNotifications')}
        subtitle={t('settings.chooseNotifications')}
        size="md"
      >
        <div className="space-y-8 max-h-[65vh] overflow-y-auto pe-1">
          {/* Modules — What to notify about */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3">{t('settings.whatToNotify')}</h3>
            <div className="space-y-2">
              {MODULE_CONFIG.map(({ key, icon, labelKey }) => (
                <ToggleRow
                  key={key}
                  icon={icon}
                  title={t(labelKey as any)}
                  isOn={notificationPreferences.modules[key]}
                  onToggle={() => toggleModuleNotification(key)}
                />
              ))}
            </div>
          </div>

          {/* Events — When to notify */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3">{t('settings.whenToNotify')}</h3>
            <div className="space-y-2">
              {EVENT_CONFIG.map(({ key, icon, labelKey }) => (
                <ToggleRow
                  key={key}
                  icon={icon}
                  title={t(labelKey as any)}
                  isOn={notificationPreferences.events[key]}
                  onToggle={() => toggleEventNotification(key)}
                />
              ))}
            </div>
          </div>

          {/* Scope — Whose items */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3">{t('settings.whoseItems')}</h3>
            <div className="flex gap-3 flex-wrap">
              {SCOPE_OPTIONS.map(({ key, labelKey }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl cursor-pointer transition-colors ${
                    notificationPreferences.scope === key
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="notificationScope"
                    checked={notificationPreferences.scope === key}
                    onChange={() => setNotificationScope(key)}
                    className="accent-emerald-500"
                  />
                  <span className="text-sm font-medium">{t(labelKey as any)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <Button variant="primary" className="w-full" onClick={() => setIsConfigOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function ToggleRow({
  icon,
  title,
  description,
  isOn,
  onToggle,
  disabled,
}: {
  icon: string
  title: string
  description?: string
  isOn: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-4">
        <Icon icon={icon} className="text-xl text-slate-400" />
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      <button
        disabled={disabled}
        className={`w-9 h-5 rounded-full relative transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${
          isOn ? 'bg-emerald-500' : 'bg-slate-200'
        }`}
        onClick={onToggle}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            isOn ? 'left-4' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
