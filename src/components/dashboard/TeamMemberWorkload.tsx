import { dicebearAvatar } from '@/lib/avatar'

export interface TeamMemberWorkloadProps {
  name: string
  avatar: string
  workload: number
  overloaded?: boolean
  overloadedLabel?: string
}

export function TeamMemberWorkload({
  name,
  avatar,
  workload,
  overloaded = false,
  overloadedLabel = 'Overloaded',
}: TeamMemberWorkloadProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={dicebearAvatar(avatar)}
        className="w-8 h-8 rounded-lg"
        alt={name}
      />
      <div className="flex-1">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span>{name}</span>
          <span className={overloaded ? 'text-rose-600' : 'text-emerald-600'}>
            {workload}%{overloaded && ` (${overloadedLabel})`}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${overloaded ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(workload, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
