'use client'

import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { useTranslation, type TranslationKey } from '@/i18n'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useDashboardApprovals } from '@/hooks/useDashboardApprovals'
import type { ApprovalItem } from '@/app/api/dashboard/approvals/route'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useNavigationLoading } from '@/hooks/useNavigationLoading'
import { AlertCard } from './AlertCard'
import { CircularProgressRing } from './CircularProgressRing'
import { TrainingProgressBar } from './TrainingProgressBar'
import { TeamMemberWorkload } from './TeamMemberWorkload'
import { ObservationCard } from './ObservationCard'
import { formatTimelineDate } from '@/lib/format-date'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useTeamWorkloads, useBurnoutDetection } from '@/hooks/useWorkload'
import { useDepartmentStore } from '@/stores/department-store'

interface ManagerialViewProps {
  metrics: DashboardMetrics
}

export function ManagerialView({ metrics }: ManagerialViewProps) {
  const { t, isRTL } = useTranslation()
  const { navigate, pendingKey } = useNavigationLoading()
  const targetScore = useComplianceSettingsStore(s => s.targetScore)
  const departments = useDepartmentStore(s => s.departments)

  const getDeptLabel = (name: string) => {
    const dept = departments.find(d => d.name === name || d.id === name)
    if (dept) return isRTL ? dept.nameAr : dept.name
    return name
  }

  // Pending approvals — server-sourced (/api/dashboard/approvals). Was a
  // client-side scan of the letters/policies/audits stores; the view only maps
  // entity -> i18n label + route here.
  const { items: approvalItems, total: pendingApprovalsTotal } = useDashboardApprovals()
  const pendingApprovals = useMemo(() => {
    const meta: Record<ApprovalItem['entity'], { type: string; typeKey: string; route: (id: string) => string }> = {
      letter: { type: 'SAMA Letter', typeKey: t('letters.title'), route: (id) => `/correspondence/letters?id=${id}` },
      policy: { type: 'Policy', typeKey: t('navigation.regulatoryUpdates'), route: (id) => `/correspondence/regulatory-updates/policies?policyId=${id}&tab=workflow` },
      audit: { type: 'Audit', typeKey: t('navigation.audits'), route: (id) => `/reports/${id}` },
    }
    return approvalItems.map((it) => ({
      id: it.id,
      type: meta[it.entity].type,
      typeKey: meta[it.entity].typeKey,
      title: it.title,
      status: it.status,
      dueDate: it.dueDate ?? undefined,
      route: meta[it.entity].route(it.id),
    }))
  }, [approvalItems, t])

  // Smart alerts
  const alerts = useMemo(() => {
    const list: Array<{ type: 'critical' | 'warning'; title: string; message: string; route: string }> = []
    if (metrics.samaLetters.overdueCount > 0) {
      list.push({ type: 'critical', title: t('dashboard.criticalActionRequired'), message: t('dashboard.alertSamaOverdue', { count: String(metrics.samaLetters.overdueCount) }), route: '/correspondence' })
    }
    // Suppress the trend alert when nothing has been evaluated yet (§1.A);
    // a fully-pending org is "neutral pending", not "at risk".
    if (
      metrics.health.businessComplianceEvaluated > 0 &&
      metrics.health.businessComplianceScore < targetScore
    ) {
      list.push({ type: 'warning', title: t('dashboard.trendAlert'), message: t('dashboard.alertComplianceLow', { score: String(Math.round(metrics.health.businessComplianceScore)), target: String(targetScore) }), route: '/reports/compliance-review' })
    }
    return list.slice(0, 2)
  }, [metrics, targetScore, t])

  // Team workloads + burnout
  const workloads = useTeamWorkloads(metrics.team.members)
  const burnoutMembers = useBurnoutDetection(
    metrics.team.members.map(m => ({ ...m, workload: workloads[m.id]?.percentage ?? m.workload }))
  )

  const allWorkers = useMemo(() => {
    return [...metrics.team.members]
      .map(m => ({ ...m, computed: workloads[m.id]?.percentage ?? m.workload }))
      .sort((a, b) => b.computed - a.computed)
  }, [metrics.team.members, workloads])

  // Health components (7-component) — used for the bottom Team Score grid.
  const components = metrics.health.components
  // Hero card "Compliance Health" + threshold bar reads the business
  // compliance score (per-department compliant/non-compliant from the
  // Compliance Review tab); the 7-component score is shown separately below
  // labelled as Team Score.
  const healthScore = Math.round(metrics.health.businessComplianceScore)
  const healthEvaluated = metrics.health.businessComplianceEvaluated
  // Loading (stores still on first fetch) vs. genuine Pending (loaded, nothing
  // evaluated) — see ExecutiveView for the full rationale.
  const isHealthLoading = metrics.complianceHealthLoading
  const isPending = !isHealthLoading && healthEvaluated === 0
  const isAtRisk = !isHealthLoading && !isPending && healthScore < targetScore

  // Observations by source
  const obsTotal = metrics.observations.total || 1

  // Dynamic actions — sorted worst-first, up to 3 buttons
  const criticalActions = useMemo(() => {
    const componentRoutes: Record<string, { label: string; route: string; icon: string }> = {
      audits: { label: t('dashboard.reviewAudits'), route: '/reports', icon: 'lucide:clipboard-check' },
      observations: { label: t('dashboard.reviewObservations'), route: '/observations', icon: 'lucide:eye' },
      letters: { label: t('dashboard.reviewLetters'), route: '/correspondence', icon: 'lucide:file-text' },
      policies: { label: t('dashboard.reviewPolicies'), route: '/correspondence/regulatory-updates/policies', icon: 'lucide:file-check' },
      circulars: { label: t('dashboard.reviewCirculars'), route: '/correspondence/regulatory-updates', icon: 'lucide:scale' },
      riskPosture: { label: t('dashboard.reviewRisks'), route: '/reports/risks', icon: 'lucide:shield-alert' },
      training: { label: t('dashboard.reviewTraining'), route: '/team/training', icon: 'lucide:graduation-cap' },
    }

    return Object.entries(metrics.health.components)
      .filter(([, c]) => c.confidence !== 'insufficient' && c.score < 80)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 3)
      .map(([key, comp]) => ({
        ...componentRoutes[key],
        score: Math.round(comp.score),
        key,
      }))
  }, [metrics.health.components, t])

  // Top deductions for inline display
  const topDeductions = metrics.health.deductions.slice(0, 3)

  return (
    <div className="space-y-8">
      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert, i) => {
            const key = `mgr-alert-${i}`
            return (
              <AlertCard
                key={i}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                actionLabel={alert.type === 'critical' ? t('dashboard.resolveNow') : t('dashboard.viewDetails')}
                loading={pendingKey === key}
                loadingLabel={t('dashboard.opening')}
                onAction={() => navigate(key, alert.route)}
              />
            )
          })}
        </div>
      )}

      {/* Hero Compliance Health — Managerial: threshold bar + top issues + action buttons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 health-gradient relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Left: status + threshold + issues */}
            <div className="relative z-10 space-y-4 flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Badge variant={isHealthLoading ? 'neutral' : isPending ? 'warning' : isAtRisk ? 'danger' : 'success'} className="gap-2">
                  <Icon
                    icon={isHealthLoading ? 'lucide:loader-2' : isPending ? 'lucide:circle-help' : isAtRisk ? 'lucide:alert-triangle' : 'lucide:check-circle'}
                    className={cn('w-3 h-3', isHealthLoading && 'animate-spin')}
                  />
                  {isHealthLoading
                    ? t('common.loading')
                    : isPending
                      ? t('complianceReview.pendingScoreLabel')
                      : isAtRisk
                        ? t('dashboard.statusAtRisk')
                        : t('dashboard.statusOptimal')}
                </Badge>
                <span className="text-xs font-bold text-slate-400">{t('dashboard.thresholdLabel')}: {targetScore}%</span>
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-900 leading-tight">
                {t('dashboard.complianceHealth')}
              </h2>

              {/* Threshold progress bar */}
              {isHealthLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-full rounded-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-2 w-8" />
                    <Skeleton className="h-2 w-16" />
                    <Skeleton className="h-2 w-8" />
                  </div>
                </div>
              ) : isPending ? (
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-100 rounded-full relative overflow-hidden border border-dashed border-amber-300" />
                  <div className="flex justify-between text-[10px] font-bold text-amber-700">
                    <span>{t('complianceReview.notYetEvaluated')}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-100 rounded-full relative overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${healthScore >= targetScore ? 'bg-emerald-500' : healthScore >= targetScore * 0.8 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(healthScore, 100)}%` }}
                    />
                    {/* Threshold marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-slate-900"
                      style={{ insetInlineStart: `${targetScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>0%</span>
                    <span>{healthScore}% / {targetScore}%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Top issues inline */}
              {topDeductions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboard.topIssues')}</p>
                  {topDeductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant={d.severity === 'critical' || d.severity === 'high' ? 'danger' : d.severity === 'medium' ? 'warning' : 'neutral'} size="sm">
                        {Math.abs(d.points)}pt
                      </Badge>
                      <span className="text-slate-600 truncate">{d.descriptionKey ? t(d.descriptionKey as any, d.descriptionParams) : d.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: ring (loading / pending placeholder / real ring) */}
            <div className="relative flex-shrink-0 flex flex-col items-center justify-center gap-2">
              {isHealthLoading ? (
                <>
                  <Skeleton className="h-[152px] w-[152px] rounded-full" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('dashboard.calculatingHealth')}
                  </p>
                </>
              ) : isPending ? (
                <div className="flex flex-col items-center justify-center w-[152px] h-[152px] rounded-full border-2 border-dashed border-amber-300 bg-amber-50/40">
                  <p className="text-3xl font-bold text-amber-600">—</p>
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-1">
                    {t('complianceReview.pendingScoreLabel')}
                  </p>
                </div>
              ) : (
                <CircularProgressRing value={healthScore} size={152} label={t('dashboard.health')} />
              )}
            </div>
          </div>

          {/* Dynamic action buttons */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-200/60">
            {criticalActions.length > 0 ? (
              criticalActions.map(action => {
                const key = `mgr-crit-${action.key}`
                const loadingThis = pendingKey === key
                return (
                  <Button key={action.key} variant={action.score < 60 ? 'dark' : 'outline'} loading={loadingThis} onClick={() => navigate(key, action.route)} className="gap-2 active:scale-[0.98]">
                    {!loadingThis && <Icon icon={action.icon} className="w-4 h-4" />}
                    {action.label}
                    <Badge variant={action.score >= 60 ? 'warning' : 'danger'} size="sm">{action.score}%</Badge>
                  </Button>
                )
              })
            ) : (
              <p className="text-sm text-emerald-600 font-bold">{t('dashboard.noIssues')}</p>
            )}
          </div>
        </div>

        {/* Right column: SAMA + key counts */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t('dashboard.criticalActions')}</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t('dashboard.overdueLabel')}</span>
                <div className="flex items-center gap-2">
                  {metrics.samaLetters.overdueCount > 0 && <Badge variant="danger" size="sm">{metrics.samaLetters.overdueCount} {t('letters.title')}</Badge>}
                  {metrics.audits.overdueCount > 0 && <Badge variant="danger" size="sm">{metrics.audits.overdueCount} {t('navigation.audits')}</Badge>}
                  {metrics.policies.overdue > 0 && <Badge variant="danger" size="sm">{metrics.policies.overdue} {t('navigation.regulatoryUpdates')}</Badge>}
                  {metrics.samaLetters.overdueCount === 0 && metrics.audits.overdueCount === 0 && metrics.policies.overdue === 0 && (
                    <Badge variant="success" size="sm">0</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t('dashboard.pendingApprovals')}</span>
                <span className="text-sm font-bold text-slate-900">{pendingApprovalsTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t('dashboard.openRisks')}</span>
                <span className="text-sm font-bold text-slate-900">{metrics.risks.open}</span>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t('dashboard.samaSubmissions')}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{t('dashboard.upcoming30d')}</span><span className="font-bold text-slate-900">{metrics.samaLetters.upcoming30d}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('dashboard.completedMonth')}</span><span className="font-bold text-emerald-600">{metrics.samaLetters.completedThisMonth}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('dashboard.totalSubmissions')}</span><span className="font-bold text-slate-900">{metrics.samaLetters.total}</span></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Compliance by Component — 7 health components */}
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
          {t('dashboard.complianceByComponent')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Object.entries(components).map(([key, comp]) => {
            const score = Math.round(comp.score)
            const variant = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'
            const labels: Record<string, string> = {
              audits: t('dashboard.healthAudits'),
              observations: t('dashboard.healthObservations'),
              letters: t('dashboard.healthLetters'),
              policies: t('dashboard.healthPolicies'),
              circulars: t('dashboard.healthCirculars'),
              riskPosture: t('dashboard.healthRiskPosture'),
              training: t('dashboard.healthTraining'),
            }
            return (
              <Card key={key} className="p-4 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{labels[key] || key}</p>
                <p className="text-2xl font-black text-slate-900">{score}%</p>
                <div className="flex justify-center gap-2 mt-2">
                  <Badge variant={variant} size="sm">w: {comp.weight}%</Badge>
                  <Badge variant="neutral" size="sm">{({
                    'high': t('dashboard.confidenceHigh' as TranslationKey),
                    'moderate': t('dashboard.confidenceModerate' as TranslationKey),
                    'low': t('dashboard.confidenceLow' as TranslationKey),
                    'insufficient': t('dashboard.confidenceInsufficient' as TranslationKey),
                  } as Record<string, string>)[comp.confidence] ?? comp.confidence}</Badge>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Framework Compliance */}
      {(() => {
        const fwEntries = metrics.frameworks.enabled
          .filter(fw => metrics.compliance.frameworks[fw.id])
          .map(fw => ({ id: fw.id, name: isRTL ? fw.nameAr : fw.name, icon: fw.icon, score: metrics.compliance.frameworks[fw.id] }))
        if (fwEntries.length === 0) return null
        const getColor = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444'
        const r = 28, circ = 2 * Math.PI * r
        return (
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('dashboard.frameworkCompliance' as TranslationKey)}
            </h3>
            <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(fwEntries.length, 5)}, minmax(0, 1fr))` }}>
              {fwEntries.map(fw => {
                const s = Math.round(fw.score.overall)
                const offset = circ - (s / 100) * circ
                return (
                  <Card key={fw.id} className="p-4 flex flex-col items-center gap-2">
                    <div className="relative" style={{ width: 68, height: 68 }}>
                      <svg width="68" height="68" className="transform -rotate-90">
                        <circle cx="34" cy="34" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
                        <circle cx="34" cy="34" r={r} fill="none" stroke={getColor(s)} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-slate-900">{s}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Icon icon={fw.icon} className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-medium text-slate-600 text-center">{fw.name}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Pending Approvals */}
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
          {t('dashboard.pendingApprovals')}
        </h3>
        <Card className="divide-y divide-slate-100">
          {pendingApprovals.length > 0 ? (
            pendingApprovals.slice(0, 8).map(item => {
              const key = `mgr-approval-${item.id}`
              const loadingThis = pendingKey === key
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(key, item.route)}
                  disabled={loadingThis}
                  aria-busy={loadingThis || undefined}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-start cursor-pointer disabled:cursor-wait"
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      icon={item.type === 'SAMA Letter' ? 'lucide:file-text' : item.type === 'Policy' ? 'lucide:file-check' : 'lucide:clipboard-check'}
                      className="text-slate-400"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="text-[10px] text-slate-400">{loadingThis ? t('dashboard.opening') : item.typeKey}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.dueDate && (
                      <span className="text-[10px] text-slate-400">{formatTimelineDate(item.dueDate, isRTL)}</span>
                    )}
                    <Badge variant={getStatusVariant(item.status)} size="sm">{item.typeKey}</Badge>
                    <Icon icon={loadingThis ? 'lucide:loader-2' : 'lucide:chevron-right'} className={cn('text-sm', loadingThis ? 'text-emerald-500 animate-spin' : 'text-slate-300')} />
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400">{t('dashboard.noPendingItems')}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Team Workload Distribution */}
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
          {t('dashboard.teamWorkloadDistribution')}
        </h3>
        <Card className="p-6">
          {allWorkers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {allWorkers.map(w => {
                const burnout = burnoutMembers.find(b => b.member.id === w.id)
                return (
                  <div key={w.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <TeamMemberWorkload
                        name={w.name}
                        avatar={w.avatar || w.name}
                        workload={w.computed}
                        overloaded={w.computed >= 90}
                        overloadedLabel={t('dashboard.overloaded')}
                      />
                    </div>
                    {burnout && (
                      <Badge
                        variant={burnout.escalationTier === 'severe' ? 'danger' : burnout.escalationTier === 'moderate' ? 'warning' : 'info'}
                        size="sm"
                      >
                        {burnout.escalationTier === 'severe' ? t('dashboard.burnoutSevere') : burnout.escalationTier === 'moderate' ? t('dashboard.burnoutModerate') : t('dashboard.burnoutMild')}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">{t('dashboard.noTeamMembers')}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Observations by Source */}
        <div className="lg:col-span-8">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('dashboard.observationsByDepartment')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ObservationCard
              title={t('dashboard.samaObservations')}
              count={metrics.observations.bySource.sama.total}
              progress={obsTotal > 0 ? Math.round((metrics.observations.bySource.sama.total / obsTotal) * 100) : 0}
              color="rose"
              detail={`${metrics.observations.bySource.sama.critical} ${t('dashboard.critical')}, ${metrics.observations.bySource.sama.high} ${t('dashboard.high')}`}
            />
            <ObservationCard
              title={t('dashboard.internalAudit')}
              count={metrics.observations.bySource.internal.total}
              progress={obsTotal > 0 ? Math.round((metrics.observations.bySource.internal.total / obsTotal) * 100) : 0}
              color="amber"
              detail={`${metrics.observations.bySource.internal.critical} ${t('dashboard.critical')}, ${metrics.observations.bySource.internal.high} ${t('dashboard.high')}`}
            />
            <ObservationCard
              title={t('dashboard.shariaBoard')}
              count={metrics.observations.bySource.sharia.total}
              progress={obsTotal > 0 ? Math.round((metrics.observations.bySource.sharia.total / obsTotal) * 100) : 0}
              color="blue"
              detail={`${metrics.observations.bySource.sharia.total} ${t('dashboard.pendingRemediation')}`}
            />
          </div>
        </div>

        {/* Risk Posture */}
        <div className="lg:col-span-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('dashboard.riskPostureSummary')}
          </h3>
          <Card className="p-6">
            <div className="space-y-4">
              {[
                { label: t('dashboard.critical'), count: metrics.risks.byLevel.critical, color: 'bg-rose-500' },
                { label: t('dashboard.high'), count: metrics.risks.byLevel.high, color: 'bg-amber-500' },
                { label: t('dashboard.medium'), count: metrics.risks.byLevel.medium, color: 'bg-blue-500' },
                { label: t('dashboard.low'), count: metrics.risks.byLevel.low, color: 'bg-slate-400' },
              ].map(risk => (
                <div key={risk.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${risk.color}`} />
                    <span className="text-sm text-slate-600">{risk.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{risk.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between">
              <span className="text-xs text-slate-400">{t('dashboard.totalOpen')}</span>
              <span className="text-sm font-bold text-slate-900">{metrics.risks.open}</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Training by Department */}
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
          {t('dashboard.trainingByDepartment')}
        </h3>
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metrics.training.departmentProgress.map(dept => (
              <TrainingProgressBar
                key={dept.name}
                label={getDeptLabel(dept.name)}
                value={dept.progress}
                color={dept.progress >= 80 ? 'emerald' : 'amber'}
              />
            ))}
          </div>
          {metrics.training.departmentProgress.length === 0 && (
            <p className="text-sm text-slate-400 text-center">{t('dashboard.noDataYet')}</p>
          )}
        </Card>
      </div>
    </div>
  )
}
