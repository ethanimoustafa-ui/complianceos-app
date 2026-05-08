'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { useTranslation } from '@/i18n'
import { useObservationStore } from '@/stores/observation-store'
import { useAuditStore } from '@/stores/audit-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useWorkload } from '@/hooks/useWorkload'
import { Button } from '@/components/ui/button'
import { CircularProgressRing } from './CircularProgressRing'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'

interface OfficerViewProps {
  metrics: DashboardMetrics
}

export function OfficerView({ metrics }: OfficerViewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const targetScore = useComplianceSettingsStore(s => s.targetScore)
  const userId = metrics.currentUser?.id ?? ''
  const userName = metrics.currentUser?.name ?? ''

  // Hero card "Compliance Health" reads the business compliance score
  // (per-department compliant/non-compliant from /reports/compliance-review).
  // The 7-component team-execution score lives elsewhere as Team Score.
  const healthScore = Math.round(metrics.health.businessComplianceScore)
  const healthEvaluated = metrics.health.businessComplianceEvaluated
  const isPending = healthEvaluated === 0
  const isAtRisk = !isPending && healthScore < targetScore
  const policiesOk = metrics.policies.approved
  const policiesOverdue = metrics.policies.overdue + metrics.policies.requiresReview

  // Personal workload
  const workload = useWorkload(userId, undefined, userName)

  // Cross-store items
  const observations = useObservationStore(s => s.observations)
  const audits = useAuditStore(s => s.audits)
  const policies = usePolicyStore(s => s.policies)
  const letters = useSAMALetterStore(s => s.letters)
  const notifications = useNotificationStore(s => s.notifications)

  // My items
  const myObservations = useMemo(() =>
    observations.filter(o => {
      const assigneeMatch = o.assignee?.id === userId || o.assignee?.name === userName
        || o.assignees?.some(a => a.id === userId || a.name === userName)
      const leaderMatch = o.leaderId === userId
      return (assigneeMatch || leaderMatch) && o.status !== 'closed'
    }), [observations, userId, userName])

  const myAudits = useMemo(() =>
    audits.filter(a => {
      const match = a.assignee?.id === userId || a.assignee?.name === userId || a.assignee?.name === userName
      return match && ['pending', 'in_progress'].includes(a.status)
    }), [audits, userId, userName])

  const myPolicies = useMemo(() =>
    policies.filter(p => {
      const match = p.owner?.name === userId || p.owner?.name === userName
      return match && ['under-review', 'pending-approval'].includes(p.status)
    }), [policies, userId, userName])

  // Overdue items
  const now = Date.now()
  const myOverdue = useMemo(() => {
    let count = 0
    count += myObservations.filter(o => new Date(o.dueDate).getTime() < now).length
    count += myAudits.filter(a => a.status === 'overdue').length
    count += myPolicies.filter(p => p.status === 'overdue').length
    return count
  }, [myObservations, myAudits, myPolicies, now])

  // Task queue — all items sorted by due date
  const taskQueue = useMemo(() => {
    const items: Array<{ id: string; type: string; icon: string; title: string; dueDate: string; status: string; route: string }> = []

    for (const o of myObservations) {
      items.push({ id: o.id, type: t('navigation.observations'), icon: 'lucide:eye', title: o.title, dueDate: o.dueDate, status: o.status, route: `/correspondence/observations?id=${o.id}` })
    }
    for (const a of myAudits) {
      items.push({ id: a.id, type: t('navigation.audits'), icon: 'lucide:clipboard-check', title: a.title, dueDate: a.dueDate, status: a.status, route: `/reports/${a.id}` })
    }
    for (const p of myPolicies) {
      items.push({ id: p.id, type: t('navigation.regulatoryUpdates'), icon: 'lucide:file-check', title: p.name, dueDate: p.nextReviewDate, status: p.status, route: `/correspondence/regulatory-updates/policies?policyId=${p.id}` })
    }

    return items.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  }, [myObservations, myAudits, myPolicies])

  // Items needing my action (SAMA approval steps)
  const actionItems = useMemo(() => {
    const items: Array<{ id: string; title: string; type: string; route: string }> = []

    for (const l of letters) {
      if (l.status !== 'pending-approval') continue
      for (const step of l.approvalChain) {
        if (step.status === 'pending' && (step.assignedTo === userId || step.assignedTo === userName)) {
          items.push({ id: l.id, title: `${l.subject} — Step ${step.step} (${step.role})`, type: t('samaLetters.title'), route: `/correspondence/sama-letters?id=${l.id}` })
        }
      }
    }

    for (const p of policies) {
      if (!p.workflowTimeline) continue
      for (const step of p.workflowTimeline) {
        if (step.status === 'current' && (step.user === userId || step.user === userName)) {
          items.push({ id: p.id, title: `${p.name} — ${step.step}`, type: t('policies.approvalWorkflow'), route: `/correspondence/regulatory-updates/policies?policyId=${p.id}&tab=workflow` })
        }
      }
    }

    return items
  }, [letters, policies, userId, userName])

  // Upcoming due dates (next 14 days)
  const upcomingDueDates = useMemo(() => {
    const fourteenDays = 14 * 24 * 60 * 60 * 1000
    return taskQueue.filter(item => {
      const due = new Date(item.dueDate).getTime()
      return due > now && due <= now + fourteenDays
    })
  }, [taskQueue, now])

  // Recent notifications
  const recentNotifications = useMemo(() =>
    [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
  , [notifications])

  const hasAnyData = taskQueue.length > 0 || actionItems.length > 0

  return (
    <div className="space-y-8">
      {/* Hero Compliance Health — Officer: personal actions + threshold + workload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 health-gradient relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Left: status + threshold + personal action counts */}
            <div className="relative z-10 space-y-4 flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Badge variant={isPending ? 'warning' : isAtRisk ? 'danger' : 'success'} className="gap-2">
                  <Icon
                    icon={isPending ? 'lucide:circle-help' : isAtRisk ? 'lucide:alert-triangle' : 'lucide:check-circle'}
                    className="w-3 h-3"
                  />
                  {isPending
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
              {isPending ? (
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

              {/* Personal action summary */}
              <div className="pt-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('dashboard.yourActions')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: t('dashboard.myOpenObservations'), value: myObservations.length, icon: 'lucide:eye', color: 'text-rose-600' },
                    { label: t('dashboard.myPendingAudits'), value: myAudits.length, icon: 'lucide:clipboard-check', color: 'text-amber-600' },
                    { label: t('dashboard.myPoliciesUnderReview'), value: myPolicies.length, icon: 'lucide:file-check', color: 'text-blue-600' },
                    { label: t('dashboard.myOverdueItems'), value: myOverdue, icon: 'lucide:alert-triangle', color: 'text-rose-600' },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center gap-2">
                      <Icon icon={stat.icon} className={`text-sm ${stat.color}`} />
                      <span className="text-xs text-slate-600">{stat.value} {stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: ring (or pending placeholder) */}
            <div className="relative flex-shrink-0 flex justify-center">
              {isPending ? (
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

          {/* Dynamic action buttons — direct task actions */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-200/60">
            {myObservations.length > 0 && (
              <Button variant="dark" onClick={() => router.push('/observations')} className="gap-2">
                <Icon icon="lucide:eye" className="w-4 h-4" />
                {t('dashboard.closeObservations', { count: String(myObservations.length) })}
              </Button>
            )}
            {myAudits.length > 0 && (
              <Button variant={myObservations.length > 0 ? 'outline' : 'dark'} onClick={() => router.push('/reports')} className="gap-2">
                <Icon icon="lucide:clipboard-check" className="w-4 h-4" />
                {t('dashboard.completeAudits', { count: String(myAudits.length) })}
              </Button>
            )}
            {myPolicies.length > 0 && (
              <Button variant="outline" onClick={() => router.push('/correspondence/regulatory-updates/policies')} className="gap-2">
                <Icon icon="lucide:file-check" className="w-4 h-4" />
                {t('dashboard.reviewMyPolicies', { count: String(myPolicies.length) })}
              </Button>
            )}
            {actionItems.length > 0 && (
              <Button variant="outline" onClick={() => router.push('/correspondence')} className="gap-2">
                <Icon icon="lucide:check-circle" className="w-4 h-4" />
                {t('dashboard.resolveItems', { count: String(actionItems.length) })}
              </Button>
            )}
            {myObservations.length === 0 && myAudits.length === 0 && myPolicies.length === 0 && actionItems.length === 0 && (
              <p className="text-sm text-emerald-600 font-bold">{t('dashboard.noIssues')}</p>
            )}
          </div>
        </div>

        {/* Right: Personal workload ring + breakdown */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[2rem] p-8 flex flex-col items-center gap-4">
          <CircularProgressRing value={workload.percentage} size={120} color={workload.percentage >= 90 ? 'blue' : 'emerald'} />
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900">{t('dashboard.personalWorkload')}</p>
            <p className="text-xs text-slate-500 mt-1">{workload.totalAssignments} {t('dashboard.assignments')}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 w-full mt-2">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{workload.breakdown.observations}</p>
              <p className="text-[9px] text-slate-400 uppercase">{t('dashboard.obsShort')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{workload.breakdown.audits}</p>
              <p className="text-[9px] text-slate-400 uppercase">{t('dashboard.auditsShort')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{workload.breakdown.policies}</p>
              <p className="text-[9px] text-slate-400 uppercase">{t('dashboard.policyShort')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{workload.breakdown.correspondence}</p>
              <p className="text-[9px] text-slate-400 uppercase">{t('dashboard.corrShort')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Framework Compliance */}
      {(() => {
        const fwEntries = metrics.frameworks.enabled
          .filter(fw => metrics.compliance.frameworks[fw.id])
          .map(fw => ({ id: fw.id, name: fw.name, icon: fw.icon, score: metrics.compliance.frameworks[fw.id] }))
        if (fwEntries.length === 0) return null
        const getColor = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444'
        const r = 28, circ = 2 * Math.PI * r
        return (
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('dashboard.frameworkCompliance' as any)}
            </h3>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(fwEntries.length, 5)}, minmax(0, 1fr))` }}>
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

      {!hasAnyData ? (
        <Card className="p-12 text-center">
          <Icon icon="lucide:check-circle" className="text-4xl text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-slate-900">{t('dashboard.allCaughtUp')}</p>
          <p className="text-sm text-slate-500 mt-1">{t('dashboard.noPendingItems')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* My Task Queue */}
          <div className="lg:col-span-8">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
              {t('dashboard.myTaskQueue')}
            </h3>
            <Card className="divide-y divide-slate-100">
              {taskQueue.length > 0 ? (
                taskQueue.slice(0, 10).map(item => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => router.push(item.route)}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-start cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Icon icon={item.icon} className="text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-[10px] text-slate-400">{item.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400">{item.dueDate}</span>
                      <Badge variant={getStatusVariant(item.status)} size="sm">{item.status}</Badge>
                      <Icon icon="lucide:chevron-right" className="text-slate-300 text-sm" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">{t('dashboard.noTasks')}</p>
                </div>
              )}
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Items Needing Action */}
            {actionItems.length > 0 && (
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                  {t('dashboard.itemsNeedingAction')}
                </h3>
                <div className="space-y-2">
                  {actionItems.map(item => (
                    <Card key={`${item.type}-${item.id}`} className="p-4">
                      <button onClick={() => router.push(item.route)} className="w-full text-start cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="warning" size="sm">{t('dashboard.approvalNeeded')}</Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{item.type}</p>
                      </button>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Due Dates */}
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                {t('dashboard.myDueDates')}
              </h3>
              <Card className="p-4">
                {upcomingDueDates.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingDueDates.slice(0, 6).map(item => (
                      <div key={`${item.type}-${item.id}`} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon icon={item.icon} className="text-slate-400 text-sm" />
                          <span className="text-xs text-slate-700">{item.title}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{item.dueDate}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">{t('dashboard.noDueItems')}</p>
                )}
              </Card>
            </div>

            {/* Recent Activity */}
            {recentNotifications.length > 0 && (
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                  {t('dashboard.recentActivity')}
                </h3>
                <Card className="divide-y divide-slate-100">
                  {recentNotifications.map(n => (
                    <div key={n.id} className="px-4 py-3">
                      <p className="text-xs text-slate-700">{n.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{n.message}</p>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
