'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAuditStore } from '@/stores/audit-store'
import { useRiskStore } from '@/stores/risk-store'
import { useComplianceScore } from '@/hooks/useComplianceScore'
import { useDashboardHealth } from '@/hooks/useDashboardHealth'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import type { PeriodFilter } from '@/lib/compliance-engine.types'
import { exportExecutiveReport, generatePrintableReport } from '@/lib/export'
import { ExportMenu } from '@/components/ui/export-menu'
import { downloadPdf } from '@/lib/pdf-client'
import { Gate } from '@/components/auth/gate'
import type { TranslationKey } from '@/i18n'
import { dicebearAvatar } from '@/lib/avatar'
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'
import { useFormattedDate } from '@/hooks/useFormattedDate'

// Types
type Severity = 'critical' | 'high' | 'medium' | 'low'
type FindingStatus = 'remediation' | 'resolved' | 'verified' | 'open'
type RiskCategory = string  // widened — see useRiskCategoryStore

interface AuditFinding {
  id: string
  sourceAuditId: string
  auditName: string
  category: string
  severity: Severity
  owner: { name: string; avatar: string }
  status: FindingStatus
  dueDate: Date
  description: string
}

interface RiskDistribution {
  category: string
  percentage: number
  color: string
}

// Configs
const severityConfig: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', color: 'bg-emerald-100 text-emerald-700' },
}

const statusConfig: Record<FindingStatus, { label: string; dotColor: string }> = {
  remediation: { label: 'Remediation', dotColor: 'bg-amber-500' },
  resolved: { label: 'Resolved', dotColor: 'bg-emerald-500' },
  verified: { label: 'Verified', dotColor: 'bg-blue-500' },
  open: { label: 'Open', dotColor: 'bg-rose-500' },
}

const riskCategoryBarColors: Record<string, string> = {
  operational: 'bg-blue-500',
  financial: 'bg-emerald-500',
  compliance: 'bg-purple-500',
  strategic: 'bg-amber-500',
  reputational: 'bg-rose-500',
}

