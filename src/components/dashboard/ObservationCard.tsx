import { Card } from '@/components/ui/card'

export interface ObservationCardProps {
  title: string
  count: number
  progress: number
  color: 'rose' | 'amber' | 'blue'
  detail: string
}

const colors = {
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
}

export function ObservationCard({ title, count, progress, color, detail }: ObservationCardProps) {
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
