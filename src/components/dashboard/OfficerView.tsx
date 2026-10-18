'use client'

import { useMemo, useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useNotificationStore } from '@/stores/notification-store'
import { useDashboardMyWork } from '@/hooks/useDashboardMyWork'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useWorkload } from '@/hooks/useWorkload'
import { useNavigationLoading } from '@/hooks/useNavigationLoading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CircularProgressRing } from './CircularProgressRing'
import { formatTimelineDate } from '@/lib/format/format-date'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'

interface OfficerViewProps {
  metrics: DashboardMetrics
}

export function OfficerView({ metrics }: OfficerViewProps) {
  const { t, isRTL } = useTranslation()
  const { navigate, pendingKey } = useNavigationLoading()
  const targetScore = useComplianceSettingsStore(s => s.targetScore)
  const userId = metrics.currentUser?.id ?? ''
  const userName = metrics.currentUser?.name ?? ''

  // Toggle between the two distinct compliance metrics on the hero card.
  // 'business' = per-department evaluation score (circulars + policies reviewed).
  // 'department' = 7-component weighted execution score (compliance dept ops).
  const [heroMode, setHeroMode] = useState<'business' | 'department'>('business')

  // Hero values driven by the active toggle mode.
  const healthScore = heroMode === 'business'
    ? Math.round(metrics.health.businessComplianceScore)
    // Department mode = the weighted compliance engine (same score as the Team
    // Score report), so the two surfaces always agree.
    : Math.round(metrics.compliance.overall)
  const healthEvaluated = heroMode === 'business'
    ? metrics.health.businessComplianceEvaluated
    : 1 // department score is always available once loaded
  // Loading (stores still on first fetch) vs. genuine Pending (loaded, nothing
  // evaluated) — see ExecutiveView for the full rationale.
  const isHealthLoading = metrics.complianceHealthLoading
  const isPending = !isHealthLoading && heroMode === 'business' && healthEvaluated === 0
  const isAtRisk = !isHealthLoading && !isPending && healthScore < targetScore

  // Personal workload
  const workload = useWorkload(userId, undefined, userName)

  // My work — server-scoped to the JWT user (/api/dashboard/my-work). Was
  // client-side filtering of the observations/audits/policies/letters stores.
  const { data: myWork, isLoading: myWorkLoading } = useDashboardMyWork()
  const myObservations = myWork.observations
  const myAudits = myWork.audits
  const myPolicies = myWork.policies
  const notifications = useNotificationStore(s => s.notifications)
  // The global LookupHydrator now hydrates only the unread COUNT (not the full
  // list) on mount, so the "Recent Activity" widget below — the one
  // always-visible reader of the full notifications array — fetches it itself.
  useEffect(() => {
    void useNotificationStore.getState().fetchNotifications().catch(() => {})
  }, [])

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

  // Status label resolver — maps raw DB enum strings to i18n-translated labels.
  // Covers observation, audit, and policy status values used in the task queue.
  const resolveStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      // observation statuses
      open:               t('observations.statusOptions.open'),
      in_progress:        t('observations.statusOptions.inProgress'),
      pending_review:     t('observations.statusOptions.pendingReview'),
      resolved:           t('observations.statusOptions.pendingReview'),
      closed:             t('observations.statusOptions.closed'),
      // audit statuses
      pending:            t('common.pending'),
      overdue:            t('regulatoryUpdates.overdueActions'),
      completed:          t('common.completed'),
      // policy statuses
      'under-review':     t('policies.statusUnderReview'),
      'pending-approval': t('letters.pendingApproval'),
      approved:           t('policies.statusApproved'),
      draft:              t('common.draft'),
      expired:            t('policies.statusExpired'),
      'requires-review':  t('policies.statusRequiresReview'),
    }
    return map[status] ?? status.replace(/_/g, ' ').replace(/-/g, ' ')
  }

  // Items needing my action — server-sourced (letter approval steps + policy
  // workflow steps assigned to me).
  const actionItems = useMemo(() =>
    myWork.actionItems.map((it) => ({
      id: it.id,
      title: `${it.name} — ${it.detail}`,
      type: it.entity === 'letter' ? t('letters.title') : t('policies.approvalWorkflow'),
      route: it.entity === 'letter'
        ? `/correspondence/letters?id=${it.id}`
        : `/correspondence/regulatory-updates/policies?policyId=${it.id}&tab=workflow`,
    })), [myWork.actionItems, t])

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
              <h2 key={heroMode} className="text-2xl font-bold font-display text-slate-900 leading-tight animate-fade-in">
                {heroMode === 'business'
                  ? t('dashboard.complianceHealth')
                  : t('dashboard.deptHealthLabel' as TranslationKey)}
              </h2>

              {/* Mode toggle: Business Compliance vs Compliance Dept Health */}
              <div
                role="group"
                aria-label={t('dashboard.healthToggleAriaLabel' as TranslationKey)}
                className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5"
              >
                <button
                  role="radio"
                  aria-checked={heroMode === 'business'}
                  onClick={() => setHeroMode('business')}
                  className={cn(
                    'px-3 py-1 text-[10px] font-bold rounded-md transition-all',
                    heroMode === 'business'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {t('dashboard.modeBusinessHealth' as TranslationKey)}
                </button>
                <button
                  role="radio"
                  aria-checked={heroMode === 'department'}
                  onClick={() => setHeroMode('department')}
                  className={cn(
                    'px-3 py-1 text-[10px] font-bold rounded-md transition-all',
                    heroMode === 'department'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {t('dashboard.modeDeptHealth' as TranslationKey)}
                </button>
              </div>

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

            {/* Right: ring — its arc sweeps to the new value on toggle via the
                CircularProgressRing stroke-dashoffset transition (no re-mount). */}
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

          {/* Dynamic action buttons — direct task actions */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-200/60">
            {myWorkLoading ? (
              <>
                <Skeleton className="h-10 w-44 rounded-lg" />
                <Skeleton className="h-10 w-40 rounded-lg" />
              </>
            ) : (
            <>
            {myObservations.length > 0 && (
              <Button variant="dark" loading={pendingKey === 'off-observations'} onClick={() => navigate('off-observations', '/correspondence/observations')} className="gap-2 active:scale-[0.98]">
                {pendingKey !== 'off-observations' && <Icon icon="lucide:eye" className="w-4 h-4" />}
                {t('dashboard.closeObservations', { count: String(myObservations.length) })}
              </Button>
            )}
            {myAudits.length > 0 && (
              <Button variant={myObservations.length > 0 ? 'outline' : 'dark'} loading={pendingKey === 'off-audits'} onClick={() => navigate('off-audits', '/reports')} className="gap-2 active:scale-[0.98]">
                {pendingKey !== 'off-audits' && <Icon icon="lucide:clipboard-check" className="w-4 h-4" />}
                {t('dashboard.completeAudits', { count: String(myAudits.length) })}
              </Button>
            )}
            {myPolicies.length > 0 && (
              <Button variant="outline" loading={pendingKey === 'off-policies'} onClick={() => navigate('off-policies', '/correspondence/regulatory-updates/policies')} className="gap-2 active:scale-[0.98]">
                {pendingKey !== 'off-policies' && <Icon icon="lucide:file-check" className="w-4 h-4" />}
                {t('dashboard.reviewMyPolicies', { count: String(myPolicies.length) })}
              </Button>
            )}
            {actionItems.length > 0 && (
              <Button variant="outline" loading={pendingKey === 'off-resolve'} onClick={() => navigate('off-resolve', '/correspondence')} className="gap-2 active:scale-[0.98]">
                {pendingKey !== 'off-resolve' && <Icon icon="lucide:check-circle" className="w-4 h-4" />}
                {t('dashboard.resolveItems', { count: String(actionItems.length) })}
              </Button>
            )}
            {myObservations.length === 0 && myAudits.length === 0 && myPolicies.length === 0 && actionItems.length === 0 && (
              <p className="text-sm text-emerald-600 font-bold">{t('dashboard.noIssues')}</p>
            )}
            </>
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

      {myWorkLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <Skeleton className="h-3 w-40 mb-4" />
            <Card className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="h-4 w-4 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/5" />
                      <Skeleton className="h-2 w-1/4" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </Card>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div>
              <Skeleton className="h-3 w-40 mb-4" />
              <Card className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                    <Skeleton className="h-2 w-12" />
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </div>
      ) : !hasAnyData ? (
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
                taskQueue.slice(0, 10).map(item => {
                  const key = `off-task-${item.type}-${item.id}`
                  const loadingThis = pendingKey === key
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => navigate(key, item.route)}
                      disabled={loadingThis}
                      aria-busy={loadingThis || undefined}
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-start cursor-pointer disabled:cursor-wait"
                    >
                      <div className="flex items-center gap-3">
                        <Icon icon={loadingThis ? 'lucide:loader-2' : item.icon} className={cn('text-slate-400', loadingThis && 'animate-spin text-emerald-500')} />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.title}</p>
                          <p className="text-[10px] text-slate-400">{loadingThis ? t('dashboard.opening') : item.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400">{formatTimelineDate(item.dueDate, isRTL)}</span>
                        <Badge variant={getStatusVariant(item.status)} size="sm">{resolveStatusLabel(item.status)}</Badge>
                        <Icon icon={loadingThis ? 'lucide:loader-2' : 'lucide:chevron-right'} className={cn('text-sm', loadingThis ? 'text-emerald-500 animate-spin' : 'text-slate-300')} />
                      </div>
                    </button>
                  )
                })
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
                  {actionItems.map(item => {
                    const key = `off-action-${item.type}-${item.id}`
                    const loadingThis = pendingKey === key
                    return (
                      <Card key={`${item.type}-${item.id}`} className="p-4 transition-colors active:bg-slate-100">
                        <button onClick={() => navigate(key, item.route)} disabled={loadingThis} aria-busy={loadingThis || undefined} className="w-full text-start cursor-pointer disabled:cursor-wait">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="warning" size="sm">{t('dashboard.approvalNeeded')}</Badge>
                            {loadingThis && <Icon icon="lucide:loader-2" className="text-xs text-emerald-500 animate-spin" />}
                          </div>
                          <p className="text-sm font-medium text-slate-900">{item.title}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{loadingThis ? t('dashboard.opening') : item.type}</p>
                        </button>
                      </Card>
                    )
                  })}
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
                        <span className="text-[10px] font-bold text-slate-500">{formatTimelineDate(item.dueDate, isRTL)}</span>
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
                      {n.createdAt && (
                        <p className="text-[9px] text-slate-400 mt-1">{formatTimelineDate(n.createdAt, isRTL)}</p>
                      )}
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
