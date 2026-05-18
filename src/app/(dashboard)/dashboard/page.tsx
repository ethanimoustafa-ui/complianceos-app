'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { useTranslation } from '@/i18n'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { ExecutiveView } from '@/components/dashboard/ExecutiveView'
import { ManagerialView } from '@/components/dashboard/ManagerialView'
import { OfficerView } from '@/components/dashboard/OfficerView'
import {
  ExecutiveSkeleton,
  ManagerialSkeleton,
  OfficerSkeleton,
} from '@/components/dashboard/DashboardSkeletons'
import { generateDashboardPdf } from '@/lib/dashboard-pdf'
import type { DashboardView } from '@/types'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useLetterStore } from '@/stores/letter-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTeamStore } from '@/stores/team-store'


const viewConfig: Record<DashboardView, { titleKey: string; subtitleKey: string }> = {
  executive: { titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  managerial: { titleKey: 'dashboard.titleManagerial', subtitleKey: 'dashboard.subtitleManagerial' },
  officer: { titleKey: 'dashboard.titleOfficer', subtitleKey: 'dashboard.subtitleOfficer' },
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const dashboardView = useUserPreferencesStore(s => s.dashboardView)
  const metrics = useDashboardMetrics()

  // Hydrate every store the dashboard aggregates (Fix-1). Without this, all
  // KPI cards render zeros on a fresh load until the user clicks elsewhere.
  const fetchAudits = useAuditStore((s) => s.fetchAll)
  const fetchObservations = useObservationStore((s) => s.fetchAll)
  const fetchRisks = useRiskStore((s) => s.fetchAll)
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  const fetchTrainings = useTrainingStore((s) => s.fetchAll)
  const fetchEmployees = useTrainingStore((s) => s.fetchEmployees)
  const fetchCourses = useTrainingStore((s) => s.fetchCourses)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const fetchCorrespondence = useCorrespondenceStore((s) => s.fetchAll)
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchAudits()
    void fetchObservations()
    void fetchRisks()
    void fetchPolicies()
    void fetchTrainings()
    void fetchEmployees()
    void fetchCourses()
    void fetchLetters()
    void fetchCorrespondence()
    void fetchCirculars()
    void fetchTeam()
  }, [
    fetchAudits,
    fetchObservations,
    fetchRisks,
    fetchPolicies,
    fetchTrainings,
    fetchEmployees,
    fetchCourses,
    fetchLetters,
    fetchCorrespondence,
    fetchCirculars,
    fetchTeam,
  ])

  const [showFadeIn, setShowFadeIn] = useState(false)

  useEffect(() => {
    const fromWelcome = sessionStorage.getItem('fromWelcome')
    if (fromWelcome) {
      setShowFadeIn(true)
      sessionStorage.removeItem('fromWelcome')
    }
  }, [])

  const handleExport = useCallback(() => {
    generateDashboardPdf(metrics, dashboardView, t)
  }, [metrics, dashboardView, t])

  const { titleKey, subtitleKey } = viewConfig[dashboardView]

  // First-fetch detector. Dashboard widgets read from many stores, so we
  // treat the whole page as "still loading" until *any* of the headline
  // stores has hydrated (`lastFetched != null`). The auto-deduped `apiFetch`
  // means a stale store snapshot is still useful — once one resolves we
  // unwrap the skeleton and let individual widget empty states take over.
  const auditsLastFetched = useAuditStore((s) => s.lastFetched)
  const observationsLastFetched = useObservationStore((s) => s.lastFetched)
  const policiesLastFetched = usePolicyStore((s) => s.lastFetched)
  const risksLastFetched = useRiskStore((s) => s.lastFetched)
  const lettersLastFetched = useLetterStore((s) => s.lastFetched)
  const correspondenceLastFetched = useCorrespondenceStore((s) => s.lastFetched)
  const circularsLastFetched = useCircularStore((s) => s.lastFetched)
  const trainingLastFetched = useTrainingStore((s) => s.lastFetched)
  const teamLastFetched = useTeamStore((s) => s.lastFetched)

  const anyStoreReady =
    auditsLastFetched !== null ||
    observationsLastFetched !== null ||
    policiesLastFetched !== null ||
    risksLastFetched !== null ||
    lettersLastFetched !== null ||
    correspondenceLastFetched !== null ||
    circularsLastFetched !== null ||
    trainingLastFetched !== null ||
    teamLastFetched !== null

  return (
    <div className={showFadeIn ? 'dashboard-fade-in' : ''}>
      <Header title={t(titleKey as any)} subtitle={t(subtitleKey as any)} onExport={handleExport} exportLabel={t('common.exportPdf' as any)} />

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {!anyStoreReady ? (
          <>
            {dashboardView === 'executive' && <ExecutiveSkeleton />}
            {dashboardView === 'managerial' && <ManagerialSkeleton />}
            {dashboardView === 'officer' && <OfficerSkeleton />}
          </>
        ) : (
          <>
            {dashboardView === 'executive' && <ExecutiveView metrics={metrics} />}
            {dashboardView === 'managerial' && <ManagerialView metrics={metrics} />}
            {dashboardView === 'officer' && <OfficerView metrics={metrics} />}
          </>
        )}
      </div>
    </div>
  )
}
