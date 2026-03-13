export interface ProgressItemProps {
  label: string
  value: number
  total: number
  color: 'rose' | 'amber' | 'emerald'
}

const colorClasses = {
  rose: 'text-rose-600 bg-rose-500',
  amber: 'text-amber-600 bg-amber-500',
  emerald: 'text-emerald-600 bg-emerald-500',
}

export function ProgressItem({ label, value, total, color }: ProgressItemProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0

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
