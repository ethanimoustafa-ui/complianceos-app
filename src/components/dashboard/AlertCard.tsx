import { Icon } from '@iconify/react'

export interface AlertCardProps {
  type: 'critical' | 'warning'
  title: string
  message: string
  actionLabel: string
  onAction?: () => void
}

const styles = {
  critical: {
    bg: 'bg-rose-50 border-rose-100',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    titleColor: 'text-rose-900',
    messageColor: 'text-rose-800',
    buttonColor: 'text-rose-600 hover:text-rose-700 border-rose-200',
    icon: 'lucide:alert-triangle',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-100',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
    messageColor: 'text-amber-800',
    buttonColor: 'text-amber-600 hover:text-amber-700 border-amber-200',
    icon: 'lucide:info',
  },
}

export function AlertCard({ type, title, message, actionLabel, onAction }: AlertCardProps) {
  const s = styles[type]

  return (
    <div className={`p-4 ${s.bg} border rounded-2xl flex items-center gap-4`}>
      <div className={`w-10 h-10 ${s.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon icon={s.icon} className={`${s.iconColor} text-xl`} />
      </div>
      <div className="flex-1">
        <p className={`text-xs font-black ${s.titleColor} uppercase tracking-wider mb-0.5`}>
          {title}
        </p>
        <p className={`text-sm ${s.messageColor} font-medium`}>{message}</p>
      </div>
      <button
        onClick={onAction}
        className={`text-[10px] font-bold ${s.buttonColor} uppercase tracking-widest px-3 py-1 bg-white border rounded-lg cursor-pointer transition-transform active:scale-[0.97]`}
      >
        {actionLabel}
      </button>
    </div>
  )
}
