'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useTranslation } from '@/i18n'
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
              <select
                value={dashboardView}
                onChange={(e) => setDashboardView(e.target.value as DashboardView)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm"
              >
                <option value="executive">{t('settings.executiveView')}</option>
                <option value="managerial">{t('settings.managerialView')}</option>
                <option value="officer">{t('settings.officerView')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.timeZone')}
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.language')}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm"
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('settings.dateFormat')}
              </label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormatPreference)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
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
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.complianceManager')}</option>
              <option>{t('settings.auditor')}</option>
              <option>{t('settings.administrator')}</option>
            </select>
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
