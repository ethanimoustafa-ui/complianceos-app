'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

export default function DashboardPage() {
  const { t, isRTL } = useTranslation()
  const [showFadeIn, setShowFadeIn] = useState(false)

  useEffect(() => {
    // Check if we're coming from the welcome page
    const fromWelcome = sessionStorage.getItem('fromWelcome')
    if (fromWelcome) {
      setShowFadeIn(true)
      sessionStorage.removeItem('fromWelcome')
    }
  }, [])

  return (
    <div className={showFadeIn ? 'dashboard-fade-in' : ''}>
      <Header title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        <div className="space-y-8">

          {/* Top Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AlertCard
              type="critical"
              title={t('dashboard.criticalActionRequired')}
              message={t('dashboard.samaOverdueMessage')}
              actionLabel={t('dashboard.resolveNow')}
            />
            <AlertCard
              type="warning"
              title={t('dashboard.trendAlert')}
              message={t('dashboard.saudizationGapMessage')}
              actionLabel={t('dashboard.viewDetails')}
            />
          </div>

          {/* Hero Metrics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Compliance Health Card */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 health-gradient flex flex-col md:flex-row items-center gap-10 relative overflow-hidden">
              <div className="relative z-10 space-y-4 max-w-md">
                <Badge variant="success" className="gap-2">
                  <Icon icon="lucide:check-circle" className="w-3 h-3" />
                  {t('dashboard.statusOptimal')}
                </Badge>
                <h2 className="text-3xl font-bold font-display text-slate-900 leading-tight">
                  {t('dashboard.policyReviewStatus')}
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  <span className="font-bold text-emerald-600">42 {t('dashboard.policiesUpToDate')}</span>.{' '}
                  <span className="font-bold text-rose-500">3 {t('dashboard.policiesOverdue')}</span>.
                </p>
                <div className="flex gap-4 pt-2">
                  <Button variant="dark">{t('dashboard.startReview')}</Button>
                  <Button variant="outline">{t('dashboard.policyLibrary')}</Button>
                </div>
              </div>
              <div className="relative flex-1 flex justify-center">
                <CircularProgress value={94} size={176} label={t('dashboard.health')} />
              </div>
            </div>

            {/* SAMA Submissions */}
            <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2rem] flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
                  {t('dashboard.samaSubmissions')}
                </h3>
                <div className="space-y-5">
                  <ProgressItem label={t('dashboard.overdueLabel')} value={3} total={24} color="rose" />
                  <ProgressItem label={t('dashboard.upcoming30d')} value={8} total={24} color="amber" />
                  <ProgressItem label={t('dashboard.completedMonth')} value={13} total={24} color="emerald" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-6 uppercase tracking-widest">
                {t('dashboard.totalSubmissions')}: 24
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
              value="156"
              details={[
                { text: `142 ${t('dashboard.implemented')}`, color: 'emerald' },
                { text: `2 ${t('common.overdue')}`, color: 'rose' },
              ]}
            />
            <MetricCard
              icon="lucide:shield-alert"
              iconColor="amber"
              label={t('dashboard.risks')}
              title={t('dashboard.openRisks')}
              value="18"
              valueExtra={`4 ${t('dashboard.high')}`}
              details={[
                { text: `6 ${t('dashboard.medium')}`, color: 'slate' },
                { text: `8 ${t('dashboard.low')}`, color: 'slate' },
              ]}
            />
            <MetricCard
              icon="lucide:mail"
              iconColor="slate"
              label={t('dashboard.correspondence')}
              title={t('dashboard.totalLetters')}
              value="142"
              details={[
                { text: `128 ${t('dashboard.sent')}`, color: 'emerald' },
                { text: `14 ${t('dashboard.draftsPending')}`, color: 'slate' },
              ]}
            />
            <MetricCard
              icon="lucide:flag"
              iconColor="emerald"
              label={t('dashboard.saudization')}
              title={t('dashboard.currentStatus')}
              value="38.2%"
              details={[
                { text: `${t('dashboard.target')}: 42.0%`, color: 'slate' },
                { text: '(-3.8%)', color: 'rose' },
              ]}
            />
          </div>

          {/* Detailed Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Open Observations */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                  {t('dashboard.openObservationsBreakdown')}
                </h3>
                <span className="text-xs font-bold text-emerald-600">22 {t('dashboard.closedThisQuarter')}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ObservationCard
                  title={t('dashboard.samaObservations')}
                  count={8}
                  progress={75}
                  color="rose"
                  detail={`3 ${t('dashboard.critical')}, 5 ${t('dashboard.moderate')}`}
                />
                <ObservationCard
                  title={t('dashboard.internalAudit')}
                  count={15}
                  progress={50}
                  color="amber"
                  detail={`1 ${t('dashboard.critical')}, 14 ${t('dashboard.minor')}`}
                />
                <ObservationCard
                  title={t('dashboard.shariaBoard')}
                  count={4}
                  progress={25}
                  color="blue"
                  detail={`4 ${t('dashboard.pendingRemediation')}`}
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
                      <CircularProgress value={82} size={96} strokeWidth={8} color="blue" compact />
                      <div>
                        <p className="text-sm font-bold text-slate-800">{t('dashboard.overallCompletion')}</p>
                        <p className="text-xs text-slate-500 mt-1">1,240 {t('dashboard.employeesCompleted')}</p>
                        <p className="text-xs text-rose-500 font-bold mt-1">282 {t('dashboard.pendingDue')}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <TrainingProgress label={t('dashboard.retailBanking')} value={94} />
                      <TrainingProgress label={t('dashboard.riskCompliance')} value={100} />
                      <TrainingProgress label={t('dashboard.operations')} value={68} color="amber" />
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
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-bold text-slate-500 uppercase">{t('dashboard.averageCapacity')}</span>
                    <span className="text-lg font-black text-slate-900">88%</span>
                  </div>
                  <div className="space-y-6">
                    <TeamMemberWorkload
                      name="Michael C."
                      avatar="Michael"
                      workload={104}
                      overloaded
                      overloadedLabel={t('dashboard.overloaded')}
                    />
                    <TeamMemberWorkload name="Sarah L." avatar="Sarah" workload={82} overloadedLabel={t('dashboard.overloaded')} />
                    <TeamMemberWorkload name="Ahmed K." avatar="Ahmed" workload={91} overloadedLabel={t('dashboard.overloaded')} />
                    <TeamMemberWorkload name="Lisa M." avatar="Lisa" workload={76} overloadedLabel={t('dashboard.overloaded')} />
                  </div>
                </Card>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Component definitions
function AlertCard({
  type,
  title,
  message,
  actionLabel,
}: {
  type: 'critical' | 'warning'
  title: string
  message: string
  actionLabel: string
}) {
  const styles = {
    critical: {
      bg: 'bg-rose-50 border-rose-100',
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      titleColor: 'text-rose-900',
      messageColor: 'text-rose-800',
      buttonColor: 'text-rose-600 hover:text-rose-700 border-rose-200',
      icon: 'lucide:alert-triangle',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-100',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      titleColor: 'text-amber-900',
      messageColor: 'text-amber-800',
      buttonColor: 'text-amber-600 hover:text-amber-700 border-amber-200',
      icon: 'lucide:info',
    },
  }
  const s = styles[type]

  return (
    <div className={`p-4 ${s.bg} border rounded-2xl flex items-center gap-4`}>
      <div className={`w-10 h-10 ${s.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon icon={s.icon} className={`${s.iconColor} text-xl`} />
      </div>
      <div className="flex-1">
        <p className={`text-xs font-black ${s.titleColor} uppercase tracking-wider mb-0.5`}>
          {title}
        </p>
        <p className={`text-sm ${s.messageColor} font-medium`}>{message}</p>
      </div>
      <button
        className={`text-[10px] font-bold ${s.buttonColor} uppercase tracking-widest px-3 py-1 bg-white border rounded-lg cursor-pointer`}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function CircularProgress({
  value,
  size,
  strokeWidth = 10,
  label,
  color = 'emerald',
  compact = false,
}: {
  value: number
  size: number
  strokeWidth?: number
  label?: string
  color?: 'emerald' | 'blue'
  compact?: boolean
}) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  const strokeColor = color === 'blue' ? 'rgb(59, 130, 246)' : 'rgb(34, 197, 94)'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-100 stroke-current"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
        />
        <circle
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ stroke: strokeColor }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {compact ? (
          <span className="text-lg font-bold text-slate-900">{value}%</span>
        ) : (
          <>
            <span className="text-4xl font-black font-display text-slate-900">
              {value}
              <span className="text-lg">%</span>
            </span>
            {label && (
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">{label}</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProgressItem({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: 'rose' | 'amber' | 'emerald'
}) {
  const percentage = (value / total) * 100
  const colorClasses = {
    rose: 'text-rose-600 bg-rose-500',
    amber: 'text-amber-600 bg-amber-500',
    emerald: 'text-emerald-600 bg-emerald-500',
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className={`text-sm font-bold ${colorClasses[color].split(' ')[0]}`}>
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color].split(' ')[1]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </>
  )
}

function MetricCard({
  icon,
  iconColor,
  label,
  title,
  value,
  valueExtra,
  details,
}: {
  icon: string
  iconColor: 'blue' | 'amber' | 'slate' | 'emerald'
  label: string
  title: string
  value: string
  valueExtra?: string
  details: { text: string; color: string }[]
}) {
  const iconColors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  const labelColors = {
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-500 bg-slate-50',
    emerald: 'text-emerald-600 bg-emerald-50',
  }

  return (
    <Card hover className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-10 h-10 ${iconColors[iconColor]} rounded-xl flex items-center justify-center`}>
          <Icon icon={icon} className="text-xl" />
        </div>
        <span className={`text-[10px] font-black ${labelColors[iconColor]} px-2 py-0.5 rounded-full`}>
          {label}
        </span>
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</h4>
        <div className="flex gap-3 items-end">
          <p className="text-2xl font-black text-slate-900">{value}</p>
          {valueExtra && <span className="text-[10px] font-bold text-rose-500 mb-1">{valueExtra}</span>}
        </div>
        <div className="flex gap-2 text-[10px] font-bold mt-2">
          {details.map((d, i) => (
            <span key={i} className={`text-${d.color}-${d.color === 'slate' ? '500' : '600'}`}>
              {d.text}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

function ObservationCard({
  title,
  count,
  progress,
  color,
  detail,
}: {
  title: string
  count: number
  progress: number
  color: 'rose' | 'amber' | 'blue'
  detail: string
}) {
  const colors = {
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
  }

  return (
    <Card className="p-5">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{title}</span>
      <p className="text-2xl font-bold text-slate-900 mt-2">{String(count).padStart(2, '0')}</p>
      <div className="mt-4 flex items-center gap-1">
        <div className={`h-2 ${colors[color]} rounded-full`} style={{ width: `${progress}%` }} />
        <div className="h-2 flex-1 bg-slate-100 rounded-full" />
      </div>
      <p className="text-[9px] text-slate-400 mt-2">{detail}</p>
    </Card>
  )
}

function TrainingProgress({
  label,
  value,
  color = 'emerald',
}: {
  label: string
  value: number
  color?: 'emerald' | 'amber'
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-900">{value}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full">
        <div
          className={`h-full ${color === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500'} rounded-full`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

function TeamMemberWorkload({
  name,
  avatar,
  workload,
  overloaded = false,
  overloadedLabel = 'Overloaded',
}: {
  name: string
  avatar: string
  workload: number
  overloaded?: boolean
  overloadedLabel?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatar}`}
        className="w-8 h-8 rounded-lg"
        alt={name}
      />
      <div className="flex-1">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span>{name}</span>
          <span className={overloaded ? 'text-rose-600' : 'text-emerald-600'}>
            {workload}%{overloaded && ` (${overloadedLabel})`}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${overloaded ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(workload, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
