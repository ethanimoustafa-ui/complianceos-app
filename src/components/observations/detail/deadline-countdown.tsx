'use client'

import { memo, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { RemediationPlanStatus } from '@/types'

export interface DeadlineCountdownProps {
  submissionDueDate?: string    // Remediation plan submission deadline
  completionDueDate: string     // Observation completion deadline (dueDate)
  planStatus?: RemediationPlanStatus
  isRTL: boolean
}

export const DeadlineCountdown = memo(function DeadlineCountdown({
  submissionDueDate,
  completionDueDate,
  planStatus,
  isRTL,
}: DeadlineCountdownProps) {
  const { t } = useTranslation()

  // Determine which date and label to show based on plan status
  const { activeDate, labelKey } = useMemo(() => {
    // If plan is approved, show completion deadline
    if (planStatus === 'approved') {
      return {
        activeDate: completionDueDate,
        labelKey: 'observations.detail.remediationDeadline',
      }
    }
    // If submission due date exists and plan is not yet approved, show submission deadline
    if (submissionDueDate) {
      return {
        activeDate: submissionDueDate,
        labelKey: 'observations.detail.planSubmissionDeadline',
      }
    }
    // Default: show completion deadline with generic label
    return {
      activeDate: completionDueDate,
      labelKey: 'observations.detail.deadlineCountdown',
    }
  }, [submissionDueDate, completionDueDate, planStatus])

  const { daysRemaining, progressPercent } = useMemo(() => {
    const now = new Date()
    const due = new Date(activeDate)
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    // Progress bar: assume 30 day cycle, calculate how much time has passed
    const maxDays = 30
    const elapsed = maxDays - Math.max(0, diffDays)
    const progress = Math.min(100, Math.max(0, (elapsed / maxDays) * 100))

    return {
      daysRemaining: Math.max(0, diffDays),
      progressPercent: progress,
    }
  }, [activeDate])

  const formattedDays = daysRemaining.toString().padStart(2, '0')

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 ${isRTL ? 'text-center' : ''}`}>
        {t(labelKey as 'observations.detail.deadlineCountdown')}
      </h4>
      <div className={`flex items-center gap-2 text-rose-600 font-bold mb-2 justify-center`}>
        <Icon icon="lucide:alarm-clock" />
        <span>{t('observations.detail.daysRemaining', { days: formattedDays })}</span>
      </div>
      <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full">
        <div
          className={`h-full bg-rose-500 rounded-full ${isRTL ? 'ml-auto' : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
})
