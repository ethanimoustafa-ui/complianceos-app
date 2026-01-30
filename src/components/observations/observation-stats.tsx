'use client'

import { memo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface StatCardProps {
  icon: string
  iconBg: string
  iconColor: string
  borderColor: string
  borderColorRTL: string
  label: string
  value: string
  subtext: string
  badge?: {
    text: string
    color: string
  }
  isRTL: boolean
}

const StatCard = memo(function StatCard({
  icon,
  iconBg,
  iconColor,
  borderColor,
  borderColorRTL,
  label,
  value,
  subtext,
  badge,
  isRTL,
}: StatCardProps) {
  return (
    <div
      className={`bg-white/80 backdrop-blur-sm border border-slate-100 p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${isRTL ? borderColorRTL : borderColor}`}
    >
      <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`p-2 ${iconBg} rounded-lg`}>
          <Icon icon={icon} className={`text-2xl ${iconColor}`} />
        </div>
        {badge ? (
          <span className={`text-[10px] font-bold ${badge.color} px-2 py-0.5 rounded-full`}>
            {badge.text}
          </span>
        ) : null}
      </div>
      <h3 className={`text-slate-500 text-xs font-bold uppercase tracking-wider mb-1 ${isRTL ? 'text-right' : ''}`}>{label}</h3>
      <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </div>
  )
})

export interface ObservationStatsData {
  total: number
  openCritical: number
  overdue: number
  inRemediation: number
  drafting: number
  closedThisQuarter: number
  quarterlyTarget: number
}

export interface ObservationStatsProps {
  stats?: ObservationStatsData
}

const formatStatValue = (value: number): string => {
  return value.toString().padStart(2, '0')
}

export const ObservationStats = memo(function ObservationStats({ stats }: ObservationStatsProps) {
  const { t, isRTL } = useTranslation()

  const data = stats ?? {
    total: 0,
    openCritical: 0,
    overdue: 0,
    inRemediation: 0,
    drafting: 0,
    closedThisQuarter: 0,
    quarterlyTarget: 30,
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        icon="lucide:layers"
        iconBg="bg-slate-50"
        iconColor="text-slate-600"
        borderColor="border-l-4 border-l-slate-400"
        borderColorRTL="border-r-4 border-r-slate-400"
        label={t('observations.stats.totalFindings')}
        value={formatStatValue(data.total)}
        subtext={t('observations.stats.acrossAllAudits')}
        isRTL={isRTL}
      />

      <StatCard
        icon="lucide:alert-octagon"
        iconBg="bg-rose-50"
        iconColor="text-rose-600"
        borderColor="border-l-4 border-l-rose-500"
        borderColorRTL="border-r-4 border-r-rose-500"
        label={t('observations.stats.openCritical')}
        value={formatStatValue(data.openCritical)}
        subtext={`${t('observations.stats.overdue')}: ${formatStatValue(data.overdue)}`}
        badge={data.openCritical > 0 ? { text: t('observations.stats.immediateAction'), color: 'text-rose-600 bg-rose-50' } : undefined}
        isRTL={isRTL}
      />

      <StatCard
        icon="lucide:clock"
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        borderColor="border-l-4 border-l-amber-400"
        borderColorRTL="border-r-4 border-r-amber-400"
        label={t('observations.stats.inRemediation')}
        value={formatStatValue(data.inRemediation)}
        subtext={`${t('observations.stats.draftingResponse')}: ${formatStatValue(data.drafting)}`}
        isRTL={isRTL}
      />

      <StatCard
        icon="lucide:check-circle"
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        borderColor="border-l-4 border-l-emerald-500"
        borderColorRTL="border-r-4 border-r-emerald-500"
        label={t('observations.stats.closedQ', { quarter: '3' })}
        value={formatStatValue(data.closedThisQuarter)}
        subtext={`${t('observations.stats.target')}: ${data.quarterlyTarget}`}
        badge={data.closedThisQuarter > 0 ? { text: t('observations.stats.verified'), color: 'text-emerald-600 bg-emerald-50' } : undefined}
        isRTL={isRTL}
      />
    </div>
  )
})
