import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'

interface AuditStatCardProps {
  icon: string
  iconColor: 'emerald' | 'rose' | 'blue' | 'slate' | 'amber'
  label: string
  value: string
  sublabel: string
  badge?: string
  badgeColor?: 'emerald' | 'rose' | 'amber' | 'blue'
}

const iconColorClasses = {
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-blue-50 text-blue-600',
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-50 text-amber-600',
}

const badgeColorClasses = {
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
}

export function AuditStatCard({
  icon,
  iconColor,
  label,
  value,
  sublabel,
  badge,
  badgeColor,
}: AuditStatCardProps) {
  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 ${iconColorClasses[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-xl" />
        </div>
        {badge && badgeColor && (
          <span className={`text-[10px] font-black ${badgeColorClasses[badgeColor]}`}>
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">
        {label}
      </h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black font-display text-slate-900">{value}</span>
        <span className="text-xs text-slate-400 font-medium">{sublabel}</span>
      </div>
    </Card>
  )
}
