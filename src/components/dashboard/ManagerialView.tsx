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
import { AlertCard } from './AlertCard'
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
    if (metrics.compliance.overall < targetScore) {
      list.push({ type: 'warning', title: t('dashboard.trendAlert'), message: t('dashboard.alertComplianceLow', { score: String(Math.round(metrics.compliance.overall)), target: String(targetScore) }), route: '/reports' })
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

  // Compliance components
  const components = metrics.compliance.components

  // Observations by source
  const obsTotal = metrics.observations.total || 1

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

      {/* Compliance by Component */}
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
          {t('dashboard.complianceByComponent')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(components).map(([key, comp]) => {
            const score = Math.round(comp.score)
            const variant = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'
            const labels: Record<string, string> = {
              auditCompletion: 'Audit',
              observationClosure: 'Observations',
              riskPosture: 'Risk',
              policyCurrency: 'Policy',
              trainingCompletion: 'Training',
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
