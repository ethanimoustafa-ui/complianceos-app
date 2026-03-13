export interface TrainingProgressBarProps {
  label: string
  value: number
  color?: 'emerald' | 'amber'
}

export function TrainingProgressBar({ label, value, color = 'emerald' }: TrainingProgressBarProps) {
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
