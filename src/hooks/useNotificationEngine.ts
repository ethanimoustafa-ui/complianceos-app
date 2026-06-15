import { useMemo, useEffect, useRef, useState } from 'react'
import { usePolicyStore } from '@/stores/policy-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTrainingStore } from '@/stores/training-store'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { AppNotification, CalendarSourceType } from '@/types'
import { api } from '@/lib/api-client'
import type { DerivedAlert } from '@/app/api/dashboard/alerts/route'

const MAX_NOTIFICATIONS = 50
const DAYS_MS = 24 * 60 * 60 * 1000

function daysUntil(dateStr: string | undefined | null): number {
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

type Prefs = ReturnType<typeof useUserPreferencesStore.getState>['notificationPreferences']
type TFn = ReturnType<typeof useTranslation>['t']

// Map a server-derived alert (audits/observations/letters/risks) to an
// AppNotification, honoring the same module/event preference gates and i18n
// strings the in-store derivation used.
function mapAlert(a: DerivedAlert, modules: Prefs['modules'], events: Prefs['events'], t: TFn): AppNotification | null {
  const days = String(Math.ceil(daysUntil(a.dueDate)))
  switch (a.sourceType) {
    case 'audit': {
      if (!modules.audits) return null
      const route = `/reports/${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('audit', a.entityId, 'overdue', t('notifications.auditOverdue' as TranslationKey), t('notifications.isOverdue' as TranslationKey, { name: a.name }), 'error', route) : null
      if (a.reason === 'due-7d') return events.dueDates
        ? makeNotif('audit', a.entityId, 'due-7d', t('notifications.auditDueSoon' as TranslationKey), t('notifications.isDueInDays' as TranslationKey, { name: a.name, days }), 'warning', route) : null
      return null
    }
    case 'observation': {
      if (!modules.observations) return null
      const route = `/correspondence/observations?id=${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('observation', a.entityId, 'overdue', t('notifications.observationOverdue' as TranslationKey), t('notifications.isPastDue' as TranslationKey, { name: a.name }), 'error', route) : null
      if (a.reason === 'due-7d') return events.dueDates
        ? makeNotif('observation', a.entityId, 'due-7d', t('notifications.observationDueSoon' as TranslationKey), t('notifications.isDueInDays' as TranslationKey, { name: a.name, days }), 'warning', route) : null
      if (a.reason === 'remediation-overdue') return events.overdueItems
        ? makeNotif('observation', a.entityId, 'remediation-overdue', t('notifications.remediationOverdue' as TranslationKey), t('notifications.remediationPlanOverdue' as TranslationKey, { name: a.name }), 'error', route) : null
      return null
    }
    case 'sama-letter': {
      if (!modules.samaLetters) return null
      const route = `/correspondence/letters?id=${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('sama-letter', a.entityId, 'overdue', t('notifications.samaLetterOverdue' as TranslationKey), t('notifications.isOverdueRef' as TranslationKey, { ref: a.ref ?? '', name: a.name }), 'error', route) : null
      if (a.reason === 'due-7d') return events.dueDates
        ? makeNotif('sama-letter', a.entityId, 'due-7d', t('notifications.samaResponseDueSoon' as TranslationKey), t('notifications.responseInDays' as TranslationKey, { name: a.ref ?? a.name, days }), 'warning', route) : null
      return null
    }
    case 'risk': {
      // Risks have no module toggle (matches prior behavior — always included).
      const route = `/reports/risks?id=${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('risk', a.entityId, 'review-overdue', t('notifications.riskReviewOverdue' as TranslationKey), t('notifications.reviewIsOverdue' as TranslationKey, { name: a.name }), 'warning', route) : null
      if (a.reason === 'due-30d') return events.dueDates
        ? makeNotif('risk', a.entityId, 'due-30d', t('notifications.riskReviewApproaching' as TranslationKey), t('notifications.reviewInDays' as TranslationKey, { name: a.name, days }), 'info', route) : null
      return null
    }
    default:
      return null
  }
}

// Deduped fetch of the server-derived alerts (audits/observations/letters/risks).
const alertsInflight: { p: Promise<DerivedAlert[]> | null } = { p: null }

function useDerivedAlerts(): DerivedAlert[] {
  const [alerts, setAlerts] = useState<DerivedAlert[]>([])
  const cancelled = useRef(false)
  useEffect(() => {
    cancelled.current = false
    let p = alertsInflight.p
    if (!p) {
      p = api.get<{ alerts: DerivedAlert[] }>('/dashboard/alerts').then((r) => r.alerts ?? [])
      alertsInflight.p = p
      p.finally(() => { alertsInflight.p = null })
    }
    p.then(
      (a) => { if (!cancelled.current) setAlerts(a) },
      () => { if (!cancelled.current) setAlerts([]) },
    )
    return () => { cancelled.current = true }
  }, [])
  return alerts
}

export function useNotificationEngine() {
  const { t, isRTL } = useTranslation()
  // Store-derived sources (the dashboard keeps these hydrated): policies,
  // circulars, training. The other four (audits/observations/letters/risks)
  // come from /api/dashboard/alerts so the bell works without hydrating their
  // stores (Phase B — dashboard no longer fetches them).
  const policies = usePolicyStore(s => s.policies)
  const circulars = useCircularStore(s => s.circulars)
  const employees = useTrainingStore(s => s.employees)
  const prefs = useUserPreferencesStore(s => s.notificationPreferences)
  const syncGeneratedNotifications = useNotificationStore(s => s.syncGeneratedNotifications)
  const derivedAlerts = useDerivedAlerts()

  const prevKeysRef = useRef<string>('')

  const generated = useMemo(() => {
    const notifs: AppNotification[] = []
    const modules = prefs.modules
    const events = prefs.events

    // ── Server-derived: audits / observations / letters / risks ──
    for (const a of derivedAlerts) {
      const n = mapAlert(a, modules, events, t)
      if (n) notifs.push(n)
    }

    // ── Policies ── (store)
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

    // ── Circulars ── (store)
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

    // ── Training ── (store)
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

    // Sort: error > warning > info > success, then by createdAt desc
    notifs.sort((a, b) => {
      const pa = typePriority[a.type] ?? 9
      const pb = typePriority[b.type] ?? 9
      if (pa !== pb) return pa - pb
      return b.createdAt.localeCompare(a.createdAt)
    })

    return notifs.slice(0, MAX_NOTIFICATIONS)
  }, [policies, circulars, employees, derivedAlerts, prefs, prefs.modules, prefs.events, t, isRTL])

  // Sync to store only when the set of dedupeKeys changes
  useEffect(() => {
    const keysStr = generated.map(n => n.dedupeKey).join('|')
    if (keysStr !== prevKeysRef.current) {
      prevKeysRef.current = keysStr
      syncGeneratedNotifications(generated)
    }
  }, [generated, syncGeneratedNotifications])
}
