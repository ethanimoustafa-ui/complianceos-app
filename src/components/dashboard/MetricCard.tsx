import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'

export interface MetricCardProps {
  icon: string
  iconColor: 'blue' | 'amber' | 'slate' | 'emerald'
  label: string
  title: string
  value: string
  valueExtra?: string
  details: { text: string; color: string }[]
}

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

export function MetricCard({ icon, iconColor, label, title, value, valueExtra, details }: MetricCardProps) {
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
