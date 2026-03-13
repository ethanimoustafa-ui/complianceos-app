'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { useTranslation } from '@/i18n'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useAuditStore } from '@/stores/audit-store'
import { Button } from '@/components/ui/button'
import { AlertCard } from './AlertCard'
import { CircularProgressRing } from './CircularProgressRing'
import { TrainingProgressBar } from './TrainingProgressBar'
import { TeamMemberWorkload } from './TeamMemberWorkload'
import { ObservationCard } from './ObservationCard'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useTeamWorkloads, useBurnoutDetection } from '@/hooks/useWorkload'

interface ManagerialViewProps {
  metrics: DashboardMetrics
}

export function ManagerialView({ metrics }: ManagerialViewProps) {
  const { t, isRTL } = useTranslation()
  const router = useRouter()
  const targetScore = useComplianceSettingsStore(s => s.targetScore)

  // Pending approvals — cross-store
  const letters = useSAMALetterStore(s => s.letters)
  const policies = usePolicyStore(s => s.policies)
  const audits = useAuditStore(s => s.audits)

  const pendingApprovals = useMemo(() => {
    const items: Array<{ id: string; type: string; title: string; status: string; dueDate?: string; route: string }> = []

    for (const l of letters) {
      if (l.status === 'pending-approval') {
        items.push({ id: l.id, type: 'SAMA Letter', title: l.subject, status: l.status, dueDate: l.responseDeadline, route: '/correspondence' })
      }
    }
    for (const p of policies) {
      if (p.status === 'under-review') {
        items.push({ id: p.id, type: 'Policy', title: p.name, status: p.status, dueDate: p.nextReviewDate, route: '/correspondence/regulatory-updates/policies' })
      }
    }
    for (const a of audits) {
      if (a.status === 'pending') {
        items.push({ id: a.id, type: 'Audit', title: a.title, status: a.status, dueDate: a.dueDate, route: '/reports' })
      }
    }

    return items.sort((a, b) => {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [letters, policies, audits])

  // Smart alerts
  const alerts = useMemo(() => {
    const list: Array<{ type: 'critical' | 'warning'; title: string; message: string; route: string }> = []
    if (metrics.samaLetters.overdueCount > 0) {
      list.push({ type: 'critical', title: t('dashboard.criticalActionRequired'), message: t('dashboard.alertSamaOverdue', { count: String(metrics.samaLetters.overdueCount) }), route: '/correspondence' })
    }
    if (metrics.health.overall < targetScore) {
      list.push({ type: 'warning', title: t('dashboard.trendAlert'), message: t('dashboard.alertComplianceLow', { score: String(Math.round(metrics.health.overall)), target: String(targetScore) }), route: '/reports' })
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

  // Health components (7-component)
  const components = metrics.health.components
  const isAtRisk = metrics.health.overall < targetScore
  const healthScore = Math.round(metrics.health.overall)

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

      {/* Hero Compliance Health — Managerial: threshold bar + top issues + action buttons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 health-gradient relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Left: status + threshold + issues */}
            <div className="relative z-10 space-y-4 flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Badge variant={isAtRisk ? 'danger' : 'success'} className="gap-2">
                  <Icon icon={isAtRisk ? 'lucide:alert-triangle' : 'lucide:check-circle'} className="w-3 h-3" />
                  {isAtRisk ? t('dashboard.statusAtRisk') : t('dashboard.statusOptimal')}
                </Badge>
                <span className="text-xs font-bold text-slate-400">{t('dashboard.thresholdLabel')}: {targetScore}%</span>
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-900 leading-tight">
                {t('dashboard.complianceHealth')}
              </h2>

              {/* Threshold progress bar */}
              <div className="space-y-1.5">
                <div className="h-3 w-full bg-slate-100 rounded-full relative overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${healthScore >= targetScore ? 'bg-emerald-500' : healthScore >= targetScore * 0.8 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(healthScore, 100)}%` }}
                  />
                  {/* Threshold marker */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-slate-900"
                    style={{ left: `${targetScore}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>0%</span>
                  <span>{healthScore}% / {targetScore}%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Top issues inline */}
              {topDeductions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboard.topIssues')}</p>
                  {topDeductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant={d.severity === 'critical' || d.severity === 'high' ? 'danger' : d.severity === 'medium' ? 'warning' : 'neutral'} size="sm">
                        {Math.abs(d.points)}pt
                      </Badge>
                      <span className="text-slate-600 truncate">{d.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: ring */}
            <div className="relative flex-shrink-0 flex justify-center">
              <CircularProgressRing value={healthScore} size={152} label={t('dashboard.health')} />
            </div>
          </div>

          {/* Dynamic action buttons */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-200/60">
            {criticalActions.length > 0 ? (
              criticalActions.map(action => (
                <Button key={action.key} variant={action.score < 60 ? 'dark' : 'outline'} onClick={() => router.push(action.route)} className="gap-2">
                  <Icon icon={action.icon} className="w-4 h-4" />
                  {action.label}
                  <Badge variant={action.score >= 60 ? 'warning' : 'danger'} size="sm">{action.score}%</Badge>
                </Button>
              ))
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
                  {metrics.samaLetters.overdueCount > 0 && <Badge variant="danger" size="sm">{metrics.samaLetters.overdueCount} SAMA</Badge>}
                  {metrics.audits.overdueCount > 0 && <Badge variant="danger" size="sm">{metrics.audits.overdueCount} Audit</Badge>}
                  {metrics.policies.overdue > 0 && <Badge variant="danger" size="sm">{metrics.policies.overdue} Policy</Badge>}
                  {metrics.samaLetters.overdueCount === 0 && metrics.audits.overdueCount === 0 && metrics.policies.overdue === 0 && (
                    <Badge variant="success" size="sm">0</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t('dashboard.pendingApprovals')}</span>
                <span className="text-sm font-bold text-slate-900">{pendingApprovals.length}</span>
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
                  <Badge variant="neutral" size="sm">{comp.confidence}</Badge>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Pending Approvals */}
        <div className="lg:col-span-8">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('dashboard.pendingApprovals')}
          </h3>
          <Card className="divide-y divide-slate-100">
            {pendingApprovals.length > 0 ? (
              pendingApprovals.slice(0, 8).map(item => (
                <button
                  key={item.id}
                  onClick={() => router.push(item.route)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-start"
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      icon={item.type === 'SAMA Letter' ? 'lucide:file-text' : item.type === 'Policy' ? 'lucide:file-check' : 'lucide:clipboard-check'}
                      className="text-slate-400"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="text-[10px] text-slate-400">{item.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.dueDate && (
                      <span className="text-[10px] text-slate-400">{item.dueDate}</span>
                    )}
                    <Badge variant={getStatusVariant(item.status)} size="sm">{item.status}</Badge>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">{t('dashboard.noPendingItems')}</p>
              </div>
            )}
          </Card>
        </div>

        {/* Department KPIs */}
        <div className="lg:col-span-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('dashboard.departmentKpis')}
          </h3>
          <div className="space-y-3">
            {metrics.training.departmentProgress.map(dept => (
              <Card key={dept.name} className="p-4">
                <p className="text-xs font-bold text-slate-900 mb-1">{dept.name}</p>
                <div className="flex gap-4 text-[10px] text-slate-500 mb-2">
                  <span>{dept.employees} emp.</span>
                  <span className="text-emerald-600">{dept.completed} done</span>
                  <span className="text-amber-600">{dept.inProgress} in progress</span>
                  {dept.overdue > 0 && <span className="text-rose-600">{dept.overdue} overdue</span>}
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full">
                  <div
                    className={`h-full rounded-full ${dept.progress >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${dept.progress}%` }}
                  />
                </div>
              </Card>
            ))}
            {metrics.training.departmentProgress.length === 0 && (
              <Card className="p-6 text-center">
                <p className="text-sm text-slate-400">{t('dashboard.noDataYet')}</p>
              </Card>
            )}
          </div>
        </div>
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
                        {burnout.escalationTier}
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
              <span className="text-xs text-slate-400">Total Open</span>
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
                label={dept.name}
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
