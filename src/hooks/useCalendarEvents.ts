import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTrainingStore } from '@/stores/training-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { useRiskStore } from '@/stores/risk-store'
import { useCalendarStore } from '@/stores/calendar-store'
import type { UnifiedCalendarItem, CalendarSourceType } from '@/types'
import { formatDateKey } from '@/components/calendar/calendar-utils'

function extractDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null
  const d = dateStr.substring(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

export function useCalendarEvents() {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const policies = usePolicyStore((s) => s.policies)
  const letters = useSAMALetterStore((s) => s.letters)
  const circulars = useCircularStore((s) => s.circulars)
  const employees = useTrainingStore((s) => s.employees)
  const correspondence = useCorrespondenceStore((s) => s.correspondence)
  const advisoryRequests = useAdvisoryStore((s) => s.advisoryRequests)
  const risks = useRiskStore((s) => s.risks)
  const calendarEvents = useCalendarStore((s) => s.events)

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
        priority: 'high',
        route: `/correspondence/observations?id=${o.id}`,
        colorKey: 'observation',
      })
    }

    // Policies
    for (const p of policies) {
      const date = extractDate(p.nextReviewDate)
      if (!date) continue
      result.push({
        id: `policy-${p.id}`,
        sourceType: 'policy',
        title: p.name,
        date,
        status: p.status,
        route: `/correspondence/regulatory-updates/policies?policyId=${p.id}`,
        colorKey: 'policy',
      })
    }

    // SAMA Letters
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
        priority: l.status === 'overdue' ? 'critical' : 'high',
        route: `/correspondence/sama-letters?id=${l.id}`,
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
        priority: a.priority === 'high' ? 'high' : a.priority === 'medium' ? 'medium' : 'low',
        assignee: a.assignedTo,
        route: `/correspondence/advisory?id=${a.id}`,
        colorKey: 'advisory',
      })
    }

    // Risks
    for (const r of risks) {
      const date = extractDate(r.nextReviewDate)
      if (!date) continue
      result.push({
        id: `risk-${r.id}`,
        sourceType: 'risk',
        title: r.title,
        date,
        status: r.status,
        route: `/reports/risks?id=${r.id}`,
        colorKey: 'risk',
      })
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
        status: e.type,
        route: '',
        colorKey: 'user-event',
      })
    }

    return result
  }, [audits, observations, policies, letters, circulars, employees, correspondence, advisoryRequests, risks, calendarEvents])

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

  return { items, itemsByDate, sourceTypes, stats }
}
