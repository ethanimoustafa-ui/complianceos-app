import { useMemo, useEffect, useRef } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useObservationStore } from '@/stores/observation-store'
import { useLetterStore } from '@/stores/letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTrainingStore } from '@/stores/training-store'
import { useRiskStore } from '@/stores/risk-store'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { AppNotification, CalendarSourceType } from '@/types'

const MAX_NOTIFICATIONS = 50
const DAYS_MS = 24 * 60 * 60 * 1000

function daysUntil(dateStr: string | undefined): number {
  if (!dateStr) return Infinity
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  return (target - now) / DAYS_MS
}

function makeNotif(
  sourceType: CalendarSourceType,
  entityId: string,
  reason: string,
  title: string,
  message: string,
  type: AppNotification['type'],
  route: string,
): AppNotification {
  const dedupeKey = `${sourceType}-${entityId}-${reason}`
  return {
    id: dedupeKey,
    title,
    message,
    type,
    sourceType,
    entityId,
    dedupeKey,
    route,
    read: false,
    createdAt: new Date().toISOString(),
  }
}

const typePriority: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 }

export function useNotificationEngine() {
  const { t, isRTL } = useTranslation()
  const audits = useAuditStore(s => s.audits)
  const policies = usePolicyStore(s => s.policies)
  const observations = useObservationStore(s => s.observations)
  const letters = useLetterStore(s => s.letters)
  const circulars = useCircularStore(s => s.circulars)
  const employees = useTrainingStore(s => s.employees)
  const risks = useRiskStore(s => s.risks)
  const prefs = useUserPreferencesStore(s => s.notificationPreferences)
  const syncGeneratedNotifications = useNotificationStore(s => s.syncGeneratedNotifications)

  const prevKeysRef = useRef<string>('')

  const generated = useMemo(() => {
    const notifs: AppNotification[] = []
    const modules = prefs.modules
    const events = prefs.events

    // ── Audits ──
    if (modules.audits) {
      for (const a of audits) {
        if (a.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('audit', a.id, 'overdue', t('notifications.auditOverdue' as TranslationKey), t('notifications.isOverdue' as TranslationKey, { name: a.title }), 'error', `/reports/${a.id}`))
        } else if (a.status !== 'completed' && events.dueDates) {
          const d = daysUntil(a.dueDate)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('audit', a.id, 'due-7d', t('notifications.auditDueSoon' as TranslationKey), t('notifications.isDueInDays' as TranslationKey, { name: a.title, days: String(Math.ceil(d)) }), 'warning', `/reports/${a.id}`))
          }
        }
      }
    }

    // ── Policies ──
    if (modules.policies) {
      for (const p of policies) {
        if (p.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('policy', p.id, 'overdue', t('notifications.policyOverdue' as TranslationKey), t('notifications.isOverdueForReview' as TranslationKey, { name: p.name }), 'error', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
        }
        if (p.status === 'requires-review' && events.criticalAlerts) {
          notifs.push(makeNotif('policy', p.id, 'requires-review', t('notifications.policyReviewRequired' as TranslationKey), t('notifications.requiresReview' as TranslationKey, { name: p.name }), 'warning', `/correspondence/regulatory-updates/policies?policyId=${p.id}&tab=workflow`))
        }
        if (p.status === 'expired' && events.overdueItems) {
          notifs.push(makeNotif('policy', p.id, 'expired', t('notifications.policyExpired' as TranslationKey), t('notifications.hasExpired' as TranslationKey, { name: p.name }), 'error', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
        }
        if (p.status === 'approved' && events.dueDates) {
          const d = daysUntil(p.nextReviewDate)
          if (d <= 30 && d > 0) {
            notifs.push(makeNotif('policy', p.id, 'due-30d', t('notifications.policyReviewApproaching' as TranslationKey), t('notifications.reviewInDays' as TranslationKey, { name: p.name, days: String(Math.ceil(d)) }), 'info', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
          }
        }
      }
    }

    // ── Observations ──
    if (modules.observations) {
      for (const o of observations) {
        const isOpen = o.status === 'open' || o.status === 'in_progress'
        if (isOpen) {
          const d = daysUntil(o.dueDate)
          if (d < 0 && events.overdueItems) {
            notifs.push(makeNotif('observation', o.id, 'overdue', t('notifications.observationOverdue' as TranslationKey), t('notifications.isPastDue' as TranslationKey, { name: o.title }), 'error', `/correspondence/observations?id=${o.id}`))
          } else if (d <= 7 && d > 0 && events.dueDates) {
            notifs.push(makeNotif('observation', o.id, 'due-7d', t('notifications.observationDueSoon' as TranslationKey), t('notifications.isDueInDays' as TranslationKey, { name: o.title, days: String(Math.ceil(d)) }), 'warning', `/correspondence/observations?id=${o.id}`))
          }
        }
        if (o.remediationSubmissionDueDate && !o.remediationPlan && events.overdueItems) {
          const rd = daysUntil(o.remediationSubmissionDueDate)
          if (rd < 0) {
            notifs.push(makeNotif('observation', o.id, 'remediation-overdue', t('notifications.remediationOverdue' as TranslationKey), t('notifications.remediationPlanOverdue' as TranslationKey, { name: o.title }), 'error', `/correspondence/observations?id=${o.id}`))
          }
        }
      }
    }

    // ── Letters ──
    if (modules.samaLetters) {
      for (const l of letters) {
        if (l.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('sama-letter', l.id, 'overdue', t('notifications.samaLetterOverdue' as TranslationKey), t('notifications.isOverdueRef' as TranslationKey, { ref: l.reference, name: l.subject }), 'error', `/correspondence/letters?id=${l.id}`))
        }
        if (l.status === 'sent' && l.responseDeadline && events.dueDates) {
          const d = daysUntil(l.responseDeadline)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('sama-letter', l.id, 'due-7d', t('notifications.samaResponseDueSoon' as TranslationKey), t('notifications.responseInDays' as TranslationKey, { name: l.reference, days: String(Math.ceil(d)) }), 'warning', `/correspondence/letters?id=${l.id}`))
          }
        }
      }
    }

    // ── Circulars ──
    if (modules.rules) {
      for (const c of circulars) {
        if (c.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('circular', c.id, 'overdue', t('notifications.circularOverdue' as TranslationKey), t('notifications.isOverdueRef' as TranslationKey, { ref: c.reference, name: c.title }), 'error', `/correspondence/regulatory-updates/rules?id=${c.id}`))
        } else if (c.status !== 'completed' && events.dueDates) {
          const d = daysUntil(c.dueDate)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('circular', c.id, 'due-7d', t('notifications.circularDueSoon' as TranslationKey), t('notifications.refDueInDays' as TranslationKey, { ref: c.reference, name: c.title, days: String(Math.ceil(d)) }), 'warning', `/correspondence/regulatory-updates/rules?id=${c.id}`))
          }
        }
      }
    }

    // ── Training ──
    if (modules.training) {
      for (const emp of employees) {
        for (const course of emp.courses) {
          if (course.status === 'completed') continue
          const d = daysUntil(course.dueDate)
          const key = `${emp.id}-${course.id}`
          if ((course.status === 'overdue' || d < 0) && events.overdueItems) {
            const msg = isRTL ? `${emp.name} — ${course.name} متأخر` : `${emp.name} — ${course.name} is overdue`
            notifs.push(makeNotif('training', key, 'overdue', t('notifications.trainingOverdue' as TranslationKey), msg, 'error', `/team/training?employeeId=${emp.id}`))
          } else if (d <= 7 && d > 0 && events.dueDates) {
            const days = Math.ceil(d)
            const msg = isRTL ? `${emp.name} — ${course.name} مستحق خلال ${days} أيام` : `${emp.name} — ${course.name} due in ${days} days`
            notifs.push(makeNotif('training', key, 'due-7d', t('notifications.trainingDueSoon' as TranslationKey), msg, 'warning', `/team/training?employeeId=${emp.id}`))
          }
        }
      }
    }

    // ── Risks ──
    // Risks don't have their own module toggle — always included
    {
      for (const r of risks) {
        if (r.status === 'resolved') continue
        const d = daysUntil(r.nextReviewDate)
        if (d < 0 && events.overdueItems) {
          notifs.push(makeNotif('risk', r.id, 'review-overdue', t('notifications.riskReviewOverdue' as TranslationKey), t('notifications.reviewIsOverdue' as TranslationKey, { name: r.title }), 'warning', `/reports/risks?id=${r.id}`))
        } else if (d <= 30 && d > 0 && events.dueDates) {
          notifs.push(makeNotif('risk', r.id, 'due-30d', t('notifications.riskReviewApproaching' as TranslationKey), t('notifications.reviewInDays' as TranslationKey, { name: r.title, days: String(Math.ceil(d)) }), 'info', `/reports/risks?id=${r.id}`))
        }
      }
    }

    // Sort: error > warning > info > success, then by createdAt desc
    notifs.sort((a, b) => {
      const pa = typePriority[a.type] ?? 9
      const pb = typePriority[b.type] ?? 9
      if (pa !== pb) return pa - pb
      return b.createdAt.localeCompare(a.createdAt)
    })

    return notifs.slice(0, MAX_NOTIFICATIONS)
  }, [audits, policies, observations, letters, circulars, employees, risks, prefs, prefs.modules, prefs.events, t])

  // Sync to store only when the set of dedupeKeys changes
  useEffect(() => {
    const keysStr = generated.map(n => n.dedupeKey).join('|')
    if (keysStr !== prevKeysRef.current) {
      prevKeysRef.current = keysStr
      syncGeneratedNotifications(generated)
    }
  }, [generated, syncGeneratedNotifications])
}
