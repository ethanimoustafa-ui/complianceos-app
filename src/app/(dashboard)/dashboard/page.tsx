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
import { downloadPdf } from '@/lib/pdf-client'
import { toComplianceReportData } from '@/lib/compliance-report-data'
import { ExportMenu } from '@/components/ui/export-menu'
import { pushToast } from '@/stores/toast-store'
import type { DashboardView } from '@/types'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'


const viewConfig: Record<DashboardView, { titleKey: string; subtitleKey: string }> = {
  executive: { titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  managerial: { titleKey: 'dashboard.titleManagerial', subtitleKey: 'dashboard.subtitleManagerial' },
  officer: { titleKey: 'dashboard.titleOfficer', subtitleKey: 'dashboard.subtitleOfficer' },
}

export default function DashboardPage() {
  const { t, language } = useTranslation()
  const dashboardView = useUserPreferencesStore(s => s.dashboardView)
  // W44: in-page persona switcher — the view could previously only be changed
  // from /settings, which made the three dashboards undiscoverable.
  const setDashboardView = useUserPreferencesStore(s => s.setDashboardView)
  const metrics = useDashboardMetrics()

  // Hydrate the stores the dashboard still consumes DIRECTLY (row-level data the
  // rollup doesn't carry): the team roster (workload widgets) + dept labels for
  // the Executive/Managerial training bars, and the company compliance target
  // for the hero's "At Risk" line. Counts, training aggregates, and the bell's
  // alerts now come from server read-models (/api/dashboard/summary +
  // /api/dashboard/alerts), so policies/circulars/training are no longer fetched
  // here — that removed 4 heavy list fetches from the dashboard cold load.
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  const fetchDepartments = useDepartmentStore((s) => s.fetchAll)
  const fetchComplianceSettings = useComplianceSettingsStore((s) => s.fetch)
  useEffect(() => {
    void fetchTeam()
    void fetchDepartments()
    void fetchComplianceSettings()
  }, [fetchTeam, fetchDepartments, fetchComplianceSettings])

  const [showFadeIn, setShowFadeIn] = useState(false)

  useEffect(() => {
    const fromWelcome = sessionStorage.getItem('fromWelcome')
    if (fromWelcome) {
      setShowFadeIn(true)
      sessionStorage.removeItem('fromWelcome')
    }
  }, [])

  // Executive Compliance Status Report — rendered server-side via the xelatex
  // microservice (engine: 'latex'), enqueued as a `pdf.latex` job. Replaces the
  // legacy jsPDF dashboard export (src/lib/dashboard-pdf.ts).
  const [pdfBusy, setPdfBusy] = useState(false)
  const handleExport = useCallback(async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const data = toComplianceReportData(metrics, {
        locale: language,
        t: t as unknown as (k: string, p?: Record<string, string>) => string,
        date: new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        period: language === 'ar' ? 'آخر ١٢ شهراً' : 'Last 12 months',
      })
      await downloadPdf(
        { template: 'compliance-report', locale: language, options: { engine: 'latex' }, data },
        'Compliance-Report.pdf',
      )
    } catch (e) {
      console.error('[dashboard] PDF export failed:', e)
      // The spinner just stops on failure, leaving the user unsure whether the
      // report downloaded — tell them it didn't and to try again.
      pushToast({ key: 'errors.misc.reportExportFailed' }, 'error')
    } finally {
      setPdfBusy(false)
    }
  }, [metrics, language, t, pdfBusy])

  const { titleKey, subtitleKey } = viewConfig[dashboardView]

  // First-fetch detector. The dashboard's row-level data now comes from the
  // team store (workload/roster) — counts, training, and alerts are server
  // read-models gated separately below. Once team hydrates (`lastFetched`) we
  // unwrap the skeleton and let individual widget empty states take over.
  const teamLastFetched = useTeamStore((s) => s.lastFetched)

  const anyStoreReady = teamLastFetched !== null

  // Keep the composed skeleton up until the *server-driven* data the widgets
  // actually render is ready too — not just the first store. Previously the
  // skeleton cleared the moment any store hydrated (team resolves fast), while
  // the count summary + health (which drive the alert cards, metric tiles and
  // the hero ring) were still in flight, so those elements popped in a beat
  // later. Gating on both their first-fetch flags makes the whole view appear
  // at once. Both flags always settle to false (summary/health resolve, error,
  // or "computing"), so this can't hang.
  const showSkeleton =
    !anyStoreReady || metrics.summaryLoading || metrics.complianceHealthLoading

  return (
    <div className={showFadeIn ? 'dashboard-fade-in' : ''}>
      <Header
        title={t(titleKey as any)}
        subtitle={t(subtitleKey as any)}
        exportSlot={
          <ExportMenu
            iconOnly
            options={[
              {
                label: t('common.exportPdf' as any),
                icon: 'lucide:file-text',
                onSelect: handleExport,
                loading: pdfBusy,
              },
            ]}
          />
        }
      />

      {/* W44: persona view switcher (persists via user-preferences store). */}
      <div className="px-8 pt-6 flex items-center gap-2">
        {(['executive', 'managerial', 'officer'] as DashboardView[]).map((view) => (
          <button
            key={view}
            onClick={() => setDashboardView(view)}
            aria-pressed={dashboardView === view}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
              dashboardView === view
                ? 'bg-slate-900 text-white shadow-lg'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t(`dashboard.view${view.charAt(0).toUpperCase()}${view.slice(1)}` as any)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {showSkeleton ? (
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
