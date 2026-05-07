'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { AlertCard } from './AlertCard'
import { CircularProgressRing } from './CircularProgressRing'
import { ProgressItem } from './ProgressItem'
import { MetricCard } from './MetricCard'
import { ObservationCard } from './ObservationCard'
import { TrainingProgressBar } from './TrainingProgressBar'
import { TeamMemberWorkload } from './TeamMemberWorkload'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useTeamWorkloads } from '@/hooks/useWorkload'
import { useDepartmentStore } from '@/stores/department-store'

interface ExecutiveViewProps {
  metrics: DashboardMetrics
}

export function ExecutiveView({ metrics }: ExecutiveViewProps) {
  const { t, isRTL } = useTranslation()
  const router = useRouter()
  const targetScore = useComplianceSettingsStore(s => s.targetScore)
  const departments = useDepartmentStore(s => s.departments)

  const getDeptLabel = (name: string) => {
    const dept = departments.find(d => d.name === name || d.id === name)
    if (dept) return isRTL ? dept.nameAr : dept.name
    return name
  }

  const severityLabels: Record<string, string> = {
    critical: t('dashboard.critical'),
    high: t('dashboard.high'),
    medium: t('dashboard.medium'),
    low: t('dashboard.low'),
    minor: t('dashboard.minor'),
  }

  // Smart alerts — max 2, severity-sorted
  const alerts = useMemo(() => {
    const list: Array<{ type: 'critical' | 'warning'; title: string; message: string; route: string }> = []

    if (metrics.samaLetters.overdueCount > 0) {
      list.push({
        type: 'critical',
        title: t('dashboard.criticalActionRequired'),
        message: t('dashboard.alertSamaOverdue', { count: String(metrics.samaLetters.overdueCount) }),
        route: '/correspondence',
      })
    }

    const criticalObs = metrics.observations.bySource.sama.critical +
      metrics.observations.bySource.internal.critical +
      metrics.observations.bySource.sharia.critical
    if (criticalObs > 0) {
      list.push({
        type: 'critical',
        title: t('dashboard.criticalActionRequired'),
        message: t('dashboard.alertCriticalObs', { count: String(criticalObs) }),
        route: '/observations?status=open&severity=critical',
      })
    }

    if (metrics.health.businessComplianceScore < targetScore) {
      list.push({
        type: 'warning',
        title: t('dashboard.trendAlert'),
        message: t('dashboard.alertComplianceLow', { score: String(Math.round(metrics.health.businessComplianceScore)), target: String(targetScore) }),
        route: '/reports/compliance-review',
      })
    }

    if (metrics.training.saudization.gap < -2) {
      list.push({
        type: 'warning',
        title: t('dashboard.trendAlert'),
        message: t('dashboard.alertSaudizationGap', { gap: String(Math.abs(metrics.training.saudization.gap)) }),
        route: '/team/training',
      })
    }

    // Sort critical first, limit 2
    list.sort((a, b) => (a.type === 'critical' ? -1 : 1) - (b.type === 'critical' ? -1 : 1))
    return list.slice(0, 2)
  }, [metrics, targetScore, t])

  // Team workloads
  const workloads = useTeamWorkloads(metrics.team.members)
  const topWorkers = useMemo(() => {
    return [...metrics.team.members]
      .map(m => ({ ...m, computed: workloads[m.id]?.percentage ?? m.workload }))
      .sort((a, b) => b.computed - a.computed)
      .slice(0, 4)
  }, [metrics.team.members, workloads])

  const avgCapacity = useMemo(() => {
    if (topWorkers.length === 0) return 0
    return Math.round(topWorkers.reduce((s, w) => s + w.computed, 0) / topWorkers.length)
  }, [topWorkers])

  // Hero ring + at-risk flag are driven by the new business-compliance score
  // (sourced from /reports/compliance-review). The 7-component `overall`
  // continues to power the renamed Team Score paths elsewhere.
  const complianceScore = Math.round(metrics.health.businessComplianceScore)
  const isAtRisk = complianceScore < targetScore

  // Policy counts
  const policiesOk = metrics.policies.approved
  const policiesOverdue = metrics.policies.overdue + metrics.policies.requiresReview

  // Dynamic primary action — route to worst-scoring component
  const primaryAction = useMemo(() => {
    const componentRoutes: Record<string, { label: string; route: string }> = {
      audits: { label: t('dashboard.reviewAudits'), route: '/reports' },
      observations: { label: t('dashboard.reviewObservations'), route: '/observations' },
      letters: { label: t('dashboard.reviewLetters'), route: '/correspondence' },
      policies: { label: t('dashboard.reviewPolicies'), route: '/correspondence/regulatory-updates/policies' },
      circulars: { label: t('dashboard.reviewCirculars'), route: '/correspondence/regulatory-updates' },
      riskPosture: { label: t('dashboard.reviewRisks'), route: '/reports/risks' },
      training: { label: t('dashboard.reviewTraining'), route: '/team/training' },
    }

    // Find lowest-scoring component with sufficient data
    const entries = Object.entries(metrics.health.components)
      .filter(([, c]) => c.confidence !== 'insufficient')
      .sort((a, b) => a[1].score - b[1].score)

    if (entries.length > 0 && entries[0][1].score < 80) {
      return componentRoutes[entries[0][0]] ?? { label: t('dashboard.startReview'), route: '/reports' }
    }
    return { label: t('dashboard.startReview'), route: '/reports' }
  }, [metrics.health.components, t])

  // Observation progress helpers
  const obsTotal = metrics.observations.total || 1
  const samaObsCount = metrics.observations.bySource.sama.total
  const internalObsCount = metrics.observations.bySource.internal.total
  const shariaObsCount = metrics.observations.bySource.sharia.total

  return (
    <div className="space-y-8">
      {/* Top Alerts */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert, i) => (
            <AlertCard
              key={i}
              type={alert.type}
              title={alert.title}
              message={alert.message}
              actionLabel={alert.type === 'critical' ? t('dashboard.resolveNow') : t('dashboard.viewDetails')}
              onAction={() => router.push(alert.route)}
            />
          ))}
        </div>
      )}

      {/* Hero Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Compliance Health Card */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 health-gradient flex flex-col md:flex-row items-center gap-10 relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-md">
            <Badge variant={isAtRisk ? 'danger' : 'success'} className="gap-2">
              <Icon icon={isAtRisk ? 'lucide:alert-triangle' : 'lucide:check-circle'} className="w-3 h-3" />
              {isAtRisk ? t('dashboard.statusAtRisk') : t('dashboard.statusOptimal')}
            </Badge>
            <h2 className="text-3xl font-bold font-display text-slate-900 leading-tight">
              {t('dashboard.complianceHealth')}
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              <span className="font-bold text-emerald-600">{policiesOk} {t('dashboard.policiesUpToDate')}</span>.{' '}
              <span className="font-bold text-rose-500">{policiesOverdue} {t('dashboard.policiesOverdue')}</span>.
            </p>
            <div className="flex gap-4 pt-2">
              <Button variant="dark" onClick={() => router.push(primaryAction.route)}>{primaryAction.label}</Button>
              <Button variant="outline" onClick={() => router.push('/correspondence/regulatory-updates/policies')}>{t('dashboard.policyLibrary')}</Button>
            </div>
          </div>
          <div className="relative flex-1 flex justify-center">
            <CircularProgressRing value={complianceScore} size={176} label={t('dashboard.health')} />
          </div>
        </div>

        {/* SAMA Submissions */}
        <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2rem] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
              {t('dashboard.samaSubmissions')}
            </h3>
            <div className="space-y-5">
              <ProgressItem label={t('dashboard.overdueLabel')} value={metrics.samaLetters.overdueCount} total={metrics.samaLetters.total || 1} color="rose" />
              <ProgressItem label={t('dashboard.upcoming30d')} value={metrics.samaLetters.upcoming30d} total={metrics.samaLetters.total || 1} color="amber" />
              <ProgressItem label={t('dashboard.completedMonth')} value={metrics.samaLetters.completedThisMonth} total={metrics.samaLetters.total || 1} color="emerald" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-6 uppercase tracking-widest">
            {t('dashboard.totalSubmissions')}: {metrics.samaLetters.total}
          </p>
        </div>
      </div>

      {/* High Level Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon="lucide:scale"
          iconColor="blue"
          label={t('dashboard.rules')}
          title={t('dashboard.activeRules')}
          value={String(metrics.circulars.total)}
          details={[
            { text: `${metrics.circulars.implemented} ${t('dashboard.implemented')}`, color: 'emerald' },
            { text: `${metrics.circulars.total - metrics.circulars.implemented} ${t('common.pending')}`, color: 'slate' },
          ]}
        />
        <MetricCard
          icon="lucide:shield-alert"
          iconColor="amber"
          label={t('dashboard.risks')}
          title={t('dashboard.openRisks')}
          value={String(metrics.risks.open)}
          valueExtra={metrics.risks.byLevel.high > 0 ? `${metrics.risks.byLevel.high} ${t('dashboard.high')}` : undefined}
          details={[
            { text: `${metrics.risks.byLevel.medium} ${t('dashboard.medium')}`, color: 'slate' },
            { text: `${metrics.risks.byLevel.low} ${t('dashboard.low')}`, color: 'slate' },
          ]}
        />
        <MetricCard
          icon="lucide:mail"
          iconColor="slate"
          label={t('dashboard.correspondence')}
          title={t('dashboard.totalLetters')}
          value={String(metrics.correspondence.total)}
          details={[
            { text: `${metrics.correspondence.sent} ${t('dashboard.sent')}`, color: 'emerald' },
            { text: `${metrics.correspondence.drafts} ${t('dashboard.draftsPending')}`, color: 'slate' },
          ]}
        />
        <MetricCard
          icon="lucide:flag"
          iconColor="emerald"
          label={t('dashboard.saudization')}
          title={t('dashboard.currentStatus')}
          value={`${metrics.training.saudization.actual}%`}
          details={[
            { text: `${t('dashboard.target')}: ${metrics.training.saudization.target}%`, color: 'slate' },
            { text: `(${metrics.training.saudization.gap > 0 ? '+' : ''}${metrics.training.saudization.gap}%)`, color: metrics.training.saudization.gap >= 0 ? 'emerald' : 'rose' },
          ]}
        />
      </div>

      {/* Pinned Frameworks */}
      {metrics.frameworks.pinned.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
              {t('dashboard.activeFrameworks')}
            </h3>
            <button onClick={() => router.push('/settings')} className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
              {t('dashboard.configure')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {metrics.frameworks.pinned.map(fw => {
              const fwHealth = metrics.health.frameworkScores.find(fs => fs.frameworkId === fw.id)
              const score = fwHealth ? Math.round(fwHealth.overall) : null

              return (
                <Card key={fw.id} className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 bg-${fw.iconColor}-50 text-${fw.iconColor}-600 rounded-lg flex items-center justify-center`}>
                      <Icon icon={fw.icon} className="text-lg" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{fw.name}</p>
                    </div>
                  </div>
                  {score !== null ? (
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-black text-slate-900">{score}%</span>
                      <Badge variant={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'} size="sm">
                        {fwHealth!.confidence}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">N/A</span>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Deductions */}
      {metrics.health.deductions.length > 0 && (
        <div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('dashboard.topDeductions')}
          </h3>
          <Card className="divide-y divide-slate-100">
            {metrics.health.deductions.slice(0, 5).map((d, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={d.severity === 'critical' ? 'danger' : d.severity === 'high' ? 'danger' : d.severity === 'medium' ? 'warning' : 'neutral'} size="sm">
                    {severityLabels[d.severity] ?? d.severity}
                  </Badge>
                  <span className="text-sm text-slate-700">{d.descriptionKey ? t(d.descriptionKey as any, d.descriptionParams) : d.description}</span>
                </div>
                <span className="text-sm font-bold text-rose-600">-{Math.abs(d.points).toFixed(1)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Detailed Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Open Observations */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
              {t('dashboard.openObservationsBreakdown')}
            </h3>
            <span className="text-xs font-bold text-emerald-600">{metrics.observations.closedThisQuarter} {t('dashboard.closedThisQuarter')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ObservationCard
              title={t('dashboard.samaObservations')}
              count={samaObsCount}
              progress={obsTotal > 0 ? Math.round((samaObsCount / obsTotal) * 100) : 0}
              color="rose"
              detail={`${metrics.observations.bySource.sama.critical} ${t('dashboard.critical')}, ${metrics.observations.bySource.sama.high + metrics.observations.bySource.sama.medium} ${t('dashboard.moderate')}`}
            />
            <ObservationCard
              title={t('dashboard.internalAudit')}
              count={internalObsCount}
              progress={obsTotal > 0 ? Math.round((internalObsCount / obsTotal) * 100) : 0}
              color="amber"
              detail={`${metrics.observations.bySource.internal.critical} ${t('dashboard.critical')}, ${metrics.observations.bySource.internal.medium + metrics.observations.bySource.internal.low} ${t('dashboard.minor')}`}
            />
            <ObservationCard
              title={t('dashboard.shariaBoard')}
              count={shariaObsCount}
              progress={obsTotal > 0 ? Math.round((shariaObsCount / obsTotal) * 100) : 0}
              color="blue"
              detail={`${shariaObsCount} ${t('dashboard.pendingRemediation')}`}
            />
          </div>

          {/* Training Compliance */}
          <div className="pt-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('dashboard.mandatoryTrainingCompliance')}
            </h3>
            <Card className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-center gap-6">
                  <CircularProgressRing value={metrics.training.overallCompletion} size={96} strokeWidth={8} color="blue" compact />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t('dashboard.overallCompletion')}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {metrics.training.departmentProgress.reduce((s, d) => s + d.completed, 0)} {t('dashboard.employeesCompleted')}
                    </p>
                    <p className="text-xs text-rose-500 font-bold mt-1">
                      {metrics.training.departmentProgress.reduce((s, d) => s + d.overdue, 0)} {t('dashboard.pendingDue')}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {metrics.training.departmentProgress.slice(0, 3).map(dept => (
                    <TrainingProgressBar
                      key={dept.name}
                      label={getDeptLabel(dept.name)}
                      value={dept.progress}
                      color={dept.progress >= 80 ? 'emerald' : 'amber'}
                    />
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Team Workload */}
        <div className="lg:col-span-4 space-y-8">
          <section>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('dashboard.teamWorkloadOverview')}
            </h3>
            <Card className="p-6">
              {topWorkers.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-bold text-slate-500 uppercase">{t('dashboard.averageCapacity')}</span>
                    <span className="text-lg font-black text-slate-900">{avgCapacity}%</span>
                  </div>
                  <div className="space-y-6">
                    {topWorkers.map(w => (
                      <TeamMemberWorkload
                        key={w.id}
                        name={w.name}
                        avatar={w.avatar || w.name}
                        workload={w.computed}
                        overloaded={w.computed >= 90}
                        overloadedLabel={t('dashboard.overloaded')}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm font-bold text-slate-400">{t('dashboard.noTeamMembers')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('dashboard.invitePrompt')}</p>
                </div>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
