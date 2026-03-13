import { useMemo, useEffect, useRef } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useObservationStore } from '@/stores/observation-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTrainingStore } from '@/stores/training-store'
import { useRiskStore } from '@/stores/risk-store'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useNotificationStore } from '@/stores/notification-store'
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
  const audits = useAuditStore(s => s.audits)
  const policies = usePolicyStore(s => s.policies)
  const observations = useObservationStore(s => s.observations)
  const letters = useSAMALetterStore(s => s.letters)
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
          notifs.push(makeNotif('audit', a.id, 'overdue', 'Audit Overdue', `${a.title} is overdue`, 'error', `/reports/${a.id}`))
        } else if (a.status !== 'completed' && events.dueDates) {
          const d = daysUntil(a.dueDate)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('audit', a.id, 'due-7d', 'Audit Due Soon', `${a.title} is due in ${Math.ceil(d)} days`, 'warning', `/reports/${a.id}`))
          }
        }
      }
    }

    // ── Policies ──
    if (modules.policies) {
      for (const p of policies) {
        if (p.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('policy', p.id, 'overdue', 'Policy Overdue', `${p.name} is overdue for review`, 'error', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
        }
        if (p.status === 'requires-review' && events.criticalAlerts) {
          notifs.push(makeNotif('policy', p.id, 'requires-review', 'Review Required', `${p.name} requires review`, 'warning', `/correspondence/regulatory-updates/policies?policyId=${p.id}&tab=workflow`))
        }
        if (p.status === 'expired' && events.overdueItems) {
          notifs.push(makeNotif('policy', p.id, 'expired', 'Policy Expired', `${p.name} has expired`, 'error', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
        }
        if (p.status === 'approved' && events.dueDates) {
          const d = daysUntil(p.nextReviewDate)
          if (d <= 30 && d > 0) {
            notifs.push(makeNotif('policy', p.id, 'due-30d', 'Review Approaching', `${p.name} review in ${Math.ceil(d)} days`, 'info', `/correspondence/regulatory-updates/policies?policyId=${p.id}`))
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
            notifs.push(makeNotif('observation', o.id, 'overdue', 'Observation Overdue', `${o.title} is past due`, 'error', `/correspondence/observations?id=${o.id}`))
          } else if (d <= 7 && d > 0 && events.dueDates) {
            notifs.push(makeNotif('observation', o.id, 'due-7d', 'Observation Due Soon', `${o.title} is due in ${Math.ceil(d)} days`, 'warning', `/correspondence/observations?id=${o.id}`))
          }
        }
        if (o.remediationSubmissionDueDate && !o.remediationPlan && events.overdueItems) {
          const rd = daysUntil(o.remediationSubmissionDueDate)
          if (rd < 0) {
            notifs.push(makeNotif('observation', o.id, 'remediation-overdue', 'Remediation Plan Overdue', `${o.title} remediation plan is overdue`, 'error', `/correspondence/observations?id=${o.id}`))
          }
        }
      }
    }

    // ── SAMA Letters ──
    if (modules.samaLetters) {
      for (const l of letters) {
        if (l.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('sama-letter', l.id, 'overdue', 'SAMA Letter Overdue', `${l.reference} — ${l.subject} is overdue`, 'error', `/correspondence/sama-letters?id=${l.id}`))
        }
        if (l.status === 'sent' && l.responseDeadline && events.dueDates) {
          const d = daysUntil(l.responseDeadline)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('sama-letter', l.id, 'due-7d', 'SAMA Response Due Soon', `${l.reference} response due in ${Math.ceil(d)} days`, 'warning', `/correspondence/sama-letters?id=${l.id}`))
          }
        }
      }
    }

    // ── Circulars ──
    if (modules.rules) {
      for (const c of circulars) {
        if (c.status === 'overdue' && events.overdueItems) {
          notifs.push(makeNotif('circular', c.id, 'overdue', 'Circular Overdue', `${c.reference} — ${c.title} is overdue`, 'error', `/correspondence/regulatory-updates/rules?id=${c.id}`))
        } else if (c.status !== 'completed' && events.dueDates) {
          const d = daysUntil(c.dueDate)
          if (d <= 7 && d > 0) {
            notifs.push(makeNotif('circular', c.id, 'due-7d', 'Circular Due Soon', `${c.reference} — ${c.title} due in ${Math.ceil(d)} days`, 'warning', `/correspondence/regulatory-updates/rules?id=${c.id}`))
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
            notifs.push(makeNotif('training', key, 'overdue', 'Training Overdue', `${emp.name} — ${course.name} is overdue`, 'error', `/team/training?employeeId=${emp.id}`))
          } else if (d <= 7 && d > 0 && events.dueDates) {
            notifs.push(makeNotif('training', key, 'due-7d', 'Training Due Soon', `${emp.name} — ${course.name} due in ${Math.ceil(d)} days`, 'warning', `/team/training?employeeId=${emp.id}`))
          }
        }
      }
    }

    // ── Risks ──
    // Risks are not in a notification module toggle, but we check audits as closest match
    // Actually risks don't have their own module toggle — include if audits or observations enabled
    {
      for (const r of risks) {
        if (r.status === 'resolved') continue
        const d = daysUntil(r.nextReviewDate)
        if (d < 0 && events.overdueItems) {
          notifs.push(makeNotif('risk', r.id, 'review-overdue', 'Risk Review Overdue', `${r.title} review is overdue`, 'warning', `/reports/risks?id=${r.id}`))
        } else if (d <= 30 && d > 0 && events.dueDates) {
          notifs.push(makeNotif('risk', r.id, 'due-30d', 'Risk Review Approaching', `${r.title} review in ${Math.ceil(d)} days`, 'info', `/reports/risks?id=${r.id}`))
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
  }, [audits, policies, observations, letters, circulars, employees, risks, prefs, prefs.modules, prefs.events])

  // Sync to store only when the set of dedupeKeys changes
  useEffect(() => {
    const keysStr = generated.map(n => n.dedupeKey).join('|')
    if (keysStr !== prevKeysRef.current) {
      prevKeysRef.current = keysStr
      syncGeneratedNotifications(generated)
    }
  }, [generated, syncGeneratedNotifications])
}
