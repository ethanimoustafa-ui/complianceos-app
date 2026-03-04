'use client'

import { Card } from '@/components/ui/card'

export function StatCard({
  label, value, subtext, borderColor, valueColor,
}: {
  label: string
  value: number
  subtext: string
  borderColor: 'slate' | 'amber' | 'emerald' | 'rose'
  valueColor?: 'amber' | 'emerald' | 'rose'
}) {
  const borderColors = {
    slate: 'border-l-slate-400',
    amber: 'border-l-amber-400',
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
  }
  const valueColors = { amber: 'text-amber-600', emerald: 'text-emerald-600', rose: 'text-rose-600' }
  return (
    <Card className={`p-6 border-l-4 ${borderColors[borderColor]} hover:-translate-y-1 transition-transform`}>
      <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${valueColor ? valueColors[valueColor] : 'text-slate-900'}`}>
          {value}
        </span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </Card>
  )
}
