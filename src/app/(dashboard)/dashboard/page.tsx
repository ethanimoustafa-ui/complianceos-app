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
        {dashboardView === 'executive' && <ExecutiveView metrics={metrics} />}
        {dashboardView === 'managerial' && <ManagerialView metrics={metrics} />}
        {dashboardView === 'officer' && <OfficerView metrics={metrics} />}
      </div>
    </div>
  )
}
