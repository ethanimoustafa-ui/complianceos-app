import { differenceInCalendarDays } from 'date-fns'
import type { Circular } from '@/types'

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

export function downloadFile(dataUrl: string, name: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

export function normalizeUrl(url: string): string {
  if (!url) return url
  if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`
  return url
}

export function getBONotifyLabel(
  circular: Circular,
  t: (key: any, params?: Record<string, string>) => string,
): string {
  const currentStep = circular.workflowSteps?.find((s) => s.status === 'current')
  const phase = currentStep?.phase ?? 0
  if (phase === 2) {
    if (!circular.dueDate) return t('regulatoryUpdates.notifyBoPhaseGeneral')
    const days = differenceInCalendarDays(new Date(circular.dueDate), new Date())
    if (days < 0) return t('regulatoryUpdates.notifyBoRemediationOverdue', { days: String(Math.abs(days)) })
    return t('regulatoryUpdates.notifyBoRemediationLabel', { days: String(days) })
  }
  if (!circular.capDeadline) return t('regulatoryUpdates.notifyBoPhaseGeneral')
  const days = differenceInCalendarDays(new Date(circular.capDeadline), new Date())
  if (days < 0) return t('regulatoryUpdates.notifyBoOverdue', { days: String(Math.abs(days)) })
  return t('regulatoryUpdates.notifyBoDeadlineLabel', { days: String(days) })
}
