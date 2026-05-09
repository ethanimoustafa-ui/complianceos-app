'use client'

import { Icon } from '@iconify/react'

export function StatCard({
  label,
  value,
  subtext,
  subtextIcon,
  subtextColor,
  borderColor,
  isRTL = false,
}: {
  label: string
  value: string
  subtext: string
  subtextIcon?: string
  subtextColor?: 'emerald' | 'amber' | 'rose' | 'blue'
  borderColor: 'emerald' | 'amber' | 'rose' | 'blue'
  isRTL?: boolean
}) {
  const borderColorValues = {
    emerald: '#22c55e',  // emerald-500
    amber: '#f59e0b',    // amber-500
    rose: '#f43f5e',     // rose-500
    blue: '#3b82f6',     // blue-500
  }

  const textColors = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    blue: 'text-blue-600',
  }

  return (
    <div
      className={`glass-card p-6 rounded-2xl stat-card-hover`}
      style={{
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: borderColorValues[borderColor],
        [isRTL ? 'borderRightWidth' : 'borderLeftWidth']: '6px',
      }}
    >
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
      <h2 className="text-3xl font-black text-slate-900 font-display">{value}</h2>
      <p
        className={`text-xs mt-2 ${
          subtextIcon
            ? `font-bold flex items-center gap-1 ${subtextColor ? textColors[subtextColor] : 'text-slate-400'}`
            : subtextColor
              ? `font-bold ${textColors[subtextColor]}`
              : 'font-medium text-slate-400'
        }`}
      >
        {subtextIcon && <Icon icon={subtextIcon} />}
        {subtext}
      </p>
    </div>
  )
}
