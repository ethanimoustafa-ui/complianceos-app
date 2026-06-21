import { useMemo, useEffect, useRef, useState } from 'react'
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
function mapAlert(a: DerivedAlert, modules: Prefs['modules'], events: Prefs['events'], t: TFn, isRTL: boolean): AppNotification | null {
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
    case 'policy': {
      if (!modules.policies) return null
      const base = `/correspondence/regulatory-updates/policies?policyId=${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('policy', a.entityId, 'overdue', t('notifications.policyOverdue' as TranslationKey), t('notifications.isOverdueForReview' as TranslationKey, { name: a.name }), 'error', base) : null
      if (a.reason === 'requires-review') return events.criticalAlerts
        ? makeNotif('policy', a.entityId, 'requires-review', t('notifications.policyReviewRequired' as TranslationKey), t('notifications.requiresReview' as TranslationKey, { name: a.name }), 'warning', `${base}&tab=workflow`) : null
      if (a.reason === 'expired') return events.overdueItems
        ? makeNotif('policy', a.entityId, 'expired', t('notifications.policyExpired' as TranslationKey), t('notifications.hasExpired' as TranslationKey, { name: a.name }), 'error', base) : null
      if (a.reason === 'due-30d') return events.dueDates
        ? makeNotif('policy', a.entityId, 'due-30d', t('notifications.policyReviewApproaching' as TranslationKey), t('notifications.reviewInDays' as TranslationKey, { name: a.name, days }), 'info', base) : null
      return null
    }
    case 'circular': {
      if (!modules.rules) return null
      const route = `/correspondence/regulatory-updates/rules?id=${a.entityId}`
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('circular', a.entityId, 'overdue', t('notifications.circularOverdue' as TranslationKey), t('notifications.isOverdueRef' as TranslationKey, { ref: a.ref ?? '', name: a.name }), 'error', route) : null
      if (a.reason === 'due-7d') return events.dueDates
        ? makeNotif('circular', a.entityId, 'due-7d', t('notifications.circularDueSoon' as TranslationKey), t('notifications.refDueInDays' as TranslationKey, { ref: a.ref ?? '', name: a.name, days }), 'warning', route) : null
      return null
    }
    case 'training': {
      if (!modules.training) return null
      const route = `/team/training?employeeId=${a.routeId ?? ''}`
      const emp = a.ref ?? ''
      if (a.reason === 'overdue') return events.overdueItems
        ? makeNotif('training', a.entityId, 'overdue', t('notifications.trainingOverdue' as TranslationKey), isRTL ? `${emp} — ${a.name} متأخر` : `${emp} — ${a.name} is overdue`, 'error', route) : null
      if (a.reason === 'due-7d') return events.dueDates
        ? makeNotif('training', a.entityId, 'due-7d', t('notifications.trainingDueSoon' as TranslationKey), isRTL ? `${emp} — ${a.name} مستحق خلال ${days} أيام` : `${emp} — ${a.name} due in ${days} days`, 'warning', route) : null
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
  // The bell renders entirely from the server-derived alert feed
  // (/api/dashboard/alerts), which now covers audits, observations, letters,
  // risks, policies, circulars, and training. No client entity stores are read,
  // so the bell is identical on every route and no page needs to hydrate those
  // full lists just to populate it.
  const prefs = useUserPreferencesStore(s => s.notificationPreferences)
  const syncGeneratedNotifications = useNotificationStore(s => s.syncGeneratedNotifications)
  const derivedAlerts = useDerivedAlerts()

  const prevKeysRef = useRef<string>('')

  const generated = useMemo(() => {
    const notifs: AppNotification[] = []
    const modules = prefs.modules
    const events = prefs.events

    for (const a of derivedAlerts) {
      const n = mapAlert(a, modules, events, t, isRTL)
      if (n) notifs.push(n)
    }

    // Sort: error > warning > info > success, then by createdAt desc
    notifs.sort((a, b) => {
      const pa = typePriority[a.type] ?? 9
      const pb = typePriority[b.type] ?? 9
      if (pa !== pb) return pa - pb
      return b.createdAt.localeCompare(a.createdAt)
    })

    return notifs.slice(0, MAX_NOTIFICATIONS)
  }, [derivedAlerts, prefs, prefs.modules, prefs.events, t, isRTL])

  // Sync to store only when the set of dedupeKeys changes
  useEffect(() => {
    const keysStr = generated.map(n => n.dedupeKey).join('|')
    if (keysStr !== prevKeysRef.current) {
      prevKeysRef.current = keysStr
      syncGeneratedNotifications(generated)
    }
  }, [generated, syncGeneratedNotifications])
}
