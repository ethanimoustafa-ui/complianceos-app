'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { useTranslation } from '@/i18n'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { ExecutiveView } from '@/components/dashboard/ExecutiveView'
import { ManagerialView } from '@/components/dashboard/ManagerialView'
import { OfficerView } from '@/components/dashboard/OfficerView'
import type { DashboardView } from '@/types'

const viewConfig: Record<DashboardView, { titleKey: string; subtitleKey: string }> = {
  executive: { titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  managerial: { titleKey: 'dashboard.titleManagerial', subtitleKey: 'dashboard.subtitleManagerial' },
  officer: { titleKey: 'dashboard.titleOfficer', subtitleKey: 'dashboard.subtitleOfficer' },
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const dashboardView = useUserPreferencesStore(s => s.dashboardView)
  const setDashboardView = useUserPreferencesStore(s => s.setDashboardView)
  const metrics = useDashboardMetrics()

  const [showFadeIn, setShowFadeIn] = useState(false)

  useEffect(() => {
    const fromWelcome = sessionStorage.getItem('fromWelcome')
    if (fromWelcome) {
      setShowFadeIn(true)
      sessionStorage.removeItem('fromWelcome')
    }
  }, [])

  const { titleKey, subtitleKey } = viewConfig[dashboardView]

  return (
    <div className={showFadeIn ? 'dashboard-fade-in' : ''}>
      <Header title={t(titleKey as any)} subtitle={t(subtitleKey as any)} />

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* View Switcher */}
        <div className="flex items-center justify-end mb-6">
          <div className="inline-flex bg-slate-100 rounded-lg p-1 gap-1">
            {(['executive', 'managerial', 'officer'] as DashboardView[]).map(view => (
              <button
                key={view}
                onClick={() => setDashboardView(view)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  dashboardView === view
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`dashboard.view${view.charAt(0).toUpperCase() + view.slice(1)}` as any)}
              </button>
            ))}
          </div>
        </div>

        {dashboardView === 'executive' && <ExecutiveView metrics={metrics} />}
        {dashboardView === 'managerial' && <ManagerialView metrics={metrics} />}
        {dashboardView === 'officer' && <OfficerView metrics={metrics} />}
      </div>
    </div>
  )
}
