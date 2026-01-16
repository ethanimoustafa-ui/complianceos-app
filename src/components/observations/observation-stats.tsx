'use client'

import { Icon } from '@iconify/react'

interface StatCardProps {
  icon: string
  iconBg: string
  iconColor: string
  borderColor: string
  label: string
  value: string
  subtext: string
  badge?: {
    text: string
    color: string
  }
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  borderColor,
  label,
  value,
  subtext,
  badge,
}: StatCardProps) {
  return (
    <div
      className={`bg-white/80 backdrop-blur-sm border border-slate-100 p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${borderColor}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 ${iconBg} rounded-lg`}>
          <Icon icon={icon} className={`text-2xl ${iconColor}`} />
        </div>
        {badge && (
          <span className={`text-[10px] font-bold ${badge.color} px-2 py-0.5 rounded-full`}>
            {badge.text}
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </div>
  )
}

export function ObservationStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        icon="lucide:layers"
        iconBg="bg-slate-50"
        iconColor="text-slate-600"
        borderColor="border-l-4 border-l-slate-400"
        label="Total Findings"
        value="42"
        subtext="Across all audits"
      />

      <StatCard
        icon="lucide:alert-octagon"
        iconBg="bg-rose-50"
        iconColor="text-rose-600"
        borderColor="border-l-4 border-l-rose-500"
        label="Open Critical"
        value="05"
        subtext="Overdue: 01"
        badge={{ text: 'Immediate Action', color: 'text-rose-600 bg-rose-50' }}
      />

      <StatCard
        icon="lucide:clock"
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        borderColor="border-l-4 border-l-amber-400"
        label="In Remediation"
        value="18"
        subtext="Drafting response: 04"
      />

      <StatCard
        icon="lucide:check-circle"
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        borderColor="border-l-4 border-l-emerald-500"
        label="Closed (Q3)"
        value="24"
        subtext="Target: 30"
        badge={{ text: 'Verified', color: 'text-emerald-600 bg-emerald-50' }}
      />
    </div>
  )
}
