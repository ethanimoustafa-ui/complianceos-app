'use client'

import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { CircularWorkflowStep } from '@/types'

export function WorkflowStepRow({
  step, onAdvance, isRTL,
}: {
  step: CircularWorkflowStep
  onAdvance: () => void
  isRTL: boolean
}) {
  const dotColors: Record<string, string> = {
    completed: 'bg-emerald-100 border-emerald-500',
    current: 'bg-blue-100 border-blue-500',
    pending: 'bg-slate-100 border-slate-300',
  }
  const actionLabel = isRTL ? step.actionLabelAr : step.actionLabel
  return (
    // Fix 1: RTL-aware padding and dot placement
    <div className={`relative ${isRTL ? 'pr-8' : 'pl-8'} py-2`}>
      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-3 w-4 h-4 rounded-full border-2 ${dotColors[step.status]}`} />
      <div className={`flex items-start justify-between gap-2`}>
        <div className={`flex-1 min-w-0`}>
          <p className={cn(
            'text-sm font-bold',
            step.status === 'completed' ? 'text-slate-500 line-through' :
            step.status === 'current' ? 'text-slate-900' : 'text-slate-300'
          )}>
            {isRTL ? step.labelAr : step.label}
          </p>
          {step.date && (
            <p className="text-[10px] text-slate-400 mt-0.5">{step.date}{step.user && ` • ${step.user}`}</p>
          )}
          {step.notes && (
            <p className="text-[10px] text-slate-500 italic mt-0.5">{step.notes}</p>
          )}
        </div>
        {step.status === 'current' && (
          <button
            onClick={onAdvance}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
        {step.status === 'completed' && (
          <Icon icon="lucide:check-circle" className="text-emerald-500 text-base shrink-0 mt-0.5" />
        )}
      </div>
    </div>
  )
}
