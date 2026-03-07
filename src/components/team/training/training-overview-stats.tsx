'use client'

import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { TrainingOverviewStats as Stats } from '@/types'

interface TrainingOverviewStatsProps {
  stats: Stats
}

export function TrainingOverviewStats({ stats }: TrainingOverviewStatsProps) {
  const { t } = useTranslation()

  const cards = [
    {
      icon: 'lucide:graduation-cap',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      value: stats.overallCompletion != null ? `${stats.overallCompletion}%` : '—',
      label: t('training.overallCompletion' as TranslationKey),
      valueColor: 'text-slate-900',
    },
    {
      icon: 'lucide:book-open',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      value: stats.coursesAssigned != null ? String(stats.coursesAssigned) : '—',
      label: t('training.coursesAssigned' as TranslationKey),
      valueColor: 'text-slate-900',
    },
    {
      icon: 'lucide:alert-triangle',
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-600',
      value: stats.overdueCourses != null ? String(stats.overdueCourses) : '—',
      label: t('training.overdueCourses' as TranslationKey),
      valueColor: 'text-rose-600',
    },
    {
      icon: 'lucide:clock',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      value: stats.inProgressCourses != null ? String(stats.inProgressCourses) : '—',
      label: t('training.inProgressCourses' as TranslationKey),
      valueColor: 'text-slate-900',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {cards.map((card) => (
        <div key={card.label} className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className={`p-3 ${card.iconBg} rounded-xl`}>
              <Icon icon={card.icon} className={`text-2xl ${card.iconColor}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${card.valueColor}`}>{card.value}</p>
              <p className="text-xs text-slate-500 font-bold uppercase">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
