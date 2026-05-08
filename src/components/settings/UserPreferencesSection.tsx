'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useTranslation } from '@/i18n'
import { EditableSelect } from '@/components/ui/editable-select'
import type { DashboardView, DateFormatPreference } from '@/types'

const TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Jeddah',
  'Asia/Dubai',
  'Asia/Bahrain',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Baghdad',
  'Africa/Cairo',
  'Europe/Istanbul',
  'Europe/London',
  'UTC',
]

export function UserPreferencesSection() {
  const { t, language, setLanguage } = useTranslation()
  const {
    dashboardView,
    timezone,
    dateFormat,
    setDashboardView,
    setTimezone,
    setDateFormat,
  } = useUserPreferencesStore()

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [profileRole, setProfileRole] = useState<'compliance-manager' | 'auditor' | 'administrator'>('compliance-manager')

  return (
    <>
      <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.userPreferences')}</h2>
            <p className="text-sm text-slate-500">{t('settings.customizeWorkspace')}</p>
          </div>
          <Button variant="outline" onClick={() => setIsProfileModalOpen(true)}>
            <Icon icon="lucide:user" />
            {t('sidebar.editProfile')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.defaultDashboardView')}
              </label>
              <EditableSelect
                locked
                value={dashboardView}
                onChange={(id) => setDashboardView(id as DashboardView)}
                items={[
                  { id: 'executive', label: t('settings.executiveView') },
                  { id: 'managerial', label: t('settings.managerialView') },
                  { id: 'officer', label: t('settings.officerView') },
                ]}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.timeZone')}
              </label>
              <EditableSelect
                locked
                value={timezone}
                onChange={(id) => setTimezone(id)}
                items={TIMEZONES.map((tz) => ({ id: tz, label: tz }))}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.language')}
              </label>
              <EditableSelect
                locked
                value={language}
                onChange={(id) => setLanguage(id as 'en' | 'ar')}
                items={[
                  { id: 'en', label: 'English' },
                  { id: 'ar', label: 'العربية' },
                ]}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.dateFormat')}
              </label>
              <EditableSelect
                locked
                value={dateFormat}
                onChange={(id) => setDateFormat(id as DateFormatPreference)}
                items={[
                  { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                  { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Profile Edit Modal */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title={t('settings.profileSettings')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 pb-4">
            <div className="relative group">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                alt="User"
                className="w-24 h-24 rounded-full border-4 border-slate-200 group-hover:border-emerald-400 transition-all duration-200"
              />
              <button className="absolute bottom-0 right-0 bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-full shadow-lg transition-all duration-200 cursor-pointer">
                <Icon icon="lucide:camera" className="text-lg" />
              </button>
            </div>
            <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer">
              {t('sidebar.changeAvatar')}
            </button>
          </div>
          <Input label={t('sidebar.fullName')} defaultValue="Felix Anderson" />
          <Input label={t('sidebar.emailAddress')} type="email" defaultValue="felix@complianceos.io" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('sidebar.role')}</label>
            <EditableSelect
              locked
              value={profileRole}
              onChange={(id) => setProfileRole(id as typeof profileRole)}
              items={[
                { id: 'compliance-manager', label: t('settings.complianceManager') },
                { id: 'auditor', label: t('settings.auditor') },
                { id: 'administrator', label: t('settings.administrator') },
              ]}
            />
          </div>
          <Input label={t('sidebar.department')} defaultValue="Risk & Compliance" />
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsProfileModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsProfileModalOpen(false)}>
              {t('common.saveChanges')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
