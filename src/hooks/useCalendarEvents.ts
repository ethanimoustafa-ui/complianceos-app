import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api-client'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useLetterStore } from '@/stores/letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTrainingStore } from '@/stores/training-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { useRiskStore } from '@/stores/risk-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useCalendarEventTypeStore } from '@/stores/calendar-event-type-store'
import type { UnifiedCalendarItem, CalendarSourceType } from '@/types'
import { formatDateKey } from '@/components/calendar/calendar-utils'

function extractDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null
  const d = dateStr.substring(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

// Terminal statuses that mean "this deadline's work is complete" — drives the
// calendar cross-out + completed/due filter. Policies are intentionally never
// "done" (their review recurs); training skips completed rows entirely.
const DONE_STATUSES = new Set(['completed', 'closed', 'resolved', 'response-received', 'mitigated'])
const isDone = (status: string | undefined | null): boolean =>
  DONE_STATUSES.has((status ?? '').toLowerCase())

export function useCalendarEvents() {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const policies = usePolicyStore((s) => s.policies)
  const letters = useLetterStore((s) => s.letters)
  const circulars = useCircularStore((s) => s.circulars)
  const employees = useTrainingStore((s) => s.employees)
  const correspondence = useCorrespondenceStore((s) => s.correspondence)
  const advisoryRequests = useAdvisoryStore((s) => s.advisoryRequests)
  const risks = useRiskStore((s) => s.risks)
  const calendarEvents = useCalendarStore((s) => s.events)
  const fetchCalendarEvents = useCalendarStore((s) => s.fetchAll)
  const fetchCalendarEventTypes = useCalendarEventTypeStore((s) => s.fetchAll)
  const fetchAudits = useAuditStore((s) => s.fetchAll)
  const fetchObservations = useObservationStore((s) => s.fetchAll)
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  const fetchEmployees = useTrainingStore((s) => s.fetchEmployees)
  const fetchCorrespondence = useCorrespondenceStore((s) => s.fetchAll)
  const fetchAdvisory = useAdvisoryStore((s) => s.fetchAll)
  const fetchRisks = useRiskStore((s) => s.fetchAll)

  // Server-aggregated SUB-ITEM deadlines (checklist items, workflow steps,
  // audit tasks, remediation plans, circular CAP/remediation) — these live in
  // detail-only tables the stores above never load, so they're fetched from
  // /api/calendar/deadlines and merged into the unified item list below.
  const [derivedDeadlines, setDerivedDeadlines] = useState<UnifiedCalendarItem[]>([])

  // K(#39): first-load skeleton gate. The nine source stores + the server
  // deadlines aggregation hydrate in parallel; `loading` stays true until the
  // long-pole (the /calendar/deadlines fetch) settles, so the page can show a
  // skeleton instead of letting items pop in one store at a time over an empty
  // grid. Cached revisits flip it false almost immediately.
  const [loading, setLoading] = useState(true)

  // Hydrate the user-created `calendar_events` collection and its `event_types`
  // lookup on mount. Without this, freshly-signed-in users (or anyone after a
  // page reload) see an empty list because the store starts cold. Server
  // mutations already round-trip via `/api/calendar/*`; this just keeps the
  // local mirror in sync with the server source of truth.
  //
  // W43: ALSO hydrate the nine aggregated source stores — the calendar merged
  // whatever happened to be in memory, so on a cold load (or direct deep
  // navigation) every module's deadlines were missing until the user visited
  // that module's page. Each fetch is independent + TTL-guarded by its store;
  // one failure doesn't block the others (no Promise.all).
  useEffect(() => {
    void fetchCalendarEvents()
    void fetchCalendarEventTypes()
    void fetchAudits()
    void fetchObservations()
    void fetchPolicies()
    void fetchLetters()
    void fetchCirculars()
    void fetchEmployees()
    void fetchCorrespondence()
    void fetchAdvisory()
    void fetchRisks()
    void (async () => {
      try {
        const rows = await api.get<UnifiedCalendarItem[]>('/calendar/deadlines')
        setDerivedDeadlines(rows)
      } catch {
        // Non-fatal: the calendar still renders top-level deadlines + user events.
      } finally {
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = useMemo(() => {
    const result: UnifiedCalendarItem[] = []

    // Audits
    for (const a of audits) {
      const date = extractDate(a.dueDate)
      if (!date) continue
      result.push({
        id: `audit-${a.id}`,
        sourceType: 'audit',
        title: a.title,
        date,
        status: a.status,
        done: isDone(a.status),
        priority: a.status === 'overdue' ? 'critical' : undefined,
        route: `/reports/${a.id}`,
        colorKey: 'audit',
      })
    }

    // Observations
    for (const o of observations) {
      const date = extractDate(o.dueDate)
      if (!date) continue
      result.push({
        id: `obs-${o.id}`,
        sourceType: 'observation',
        title: o.title,
        date,
        status: o.status,
        done: isDone(o.status),
        priority: 'high',
        route: `/correspondence/observations?id=${o.id}`,
        colorKey: 'observation',
      })
    }

    // Observation remediation-plan submission deadline (distinct, earlier date
    // than the observation due date — the regulator's deadline to SUBMIT a plan).
    for (const o of observations) {
      const date = extractDate(o.remediationSubmissionDueDate)
      if (!date) continue
      result.push({
        id: `obs-remediation-${o.id}`,
        sourceType: 'observation',
        title: o.title,
        subtitle: 'Remediation plan due',
        date,
        status: o.status,
        done: isDone(o.status),
        priority: 'high',
        route: `/correspondence/observations?id=${o.id}`,
        colorKey: 'observation',
      })
    }

    // Policies — review cadence is a CYCLE task. Show the upcoming cycle
    // (nextReviewDate, active) and the most-recently-completed cycle
    // (lastReviewDate, crossed out). The officer sees this cycle done + next
    // cycle pending; the cadence itself is on the policy detail. We emit only
    // the latest completed cycle (not every past one) to keep it uncluttered.
    for (const p of policies) {
      const date = extractDate(p.nextReviewDate)
      if (!date) continue
      result.push({
        id: `policy-${p.id}`,
        sourceType: 'policy',
        title: p.name,
        subtitle: 'Policy review',
        date,
        status: p.status,
        done: false,
        route: `/correspondence/regulatory-updates/policies?policyId=${p.id}`,
        colorKey: 'policy',
      })
      const lastDate = extractDate(p.lastReviewDate)
      if (lastDate && lastDate !== date) {
        result.push({
          id: `policy-done-${p.id}`,
          sourceType: 'policy',
          title: p.name,
          subtitle: 'Policy review',
          date: lastDate,
          status: 'completed',
          done: true,
          route: `/correspondence/regulatory-updates/policies?policyId=${p.id}`,
          colorKey: 'policy',
        })
      }
    }

    // Letters
    for (const l of letters) {
      const date = extractDate(l.responseDeadline)
      if (!date) continue
      result.push({
        id: `sama-${l.id}`,
        sourceType: 'sama-letter',
        title: l.subject,
        subtitle: l.reference,
        date,
        status: l.status,
        done: l.status === 'response-received',
        priority: l.status === 'overdue' ? 'critical' : 'high',
        route: `/correspondence/letters?id=${l.id}`,
        colorKey: 'sama-letter',
      })
    }

    // Circulars
    for (const c of circulars) {
      const date = extractDate(c.dueDate)
      if (date) {
        result.push({
          id: `circ-${c.id}`,
          sourceType: 'circular',
          title: c.title,
          subtitle: c.reference,
          date,
          status: c.status,
          done: c.status === 'completed',
          route: `/correspondence/regulatory-updates/rules?id=${c.id}`,
          colorKey: 'circular',
        })
      }
      // CAP deadline as separate item
      const capDate = extractDate(c.capDueDate)
      if (capDate) {
        result.push({
          id: `circ-cap-${c.id}`,
          sourceType: 'circular',
          title: `${c.title} (CAP)`,
          subtitle: c.reference,
          date: capDate,
          status: c.capStatus || 'pending',
          done: (c.capStatus || '') === 'completed',
          route: `/correspondence/regulatory-updates/rules?id=${c.id}`,
          colorKey: 'circular',
        })
      }
    }

    // Training — employee-course pairs
    for (const emp of employees) {
      if (!emp.courses) continue
      for (const course of emp.courses) {
        if (course.status === 'completed') continue
        const date = extractDate(course.dueDate)
        if (!date) continue
        result.push({
          id: `train-${emp.id}-${course.id}`,
          sourceType: 'training',
          title: course.name,
          subtitle: emp.name,
          date,
          status: course.status,
          done: false,
          priority: course.status === 'overdue' ? 'critical' : 'medium',
          route: `/team/training?employeeId=${emp.id}`,
          colorKey: 'training',
        })
      }
    }

    // Correspondence
    for (const c of correspondence) {
      if (c.archived) continue
      const date = extractDate(c.date)
      if (!date) continue
      result.push({
        id: `corr-${c.id}`,
        sourceType: 'correspondence',
        title: c.subject,
        subtitle: c.reference,
        date,
        status: c.status,
        done: isDone(c.status),
        assignee: c.assignee,
        route: `/correspondence/feed?id=${c.id}`,
        colorKey: 'correspondence',
      })
    }

    // Advisory
    for (const a of advisoryRequests) {
      const date = extractDate(a.requestedDate)
      if (!date) continue
      result.push({
        id: `adv-${a.id}`,
        sourceType: 'advisory',
        title: a.subject,
        subtitle: a.ref,
        date,
        status: a.status,
        done: isDone(a.status),
        priority: a.priority === 'high' ? 'high' : a.priority === 'medium' ? 'medium' : 'low',
        assignee: a.assignedTo,
        route: `/correspondence/advisory?id=${a.id}`,
        colorKey: 'advisory',
      })
    }

    // Risks — review cadence date
    for (const r of risks) {
      const date = extractDate(r.nextReviewDate)
      if (!date) continue
      result.push({
        id: `risk-${r.id}`,
        sourceType: 'risk',
        title: r.title,
        subtitle: 'Mitigation review',
        date,
        status: r.status,
        done: r.status === 'resolved',
        route: `/reports/risks?id=${r.id}`,
        colorKey: 'risk',
      })
      // Most-recently-completed review cycle (crossed out) — same cadence model
      // as policies: this cycle done, next cycle (above) pending.
      const lastReview = extractDate(r.lastReviewDate)
      if (lastReview && lastReview !== date) {
        result.push({
          id: `risk-review-done-${r.id}`,
          sourceType: 'risk',
          title: r.title,
          subtitle: 'Mitigation review',
          date: lastReview,
          status: 'completed',
          done: true,
          route: `/reports/risks?id=${r.id}`,
          colorKey: 'risk',
        })
      }
    }

    // Risks — mitigation deadline (the hard date the mitigation work is due,
    // set when a risk is sent to a department; distinct from the review date).
    for (const r of risks) {
      const date = extractDate(r.mitigationDeadline)
      if (!date) continue
      result.push({
        id: `risk-mit-${r.id}`,
        sourceType: 'risk',
        title: r.title,
        subtitle: 'Mitigation deadline',
        date,
        status: r.status,
        done: r.status === 'resolved',
        priority: 'high',
        route: `/reports/risks?id=${r.id}`,
        colorKey: 'risk',
      })
    }

    // Server-aggregated sub-item deadlines (checklist items, workflow steps,
    // audit tasks, remediation plans, circular CAP/remediation). Each already
    // carries its parent as `subtitle` and a deep-link `route`.
    for (const d of derivedDeadlines) {
      const date = extractDate(d.date)
      if (!date) continue
      result.push({ ...d, date })
    }

    // User-created calendar events
    for (const e of calendarEvents) {
      const date = extractDate(e.date)
      if (!date) continue
      result.push({
        id: `cal-${e.id}`,
        sourceType: 'user-event',
        title: e.title,
        subtitle: e.description,
        date,
        status: e.completed ? 'completed' : e.type,
        done: Boolean(e.completed),
        route: '',
        colorKey: 'user-event',
      })
    }

    return result
  }, [audits, observations, policies, letters, circulars, employees, correspondence, advisoryRequests, risks, calendarEvents, derivedDeadlines])

  const itemsByDate = useMemo(() => {
    const map: Record<string, UnifiedCalendarItem[]> = {}
    for (const item of items) {
      if (!map[item.date]) map[item.date] = []
      map[item.date].push(item)
    }
    return map
  }, [items])

  const sourceTypes = useMemo(() => {
    const set = new Set<CalendarSourceType>()
    for (const item of items) set.add(item.sourceType)
    return set
  }, [items])

  const stats = useMemo(() => {
    const today = formatDateKey(new Date())
    const todayItems = itemsByDate[today] || []
    return {
      total: items.length,
      todayCount: todayItems.length,
    }
  }, [items, itemsByDate])

  return { items, itemsByDate, sourceTypes, stats, loading }
}