// Helper functions
function getHealthStatus(score: number): { label: string; color: string; bgColor: string; borderColor: string; icon: string } {
  if (score >= 90) return { label: 'healthExcellent', color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: 'lucide:shield-check' }
  if (score >= 75) return { label: 'healthGood', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: 'lucide:shield' }
  if (score >= 60) return { label: 'healthNeedsAttention', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: 'lucide:alert-triangle' }
  if (score >= 40) return { label: 'healthAtRisk', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', icon: 'lucide:alert-circle' }
  return { label: 'healthCritical', color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', icon: 'lucide:shield-alert' }
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 75) return '#3b82f6'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

const confidenceConfig = {
  insufficient: { label: 'confidenceInsufficient', color: 'text-slate-400', bg: 'bg-slate-100' },
  low: { label: 'confidenceLow', color: 'text-amber-600', bg: 'bg-amber-50' },
  moderate: { label: 'confidenceModerate', color: 'text-blue-600', bg: 'bg-blue-50' },
  high: { label: 'confidenceHigh', color: 'text-emerald-600', bg: 'bg-emerald-50' },
}

export default function ReportsExecutivePage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()
  const { formatDate } = useFormattedDate()

  // Stores
  const storeAudits = useAuditStore((s) => s.audits)
  const fetchAudits = useAuditStore((s) => s.fetchAll)
  const storeRisks = useRiskStore((s) => s.risks)
  const allFrameworks = useFrameworkConfigStore((s) => s.frameworks)
  // Wave-3 skeleton boundary — first-fetch placeholder for the findings table
  // and risk distribution. Avoids the empty "no findings" flash on initial
  // mount (OPTIMIZATION-PATTERNS §2).
  const auditsLoading = useAuditStore((s) => s.isLoading)
  const auditsLastFetched = useAuditStore((s) => s.lastFetched)
  const risksLoading = useRiskStore((s) => s.isLoading)
  const risksLastFetched = useRiskStore((s) => s.lastFetched)
  const showFindingsSkeleton =
    auditsLoading && storeAudits.length === 0 && auditsLastFetched === null
  const showRisksSkeleton =
    risksLoading && storeRisks.length === 0 && risksLastFetched === null

  // State
  const [periodFilter, setPeriodFilter] = useState('12months')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showBreakdownModal, setShowBreakdownModal] = useState(false)
  const [showDeductionsModal, setShowDeductionsModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null)

  // Hydrate on mount. Both fetches are de-duped by apiFetch when called
  // concurrently across tabs (OPTIMIZATION-PATTERNS §5).
  const fetchRisks = useRiskStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchAudits()
    void fetchRisks()
  }, [fetchAudits, fetchRisks])

  // Compliance score
  const complianceScore = useComplianceScore(periodFilter as PeriodFilter)
  // Per-framework scores ride the dashboard-health endpoint (the /compliance/
  // score cache row has no per-framework breakdown) — same source the
  // dashboard's framework cards use, so the two surfaces always agree.
  const dashboardHealth = useDashboardHealth({ period: periodFilter as PeriodFilter })

  // Derive risk distribution
  const risks = useMemo(() => storeRisks, [storeRisks])
  const riskDistribution: RiskDistribution[] = useMemo(() => {
    if (risks.length === 0) return []
    const counts: Record<string, number> = {}
    for (const risk of risks) counts[risk.category] = (counts[risk.category] || 0) + 1
    const total = risks.length
    return Object.entries(counts).map(([category, count]) => ({
      category,
      percentage: Math.round((count / total) * 100),
      color: riskCategoryBarColors[category as RiskCategory] || 'bg-slate-400',
    }))
  }, [risks])

  // Derive audit findings
  const auditFindings: AuditFinding[] = useMemo(() => {
    const statusMap: Record<string, FindingStatus> = { pending: 'open', in_progress: 'remediation', completed: 'resolved', overdue: 'open' }
    return storeAudits
      .map((audit): AuditFinding => ({
        id: audit.id.slice(0, 8),
        sourceAuditId: audit.id,
        auditName: audit.title,
        category: audit.type,
        severity: (audit.priority ?? 'medium') as Severity,
        owner: { name: audit.assignee.name, avatar: audit.assignee.avatar || '' },
        status: statusMap[audit.status] || 'open',
        dueDate: new Date(audit.dueDate),
        description: audit.description || audit.title,
      }))
      .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())
      .slice(0, 5)
  }, [storeAudits])

  const handleFindingClick = (finding: AuditFinding) => { setSelectedFinding(finding); setIsDrawerOpen(true) }

  // Labels
  const filterLabels: Record<string, string> = {
    '3months': t('reports.last3Months'),
    '6months': t('reports.last6Months'),
    '12months': t('reports.last12Months'),
    'fiscal': t('reports.fiscalYear2025'),
  }
  const severityLabels: Record<Severity, string> = { critical: t('reports.critical'), high: t('reports.high'), medium: t('reports.medium'), low: t('reports.low') }
  const statusLabels: Record<FindingStatus, string> = { remediation: t('reports.remediation'), resolved: t('reports.resolved'), verified: t('reports.verified'), open: t('reports.open') }
  const riskDistributionLabels: Record<string, string> = { operational: t('reports.operational'), financial: t('reports.financial'), compliance: t('reports.compliance'), strategic: t('reports.strategic'), reputational: t('reports.reputational') }
  // Audit-type label map — shared between the findings table and the detail drawer.
  const auditCategoryLabels: Record<string, string> = {
    sama: t('reports.samaInspection'),
    internal: t('reports.internalAudit'),
    'sharia-board': t('reports.shariaAudit'),
    sharia: t('reports.shariaAudit'),
  }
  const monthLabels: Record<string, string> = {
    'Jan': t('calendar.monthsShort.jan'), 'Feb': t('calendar.monthsShort.feb'), 'Mar': t('calendar.monthsShort.mar'), 'Apr': t('calendar.monthsShort.apr'),
    'May': t('calendar.monthsShort.may'), 'Jun': t('calendar.monthsShort.jun'), 'Jul': t('calendar.monthsShort.jul'), 'Aug': t('calendar.monthsShort.aug'),
    'Sep': t('calendar.monthsShort.sep'), 'Oct': t('calendar.monthsShort.oct'), 'Nov': t('calendar.monthsShort.nov'), 'Dec': t('calendar.monthsShort.dec'),
    'Q1': t('reports.q1'), 'Q2': t('reports.q2'), 'Q3': t('reports.q3'), 'Q4': t('reports.q4'),
  }

  const applyFilter = (filterValue: string) => { setPeriodFilter(filterValue); setShowFilterDropdown(false) }
  const criticalCount = auditFindings.filter((f) => f.severity === 'critical').length
  const currentTrend = complianceScore.trend

  // Score first-load gates — mirror the framework-card / findings / risks
  // skeleton pattern (gate on THIS section's own data being empty so a
  // period-filter refetch keeps the prior values visible). useComplianceScore
  // returns emptyResult() while in flight: confidence='insufficient',
  // deductions=[], trend=[]. (OPTIMIZATION-PATTERNS §2)
  const scoreLoading = complianceScore.isLoading && complianceScore.confidence === 'insufficient'
  const deductionsLoading = complianceScore.isLoading && complianceScore.deductions.length === 0
  const trendLoading = complianceScore.isLoading && complianceScore.trend.length === 0

  // Executive view variables
  const healthStatus = getHealthStatus(complianceScore.overall)
  const conf = confidenceConfig[complianceScore.confidence]
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (complianceScore.overall / 100) * circumference
  const totalDeduction = complianceScore.deductions.reduce((sum, d) => sum + d.points, 0)
  const deductionSeverityColors: Record<string, string> = { critical: 'bg-rose-100 text-rose-700', high: 'bg-amber-100 text-amber-700', medium: 'bg-slate-100 text-slate-600', low: 'bg-slate-100 text-slate-600' }
  const deductionSeverityBorder: Record<string, string> = { critical: 'border-l-rose-500', high: 'border-l-amber-500', medium: 'border-l-slate-300', low: 'border-l-slate-200' }
  const componentKeys: { key: keyof typeof complianceScore.components; i18n: string }[] = [
    { key: 'auditCompletion', i18n: 'compAuditCompletion' },
    { key: 'observationClosure', i18n: 'compObservationClosure' },
    { key: 'riskPosture', i18n: 'compRiskPosture' },
    { key: 'policyCurrency', i18n: 'compPolicyCurrency' },
    { key: 'trainingCompletion', i18n: 'compTrainingCompletion' },
  ]
  // Render straight from the server's per-framework list (already filtered to
  // pinned + enabled + correspondence-based). The client framework store only
  // supplies localized names/icons — intersecting with its `enabled` flags
  // here re-introduced the blank-card bug whenever the config fetch hadn't
  // run on this page.
  const frameworkEntries = useMemo(() =>
    dashboardHealth.frameworkScores.map((fs) => {
      const fw = allFrameworks.find((f) => f.id === fs.frameworkId)
      return {
        key: fs.frameworkId,
        name: fw ? (isRTL ? fw.nameAr : fw.name) : fs.frameworkName,
        icon: fw?.icon ?? 'lucide:shield',
        score: fs.overall,
      }
    }),
    [dashboardHealth.frameworkScores, allFrameworks, isRTL]
  )
  const miniRadius = 28
  const miniCirc = 2 * Math.PI * miniRadius
  const getGaugeColor = (score: number): string => {
    if (score >= 90) return '#10b981'
    if (score >= 75) return '#3b82f6'
    if (score >= 60) return '#f59e0b'
    return '#ef4444'
  }

  // ── Full-page PDF export (reuses the generic compliance-report LaTeX
  // template). CSV reuses the existing exportExecutiveReport. ──
  const [pdfBusy, setPdfBusy] = useState(false)
  const handleExportPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      await downloadPdf(
        {
          template: 'compliance-report',
          locale: isRTL ? 'ar' : 'en',
          options: { engine: 'latex' },
          data: {
            date: new Date().toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }),
            overallScore: Math.round(complianceScore.overall),
            change: complianceScore.change,
            confidence: complianceScore.confidence,
            components: componentKeys.map((c) => ({
              name: t(`reports.${c.i18n}` as TranslationKey),
              score: Math.round(complianceScore.components[c.key].score),
              weight: complianceScore.components[c.key].weight,
            })),
            frameworks: frameworkEntries.map((f) => ({ name: f.name, score: Math.round(f.score) })),
            deductions: complianceScore.deductions.map((d) => ({
              reason:
                d.description ||
                (d.descriptionKey ? t(d.descriptionKey as TranslationKey, d.descriptionParams) : ''),
              severity: d.severity,
              points: d.points,
            })),
          },
        },
        'Team-Score.pdf',
      )
    } catch (err) {
      console.error(err)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {t('reports.headerTeamScore' as TranslationKey)}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('reports.headerTeamScoreSubtitle' as TranslationKey)}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsTab' as TranslationKey)}
            </Link>
            <Link href="/reports/compliance-review" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/compliance-review') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.complianceReviewTab' as TranslationKey)}
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.teamPerformanceTab' as TranslationKey)}
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsLogs' as TranslationKey)}
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.tabs.risks' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          {/* Custom Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:filter" className="text-slate-400" />
              <span>{filterLabels[periodFilter]}</span>
              <Icon icon="lucide:chevron-down" className={cn('text-slate-400 transition-transform', showFilterDropdown && 'rotate-180')} />
            </button>
            {showFilterDropdown && (
              <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden`}>
                {(['3months', '6months', '12months', 'fiscal'] as const).map(val => (
                  <button
                    key={val}
                    onClick={() => applyFilter(val)}
                    className={cn(
                      `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer`,
                      periodFilter === val ? 'text-emerald-600 bg-emerald-50/30 font-bold' : 'text-slate-700'
                    )}
                  >
                    {filterLabels[val]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Gate perm="Export Compliance Data">
            <ExportMenu
              iconOnly
              options={[
                {
                  label: t('common.exportCsv'),
                  icon: 'lucide:table',
                  onSelect: () =>
                    exportExecutiveReport(complianceScore, auditFindings, riskDistribution, 'executive-report', t, isRTL),
                },
                { label: t('common.exportPdf'), icon: 'lucide:file-text', onSelect: handleExportPdf, loading: pdfBusy },
              ]}
            />
          </Gate>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-3">
        {/* ROW 1: Hero Score + Frameworks side by side */}
        <div className="grid grid-cols-5 gap-3">
          {/* Hero Compliance Score */}
          <Card className="col-span-2">
            <CardContent className="pt-4 pb-3 px-4">
              {scoreLoading ? (
                <div className="flex items-center gap-4" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                  <Skeleton className="h-[108px] w-[108px] !rounded-full flex-shrink-0" />
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-24 !rounded-full" />
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20 !rounded-full" />
                  </div>
                </div>
              ) : (
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
                  <svg width="108" height="108" className="transform -rotate-90">
                    <circle cx="54" cy="54" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                    <circle cx="54" cy="54" r={radius} fill="none" stroke={getScoreColor(complianceScore.overall)} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900">{complianceScore.overall}%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">{t('reports.overallComplianceScore' as TranslationKey)}</h2>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${healthStatus.bgColor} ${healthStatus.borderColor}`}>
                    <Icon icon={healthStatus.icon} className={`w-3 h-3 ${healthStatus.color}`} />
                    <span className={`text-[10px] font-bold ${healthStatus.color}`}>{t(('reports.' + healthStatus.label) as TranslationKey)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {complianceScore.change >= 0 ? (
                      <Icon icon="lucide:trending-up" className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Icon icon="lucide:trending-down" className="w-3.5 h-3.5 text-rose-600" />
                    )}
                    <span className={`text-xs font-bold ${complianceScore.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {complianceScore.change >= 0 ? '+' : ''}{complianceScore.change}%
                    </span>
                    <span className="text-[10px] text-slate-400">{t('reports.vsLastPeriod' as TranslationKey)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
                      {t(('reports.' + conf.label) as TranslationKey)}
                    </span>
                    <span className="text-[10px] text-slate-400">{filterLabels[periodFilter]}</span>
                  </div>
                </div>
              </div>
              )}
            </CardContent>
          </Card>

          {/* Framework Scores — per-framework gauges from dashboard-health.
              Skeleton while the health fetch runs; explicit empty state when
              no enabled framework has a score yet (was a silent blank card). */}
          <Card className="col-span-3">
            <CardContent className="pt-3 pb-3 px-4">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('reports.frameworkScores' as TranslationKey)}</h3>
              {dashboardHealth.isLoading && frameworkEntries.length === 0 ? (
                <div className="flex items-center justify-around py-1" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <Skeleton className="h-[60px] w-[60px] !rounded-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  ))}
                </div>
              ) : frameworkEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Icon icon="lucide:gauge" className="text-2xl text-slate-300 mb-1.5" />
                  <p className="text-xs text-slate-400 max-w-md">{t('reports.frameworkScoresEmpty' as TranslationKey)}</p>
                </div>
              ) : (
                <div className="flex items-center justify-around">
                  {frameworkEntries.map(({ key, name, icon, score }) => {
                    const fwScore = score
                    const fwOffset = miniCirc - (fwScore / 100) * miniCirc
                    return (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <div className="relative" style={{ width: 68, height: 68 }}>
                          <svg width="68" height="68" className="transform -rotate-90">
                            <circle cx="34" cy="34" r={miniRadius} fill="none" stroke="#f1f5f9" strokeWidth="5" />
                            <circle cx="34" cy="34" r={miniRadius} fill="none" stroke={getGaugeColor(fwScore)} strokeWidth="5" strokeLinecap="round" strokeDasharray={miniCirc} strokeDashoffset={fwOffset} className="transition-all duration-700" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold text-slate-900">{Math.round(fwScore)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Icon icon={icon} className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-medium text-slate-600">{name}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ROW 2: Component Breakdown */}
        <div>
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('reports.componentBreakdown' as TranslationKey)}</h3>
          <div className="grid grid-cols-5 gap-2" data-skeleton={scoreLoading ? 'true' : undefined} role={scoreLoading ? 'status' : undefined} aria-busy={scoreLoading || undefined} aria-live={scoreLoading ? 'polite' : undefined}>
            {scoreLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-3 pb-2 px-3 flex flex-col items-center gap-1">
                    <Skeleton className="h-[56px] w-[56px] !rounded-full" />
                    <Skeleton className="h-2.5 w-14 mt-1" />
                    <Skeleton className="h-2 w-10" />
                  </CardContent>
                </Card>
              ))
            ) : (
              componentKeys.map(({ key, i18n }) => {
              const comp = complianceScore.components[key]
              const isWarning = comp.score < 75
              const compRadius = 24
              const compCirc = 2 * Math.PI * compRadius
              const compOffset = compCirc - (comp.score / 100) * compCirc
              const strokeColor = isWarning ? '#f59e0b' : '#10b981'
              return (
                <Card key={key} className={cn('transition-all', isWarning ? 'border-amber-200 bg-amber-50/30' : 'hover:border-slate-200')}>
                  <CardContent className="pt-3 pb-2 px-3 flex flex-col items-center gap-1">
                    <div className="relative" style={{ width: 56, height: 56 }}>
                      <svg width="56" height="56" className="transform -rotate-90">
                        <circle cx="28" cy="28" r={compRadius} fill="none" stroke="#f1f5f9" strokeWidth="4" />
                        <circle cx="28" cy="28" r={compRadius} fill="none" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={compCirc} strokeDashoffset={compOffset} className="transition-all duration-500" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-slate-900">{comp.score}%</span>
                      </div>
                    </div>
                    <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center leading-tight">
                      {t(('reports.' + i18n) as TranslationKey)}
                    </h4>
                    <span className="text-[9px] font-medium text-slate-400">
                      {t('reports.weight' as TranslationKey)}: {comp.weight}%
                    </span>
                  </CardContent>
                </Card>
              )
            })
            )}
          </div>
        </div>

        {/* ROW 3: Trend + Deductions */}
        <div className="grid grid-cols-2 gap-3">
          {/* Compliance Trend */}
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <div className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-900">{t('reports.complianceTrend')}</h3>
                  <p className="text-[10px] text-slate-400">{t('reports.historicalPerformance')}</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{t('reports.target')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{t('reports.actual')}</span>
                  </div>
                </div>
              </div>
              {(() => {
                if (trendLoading) {
                  return (
                    <div className="relative h-36" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                      <Skeleton className="absolute inset-x-0 bottom-6 h-28" />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between px-2">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <Skeleton key={i} className="h-2 w-6" />
                        ))}
                      </div>
                    </div>
                  )
                }
                if (currentTrend.length === 0) {
                  return (
                    <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                      {t('reports.confidenceInsufficient' as TranslationKey)}
                    </div>
                  )
                }
                const allVals = currentTrend.flatMap((d) => [d.actual, d.target])
                const rawMin = Math.min(...allVals)
                const rawMax = Math.max(...allVals)
                const yPad = Math.max((rawMax - rawMin) * 0.2, 5)
                const yMin = Math.max(0, Math.floor(rawMin - yPad))
                const yMax = Math.min(100, Math.ceil(rawMax + yPad))
                const yRange = yMax - yMin || 1
                const padXPct = 4
                const chartTopPct = 8
                const chartBotPct = 78
                const chartHPct = chartBotPct - chartTopPct
                const toXPct = (i: number) => padXPct + (currentTrend.length === 1 ? (100 - padXPct * 2) / 2 : (i / (currentTrend.length - 1)) * (100 - padXPct * 2))
                const toYPct = (val: number) => chartTopPct + chartHPct - ((val - yMin) / yRange) * chartHPct
                const targetYPct = toYPct(currentTrend[0].target)
                const linePoints = currentTrend.map((d, i) => `${toXPct(i)},${toYPct(d.actual)}`).join(' ')
                const firstX = toXPct(0)
                const lastX = toXPct(currentTrend.length - 1)
                const areaPath = `M${firstX},${toYPct(currentTrend[0].actual)} ${currentTrend.map((d, i) => `L${toXPct(i)},${toYPct(d.actual)}`).join(' ')} L${lastX},${chartBotPct} L${firstX},${chartBotPct} Z`

                return (
                  <div className="relative h-36" onMouseLeave={() => setHoveredTrendIdx(null)}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <line x1={padXPct} y1={targetYPct} x2={100 - padXPct} y2={targetYPct} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="1.5 1" />
                      <path d={areaPath} fill="url(#trendGradient)" opacity="0.3" />
                      <polyline points={linePoints} fill="none" stroke="#10b981" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {currentTrend.map((d, i) => {
                      const leftPct = toXPct(i)
                      const topPct = toYPct(d.actual)
                      const isHovered = hoveredTrendIdx === i
                      const isLast = i === currentTrend.length - 1
                      const label = monthLabels[d.month] || d.month
                      const dotColor = d.actual >= d.target ? '#10b981' : '#f59e0b'
                      return (
                        <React.Fragment key={i}>
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                            style={{ left: `${leftPct}%`, top: `${topPct}%`, width: 24, height: 24 }}
                            onMouseEnter={() => setHoveredTrendIdx(i)}
                            onMouseLeave={() => setHoveredTrendIdx(null)}
                          >
                            <div
                              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white transition-all duration-150"
                              style={{ width: isHovered ? 10 : isLast ? 8 : 5, height: isHovered ? 10 : isLast ? 8 : 5, backgroundColor: dotColor }}
                            />
                          </div>
                          {isHovered && (
                            <div className="absolute -translate-x-1/2 pointer-events-none z-10" style={{ left: `${leftPct}%`, top: `calc(${topPct}% - 28px)` }}>
                              <div className="bg-slate-800/90 text-white text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap">{d.actual}%</div>
                            </div>
                          )}
                          <div className="absolute -translate-x-1/2" style={{ left: `${leftPct}%`, top: `calc(${chartBotPct}% + 6px)` }}>
                            <span className={cn('text-[8px] font-bold uppercase', isHovered ? 'text-slate-700' : isLast ? 'text-slate-600' : 'text-slate-400')}>{label}</span>
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Score Deductions */}
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <h3 className="text-xs font-bold text-slate-900 mb-2">{t('reports.whatsImpactingScore' as TranslationKey)}</h3>
              {deductionsLoading ? (
                <div className="space-y-1" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded border-l-[3px] border-l-slate-200 bg-slate-50/50">
                      <Skeleton className="h-5 w-10 flex-shrink-0" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {complianceScore.deductions.slice(0, 5).map((d, idx) => (
                    <div key={idx} className={cn('flex items-center gap-2 px-2 py-1.5 rounded border-l-[3px] bg-slate-50/50 transition-colors hover:bg-slate-50', deductionSeverityBorder[d.severity])}>
                      <span className={cn('text-[10px] font-bold min-w-[40px] text-center rounded px-1 py-0.5', deductionSeverityColors[d.severity])}>{d.points}</span>
                      <span className="text-[11px] text-slate-600 leading-tight">{d.descriptionKey ? t(d.descriptionKey as TranslationKey, d.descriptionParams) : d.description}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.totalImpact' as TranslationKey)}</span>
                {deductionsLoading ? (
                  <Skeleton className="h-3.5 w-12" />
                ) : (
                  <span className="text-xs font-bold text-rose-600">{totalDeduction} {t('reports.pts' as TranslationKey)}</span>
                )}
              </div>
              {complianceScore.deductions.length > 5 && (
                <button
                  onClick={() => setShowDeductionsModal(true)}
                  className="w-full mt-2 py-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {t('reports.viewScoreDetails' as TranslationKey)}
                  <Icon icon="lucide:external-link" className="w-2.5 h-2.5" />
                </button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ROW 4: Risk Distribution + Findings Table */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <h3 className="text-xs font-bold text-slate-900 mb-3">{t('reports.riskDistribution')}</h3>
              {showRisksSkeleton ? (
                <div className="space-y-3 py-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  ))}
                </div>
              ) : riskDistribution.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Icon icon="lucide:shield-off" className="text-2xl text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-400">{t('reports.noRiskData' as TranslationKey)}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {riskDistribution.map((risk, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between text-[10px] font-bold mb-1">
                          <span className="text-slate-600">{riskDistributionLabels[risk.category] || risk.category}</span>
                          <span className="text-slate-900">{risk.percentage}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', risk.color)} style={{ width: `${risk.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowBreakdownModal(true)}
                    className="w-full mt-4 py-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {t('reports.viewFullBreakdown')}
                    <Icon icon="lucide:external-link" className="w-2.5 h-2.5" />
                  </button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Findings Table */}
          <Card className="col-span-2">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-900">{t('reports.recentAuditFindings')}</h3>
                <div className="flex gap-1.5">
                  <Badge className="bg-rose-50 text-rose-600 text-[10px] px-1.5 py-0">{criticalCount} {t('reports.critical')}</Badge>
                  <Badge className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0">{auditFindings.length} {t('reports.total')}</Badge>
                </div>
              </div>
              {showFindingsSkeleton ? (
                <div className="p-2">
                  <ListSkeleton rows={4} columns={5} />
                </div>
              ) : auditFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Icon icon="lucide:clipboard-check" className="text-2xl text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-400">{t('reports.noAuditFindings' as TranslationKey)}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.id')}</th>
                        <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.auditName')}</th>
                        <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.severity')}</th>
                        <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.owner')}</th>
                        <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.status')}</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditFindings.map((finding) => (
                        <tr key={finding.sourceAuditId} onClick={() => handleFindingClick(finding)} className="group hover:bg-slate-50/50 cursor-pointer transition-colors">
                          <td className="px-2 py-2 text-[10px] font-bold text-slate-400">#{finding.id}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-slate-900">{finding.auditName}</span>
                              <span className="text-[9px] text-slate-500 uppercase tracking-tight">{auditCategoryLabels[finding.category] || finding.category}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <Badge className={cn(severityConfig[finding.severity].color, 'text-[9px] px-1.5 py-0')}>
                              {severityLabels[finding.severity].toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              {finding.owner.avatar ? (
                                <img src={dicebearAvatar(finding.owner.avatar)} className="w-5 h-5 rounded-full" alt={finding.owner.name} />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">{finding.owner.name.charAt(0)}</div>
                              )}
                              <span className="text-[10px] font-medium text-slate-700">{finding.owner.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <div className={cn('w-1.5 h-1.5 rounded-full', statusConfig[finding.status].dotColor)} />
                              <span className="text-[10px] font-bold text-slate-600">{statusLabels[finding.status]}</span>
                            </div>
                          </td>
                          <td className={`px-2 py-2 ${isRTL ? 'text-left' : 'text-right'}`}>
                            <div className="flex items-center justify-end text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold">{t('reports.details')}</span>
                              <Icon icon="lucide:chevron-right" className={cn("w-3.5 h-3.5", isRTL && "flip-x")} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Risk Breakdown Modal */}
      <Modal isOpen={showBreakdownModal} onClose={() => setShowBreakdownModal(false)} size="xl">
        <div className={`flex flex-col max-h-[85vh] -m-6 ${isRTL ? 'rtl' : ''}`}>
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-xl font-bold font-display text-slate-900">{t('reports.detailedRiskBreakdown')}</h2>
              <p className="text-xs text-slate-500">{t('reports.comprehensiveAnalysis')}</p>
            </div>
            <button onClick={() => setShowBreakdownModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>
          <div className="p-8 space-y-6 overflow-y-auto hide-scrollbar">
            {risks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon icon="lucide:shield-off" className="text-4xl text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">{t('reports.noRiskData' as TranslationKey)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('reports.riskDistribution')}</h3>
                  <div className="space-y-4">
                    {riskDistribution.map((risk, idx) => (
                      <div key={idx} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-700">{riskDistributionLabels[risk.category] || risk.category}</span>
                          <span className="text-xs font-bold text-slate-600">{risk.percentage}%</span>
                        </div>
                        <div className={`h-2 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                          <div className={cn('h-full rounded-full', risk.color)} style={{ width: `${risk.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('reports.riskSummary' as TranslationKey)}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.totalRegisteredRisks' as TranslationKey)}</p>
                      <p className="text-2xl font-black text-slate-900">{risks.length}</p>
                    </div>
                    <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.avgScore' as TranslationKey)}</p>
                      <p className="text-2xl font-black text-slate-900">
                        {Math.round(risks.reduce((sum, r) => sum + r.likelihood * r.impact, 0) / risks.length)}
                      </p>
                    </div>
                    {(() => {
                      const sorted = [...risks].sort((a, b) => (b.likelihood * b.impact) - (a.likelihood * a.impact))
                      const highest = sorted[0]
                      const lowest = sorted[sorted.length - 1]
                      return (
                        <>
                          <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.highestRisk' as TranslationKey)}</p>
                            <p className="text-sm font-black text-rose-600 truncate">{highest.title}</p>
                            <p className="text-[10px] text-slate-500">{t('reports.score')}: {highest.likelihood * highest.impact}</p>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.lowestRisk' as TranslationKey)}</p>
                            <p className="text-sm font-black text-emerald-600 truncate">{lowest.title}</p>
                            <p className="text-[10px] text-slate-500">{t('reports.score')}: {lowest.likelihood * lowest.impact}</p>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex gap-3">
            <button onClick={() => setShowBreakdownModal(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer">
              {t('reports.dismiss')}
            </button>
            <button
              onClick={() => {
                if (risks.length === 0) return
                const sorted = [...risks].sort((a, b) => (b.likelihood * b.impact) - (a.likelihood * a.impact))
                const rows = sorted.map((r) => ({
                  [t('reports.id')]: r.id,
                  Title: r.title,
                  Category: riskDistributionLabels[r.category] || r.category,
                  [t('reports.likelihood' as TranslationKey)]: r.likelihood,
                  [t('reports.impact' as TranslationKey)]: r.impact,
                  [t('reports.score')]: r.likelihood * r.impact,
                  [t('reports.status')]: r.status,
                }))
                const distSummary = riskDistribution
                  .map((d) => `${riskDistributionLabels[d.category] || d.category}: ${d.percentage}%`)
                  .join(' • ')
                generatePrintableReport(t('reports.detailedRiskBreakdown'), rows, {
                  subtitle: `${t('reports.totalRegisteredRisks' as TranslationKey)}: ${risks.length}  •  ${distSummary}`,
                })
              }}
              className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon icon="lucide:file-text" />
              {t('reports.generateDetailedReportPdf')}
            </button>
          </div>
        </div>
      </Modal>

      {/* All Deductions Modal */}
      <Modal isOpen={showDeductionsModal} onClose={() => setShowDeductionsModal(false)} size="lg">
        <div className={`flex flex-col max-h-[85vh] -m-6 ${isRTL ? 'rtl' : ''}`}>
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-lg font-bold font-display text-slate-900">{t('reports.allDeductions' as TranslationKey)}</h2>
              <p className="text-xs text-slate-500">{t('reports.deductionsSummary' as TranslationKey)}</p>
            </div>
            <button onClick={() => setShowDeductionsModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto hide-scrollbar space-y-1.5">
            {complianceScore.deductions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Icon icon="lucide:shield-check" className="text-3xl text-emerald-400 mb-2" />
                <p className="text-sm text-slate-500">{t('reports.noDeductions' as TranslationKey)}</p>
              </div>
            ) : (
              complianceScore.deductions.map((d, idx) => {
                const dsc: Record<string, string> = { critical: 'bg-rose-100 text-rose-700', high: 'bg-amber-100 text-amber-700', medium: 'bg-slate-100 text-slate-600', low: 'bg-slate-100 text-slate-600' }
                const dsb: Record<string, string> = { critical: 'border-l-rose-500', high: 'border-l-amber-500', medium: 'border-l-slate-300', low: 'border-l-slate-200' }
                return (
                  <div key={idx} className={cn('flex items-center gap-2 px-3 py-2 rounded border-l-[3px] bg-slate-50/50 transition-colors hover:bg-slate-50', dsb[d.severity])}>
                    <span className={cn('text-[10px] font-bold min-w-[44px] text-center rounded px-1.5 py-0.5', dsc[d.severity])}>{d.points}</span>
                    <span className="text-xs text-slate-600 leading-tight">{d.descriptionKey ? t(d.descriptionKey as TranslationKey, d.descriptionParams) : d.description}</span>
                  </div>
                )
              })
            )}
          </div>
          <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.totalImpact' as TranslationKey)}</span>
              <span className="text-sm font-bold text-rose-600 ml-2">{complianceScore.deductions.reduce((sum, d) => sum + d.points, 0)} {t('reports.pts' as TranslationKey)}</span>
            </div>
            <button onClick={() => setShowDeductionsModal(false)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer">
              {t('reports.dismiss')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Finding Detail Drawer */}
      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} size="md" hideBackdrop isRTL={isRTL}>
        {selectedFinding && (() => {
          const sourceAudit = storeAudits.find(a => a.id === selectedFinding.sourceAuditId)
          // auditCategoryLabels defined above (shared with the findings table row).
          const auditTypeLabels = auditCategoryLabels
          const docTypeIcons: Record<string, string> = { pdf: 'lucide:file-text', image: 'lucide:image', doc: 'lucide:file' }
          const docTypeColors: Record<string, string> = { pdf: 'text-rose-500', image: 'text-blue-500', doc: 'text-emerald-500' }
          return (
            <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
              <div className="pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{t('reports.findingDetail')}</span>
                  <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                    <Icon icon="lucide:x" className="text-xl" />
                  </button>
                </div>
                <h2 className="text-xl font-bold font-display text-slate-900">{selectedFinding.auditName}</h2>
                <p className="text-sm text-slate-500">{auditTypeLabels[selectedFinding.category] || selectedFinding.category}</p>
              </div>
              <div className="flex-1 overflow-y-auto py-6 space-y-8 hide-scrollbar">
                <section>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.severity')}</p>
                      <Badge className={cn(severityConfig[selectedFinding.severity].color, 'text-[10px] px-2 py-0.5')}>{severityLabels[selectedFinding.severity].toUpperCase()}</Badge>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.status')}</p>
                      <div className="flex items-center gap-1.5">
                        <div className={cn('w-2 h-2 rounded-full', statusConfig[selectedFinding.status].dotColor)} />
                        <span className="text-xs font-bold text-slate-700">{statusLabels[selectedFinding.status]}</span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.dueDate')}</p>
                      <span className="text-xs font-bold text-slate-700">{formatDate(selectedFinding.dueDate)}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.progress')}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sourceAudit?.progress ?? 0}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600">{sourceAudit?.progress ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                </section>
                <section className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.owner')}</h3>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    {selectedFinding.owner.avatar ? (
                      <img src={dicebearAvatar(selectedFinding.owner.avatar)} className="w-8 h-8 rounded-full" alt={selectedFinding.owner.name} />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{selectedFinding.owner.name.charAt(0)}</div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedFinding.owner.name}</p>
                      {sourceAudit?.assignee.department && <p className="text-[10px] text-slate-500">{sourceAudit.assignee.department}</p>}
                    </div>
                  </div>
                </section>
                <section className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.issueSummary')}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{selectedFinding.description}</p>
                  {selectedFinding.severity === 'critical' && (
                    <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                      <div className="flex items-center gap-2 text-rose-700 font-bold text-xs mb-2">
                        <Icon icon="lucide:alert-circle" />
                        {t('reports.priorityActionRequired')}
                      </div>
                      <p className="text-[11px] text-rose-600">{t('reports.mandatoryFixRequired')}</p>
                    </div>
                  )}
                </section>
                {sourceAudit?.team && sourceAudit.team.length > 0 && (
                  <section className={isRTL ? 'text-right' : ''}>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('navigation.team' as TranslationKey)}</h3>
                    <div className="space-y-2">
                      {sourceAudit.team.map((member) => (
                        <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                          {member.avatar ? (
                            <img src={dicebearAvatar(member.avatar)} className="w-6 h-6 rounded-full" alt={member.name} />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500">{member.name.charAt(0)}</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{member.name}</p>
                            <p className="text-[10px] text-slate-400">{member.role}</p>
                          </div>
                          {member.isOwner && <Badge className="bg-emerald-50 text-emerald-600 text-[8px] px-1.5 py-0">{t('audits.owner' as TranslationKey)}</Badge>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {sourceAudit?.documents && sourceAudit.documents.length > 0 && (
                  <section className={isRTL ? 'text-right' : ''}>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.evidenceArtifacts')}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {sourceAudit.documents.map((doc) => (
                        <div key={doc.id} className="p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors">
                          <Icon icon={docTypeIcons[doc.type] || 'lucide:file'} className={docTypeColors[doc.type] || 'text-slate-500'} />
                          <span className="text-[10px] font-bold truncate">{doc.name}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {sourceAudit?.comments && sourceAudit.comments.length > 0 && (
                  <section className={isRTL ? 'text-right' : ''}>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('audits.comments' as TranslationKey)}</h3>
                    <div className="space-y-3">
                      {sourceAudit.comments.map((comment) => (
                        <div key={comment.id} className="p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            {comment.author.avatar ? (
                              <img src={dicebearAvatar(comment.author.avatar)} className="w-5 h-5 rounded-full" alt={comment.author.name} />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">{comment.author.name.charAt(0)}</div>
                            )}
                            <span className="text-[10px] font-bold text-slate-700">{comment.author.name}</span>
                            <span className="text-[9px] text-slate-400">{formatDate(new Date(comment.createdAt))}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <div className="pt-6 border-t border-slate-100 flex gap-3">
                {/* W52 (owner): the printable "Share Report" of a single
                    finding row made no sense — the audit's details live in
                    the audit itself. The drawer's one action is going there. */}
                {sourceAudit && (
                  <Link href={`/reports/${sourceAudit.id}`} className="flex-1 bg-slate-900 text-white py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-center">
                    {t('reports.viewAuditDetails')} <Icon icon="lucide:external-link" className="w-3 h-3 shrink-0" />
                  </Link>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}
