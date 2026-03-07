'use client'

import { useMemo } from 'react'
import { useObservationStore } from '@/stores/observation-store'
import { useAuditStore } from '@/stores/audit-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'

export interface WorkloadItem {
  type: 'observation' | 'audit' | 'policy' | 'correspondence'
  id: string
  title: string
}

export interface WorkloadResult {
  totalAssignments: number
  breakdown: {
    observations: number
    audits: number
    policies: number
    correspondence: number
  }
  items: WorkloadItem[]
  percentage: number
}

function computeWorkload(
  memberId: string,
  observations: ReturnType<typeof useObservationStore.getState>['observations'],
  audits: ReturnType<typeof useAuditStore.getState>['audits'],
  policies: ReturnType<typeof usePolicyStore.getState>['policies'],
  correspondence: ReturnType<typeof useCorrespondenceStore.getState>['correspondence'],
  member?: { burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] },
  memberName?: string,
): WorkloadResult {
  const matchedObs = observations.filter(o => {
    const assigneeMatch = o.assignee?.id === memberId || o.assignee?.name === memberId || o.assignee?.name === memberName
    const leaderMatch = o.leaderId === memberId
    return (assigneeMatch || leaderMatch) && o.status !== 'closed'
  })
  const obsCount = matchedObs.length

  const matchedAudits = audits.filter(a => {
    const match = a.assignee?.id === memberId || a.assignee?.name === memberId || a.assignee?.name === memberName
    return match && ['pending', 'in_progress'].includes(a.status)
  })
  const auditCount = matchedAudits.length

  const matchedPolicies = policies.filter(p => {
    const ownerMatch = p.owner?.name === memberId || p.owner?.name === memberName
    return ownerMatch && ['under-review', 'pending-approval'].includes(p.status)
  })
  const policyCount = matchedPolicies.length

  const matchedCorr = correspondence.filter(c => {
    return (c.assignee === memberId || c.assignee === memberName) && !c.archived
  })
  const corrCount = matchedCorr.length

  const items: WorkloadItem[] = [
    ...matchedObs.map(o => ({ type: 'observation' as const, id: o.id, title: o.title })),
    ...matchedAudits.map(a => ({ type: 'audit' as const, id: a.id, title: a.title })),
    ...matchedPolicies.map(p => ({ type: 'policy' as const, id: p.id, title: p.name })),
    ...matchedCorr.map(c => ({ type: 'correspondence' as const, id: c.id, title: c.subject })),
  ]

  const manualCount = member?.assignments?.length ?? 0
  const total = obsCount + auditCount + policyCount + corrCount + manualCount

  // Determine rate per assignment based on burnout duration
  let ratePerAssignment = 10
  if (member?.burnoutSince) {
    const daysSinceBurnout = Math.max(0, Math.floor((Date.now() - new Date(member.burnoutSince).getTime()) / (1000 * 60 * 60 * 24)))
    if (daysSinceBurnout > 7) {
      ratePerAssignment = 30
    } else if (daysSinceBurnout >= 3) {
      ratePerAssignment = 20
    }
  }

  const base = total * ratePerAssignment
  const discountCount = (member?.assignments ?? []).filter(a => (a.progress ?? 0) >= 75).length
  const discount = discountCount * 5
  const percentage = Math.max(0, Math.min(base - discount, 100))

  return {
    totalAssignments: total,
    breakdown: {
      observations: obsCount,
      audits: auditCount,
      policies: policyCount,
      correspondence: corrCount,
    },
    items,
    percentage,
  }
}

export function useWorkload(memberId: string, member?: { burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }, memberName?: string): WorkloadResult {
  const observations = useObservationStore(s => s.observations)
  const audits = useAuditStore(s => s.audits)
  const policies = usePolicyStore(s => s.policies)
  const correspondence = useCorrespondenceStore(s => s.correspondence)

  return useMemo(
    () => computeWorkload(memberId, observations, audits, policies, correspondence, member, memberName),
    [memberId, observations, audits, policies, correspondence, member, memberName],
  )
}

export function useTeamWorkloads(members: Array<{ id: string; name: string; burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }>): Record<string, WorkloadResult> {
  const observations = useObservationStore(s => s.observations)
  const audits = useAuditStore(s => s.audits)
  const policies = usePolicyStore(s => s.policies)
  const correspondence = useCorrespondenceStore(s => s.correspondence)

  return useMemo(() => {
    const result: Record<string, WorkloadResult> = {}
    for (const m of members) {
      result[m.id] = computeWorkload(m.id, observations, audits, policies, correspondence, m, m.name)
    }
    return result
  }, [members, observations, audits, policies, correspondence])
}

export interface BurnoutMember {
  member: { id: string; name: string; avatar?: string; department: string; burnoutSince?: string }
  capacity: number
  assignmentCount: number
  daysOverloaded: number
  escalationTier: 'mild' | 'moderate' | 'severe'
}

export function useBurnoutDetection(
  members: Array<{ id: string; name: string; avatar?: string; department: string; workload: number; burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }>
): BurnoutMember[] {
  const workloads = useTeamWorkloads(members)

  return useMemo(() => {
    const atRisk: BurnoutMember[] = []

    for (const m of members) {
      const wl = workloads[m.id]
      const capacity = Math.round(wl?.percentage ?? 0)

      if (capacity < 75) continue

      let daysOverloaded = 0
      if (m.burnoutSince) {
        const since = new Date(m.burnoutSince)
        daysOverloaded = Math.max(0, Math.floor((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24)))
      }

      let escalationTier: BurnoutMember['escalationTier'] = 'mild'
      if (daysOverloaded > 7) escalationTier = 'severe'
      else if (daysOverloaded > 3) escalationTier = 'moderate'

      atRisk.push({
        member: { id: m.id, name: m.name, avatar: m.avatar, department: m.department, burnoutSince: m.burnoutSince },
        capacity,
        assignmentCount: wl?.totalAssignments || m.assignments?.length || 0,
        daysOverloaded,
        escalationTier,
      })
    }

    return atRisk.sort((a, b) => b.capacity - a.capacity)
  }, [members, workloads])
}
