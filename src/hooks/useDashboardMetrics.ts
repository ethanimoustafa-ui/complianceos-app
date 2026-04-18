'use client'

import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useCircularStore } from '@/stores/circular-store'
import { useTeamStore } from '@/stores/team-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useAuthStore } from '@/stores/auth-store'
import { useComplianceScore } from '@/hooks/useComplianceScore'
import { useDashboardHealth } from '@/hooks/useDashboardHealth'
import type { FrameworkConfig } from '@/types'
import type { ComplianceScoreResult } from '@/lib/compliance-engine.types'
import type { DashboardHealthResult } from '@/lib/dashboard-health.types'

export interface DashboardMetrics {
  compliance: ComplianceScoreResult
  health: DashboardHealthResult
  audits: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    overdueCount: number
    upcoming30dCount: number
    completedThisMonth: number
  }
  observations: {
    total: number
    open: number
    bySource: {
      sama: { total: number; critical: number; high: number; medium: number; low: number }
      internal: { total: number; critical: number; high: number; medium: number; low: number }
      sharia: { total: number; critical: number; high: number; medium: number; low: number }
    }
    closedThisQuarter: number
    overdueCount: number
  }
  risks: {
    total: number
    open: number
    byLevel: { critical: number; high: number; medium: number; low: number }
    resolved: number
  }
  policies: {
    total: number
    approved: number
    overdue: number
    requiresReview: number
    draft: number
    expired: number
  }
  samaLetters: {
    total: number
    byStatus: Record<string, number>
    overdueCount: number
    upcoming30d: number
    completedThisMonth: number
  }
  training: {
    overallCompletion: number
    saudization: { actual: number; target: number; gap: number }
    departmentProgress: Array<{ name: string; employees: number; completed: number; inProgress: number; overdue: number; progress: number }>
  }
  team: {
    members: Array<{ id: string; name: string; avatar?: string; department: string; workload: number; burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }>
    activeCount: number
    averageWorkload: number
    overloaded: string[]
  }
  correspondence: {
    total: number
    active: number
    drafts: number
    sent: number
  }
  circulars: {
    total: number
    byAuthority: Record<string, number>
    implemented: number
  }
  frameworks: {
    pinned: FrameworkConfig[]
    enabled: FrameworkConfig[]
  }
  currentUser: { id: string; name: string; email: string; role: string; department: string } | null
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of arr) {
    const k = key(item)
    result[k] = (result[k] || 0) + 1
  }
  return result
}

function severityBreakdown(items: Array<{ severity: string }>) {
  const counts = { total: items.length, critical: 0, high: 0, medium: 0, low: 0 }
  for (const item of items) {
    if (item.severity in counts) counts[item.severity as keyof typeof counts]++
  }
  return counts
}

export function useDashboardMetrics(): DashboardMetrics {
  const compliance = useComplianceScore('12months')
  const health = useDashboardHealth()

  const audits = useAuditStore(s => s.audits)
  const observations = useObservationStore(s => s.observations)
  const risks = useRiskStore(s => s.risks)
  const policies = usePolicyStore(s => s.policies)
  const letters = useSAMALetterStore(s => s.letters)
  const correspondence = useCorrespondenceStore(s => s.correspondence)
  const circulars = useCircularStore(s => s.circulars)
  const teamMembers = useTeamStore(s => s.members)
  const saudizationMetrics = useTrainingStore(s => s.saudizationMetrics)
  const departmentProgress = useTrainingStore(s => s.departmentProgress)
  const overviewStats = useTrainingStore(s => s.overviewStats)
  const frameworks = useFrameworkConfigStore(s => s.frameworks)
  const pinnedIds = useFrameworkConfigStore(s => s.pinnedIds)
  const currentUser = useAuthStore(s => s.user)

  const now = Date.now()
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const currentQuarter = Math.floor(currentMonth / 3)

  const auditMetrics = useMemo(() => {
    const overdueCount = audits.filter(a => a.status === 'overdue').length
    const upcoming30dCount = audits.filter(a => {
      const due = new Date(a.dueDate).getTime()
      return a.status !== 'completed' && a.status !== 'overdue' && due > now && due <= now + thirtyDaysMs
    }).length
    const completedThisMonth = audits.filter(a => {
      if (a.status !== 'completed' || !a.completedAt) return false
      const d = new Date(a.completedAt)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    }).length

    return {
      total: audits.length,
      byStatus: countBy(audits, a => a.status),
      byType: countBy(audits, a => a.type),
      overdueCount,
      upcoming30dCount,
      completedThisMonth,
    }
  }, [audits, now, thirtyDaysMs, currentMonth, currentYear])

  const observationMetrics = useMemo(() => {
    const open = observations.filter(o => o.status === 'open' || o.status === 'in_progress').length
    const samaObs = observations.filter(o => o.source === 'sama')
    const internalObs = observations.filter(o => o.source === 'internal')
    const shariaObs = observations.filter(o => o.source === 'sharia')

    const closedThisQuarter = observations.filter(o => {
      if (o.status !== 'closed') return false
      const d = o.updatedAt ? new Date(o.updatedAt) : null
      if (!d) return false
      return d.getFullYear() === currentYear && Math.floor(d.getMonth() / 3) === currentQuarter
    }).length

    const overdueCount = observations.filter(o => {
      if (o.status === 'closed' || o.status === 'resolved') return false
      return new Date(o.dueDate).getTime() < now
    }).length

    return {
      total: observations.length,
      open,
      bySource: {
        sama: severityBreakdown(samaObs),
        internal: severityBreakdown(internalObs),
        sharia: severityBreakdown(shariaObs),
      },
      closedThisQuarter,
      overdueCount,
    }
  }, [observations, now, currentYear, currentQuarter])

  const riskMetrics = useMemo(() => {
    const open = risks.filter(r => r.status !== 'resolved').length
    const resolved = risks.filter(r => r.status === 'resolved').length
    const byLevel = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of risks) {
      if (r.status === 'resolved') continue
      const score = r.likelihood * r.impact
      if (score >= 20) byLevel.critical++
      else if (score >= 12) byLevel.high++
      else if (score >= 6) byLevel.medium++
      else byLevel.low++
    }
    return { total: risks.length, open, byLevel, resolved }
  }, [risks])

  const policyMetrics = useMemo(() => ({
    total: policies.length,
    approved: policies.filter(p => p.status === 'approved').length,
    overdue: policies.filter(p => p.status === 'overdue').length,
    requiresReview: policies.filter(p => p.status === 'requires-review').length,
    draft: policies.filter(p => p.status === 'draft').length,
    expired: policies.filter(p => p.status === 'expired').length,
  }), [policies])

  const samaLetterMetrics = useMemo(() => {
    const overdueCount = letters.filter(l => l.status === 'overdue').length
    const upcoming30d = letters.filter(l => {
      if (!l.responseDeadline) return false
      const due = new Date(l.responseDeadline).getTime()
      return l.status !== 'response-received' && l.status !== 'overdue' && due > now && due <= now + thirtyDaysMs
    }).length
    const completedThisMonth = letters.filter(l => {
      if (l.status !== 'response-received' && l.status !== 'sent') return false
      const d = l.sentDate ? new Date(l.sentDate) : new Date(l.updatedAt)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    }).length
    return {
      total: letters.length,
      byStatus: countBy(letters, l => l.status),
      overdueCount,
      upcoming30d,
      completedThisMonth,
    }
  }, [letters, now, thirtyDaysMs, currentMonth, currentYear])

  const trainingMetrics = useMemo(() => ({
    overallCompletion: overviewStats.overallCompletion ?? 0,
    saudization: {
      actual: saudizationMetrics.actual,
      target: saudizationMetrics.target,
      gap: Math.round((saudizationMetrics.actual - saudizationMetrics.target) * 10) / 10,
    },
    departmentProgress: [...departmentProgress],
  }), [overviewStats, saudizationMetrics, departmentProgress])

  const teamMetrics = useMemo(() => {
    const active = teamMembers.filter(m => m.status === 'active')
    const avgWorkload = active.length > 0
      ? Math.round(active.reduce((sum, m) => sum + m.workload, 0) / active.length)
      : 0
    const overloaded = active.filter(m => m.workload >= 90).map(m => m.id)
    return {
      members: active.map(m => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        department: m.department,
        workload: m.workload,
        burnoutSince: m.burnoutSince,
        assignments: m.assignments,
      })),
      activeCount: active.length,
      averageWorkload: avgWorkload,
      overloaded,
    }
  }, [teamMembers])

  const correspondenceMetrics = useMemo(() => ({
    total: correspondence.length,
    active: correspondence.filter(c => !c.archived).length,
    drafts: correspondence.filter(c => c.status === 'draft').length,
    sent: correspondence.filter(c => c.status === 'sent').length,
  }), [correspondence])

  const circularMetrics = useMemo(() => ({
    total: circulars.length,
    byAuthority: countBy(circulars, c => c.authority),
    implemented: circulars.filter(c => c.status === 'completed').length,
  }), [circulars])

  const frameworkMetrics = useMemo(() => {
    // Active frameworks on the dashboard = first 3 correspondence-based pins.
    // Self-assessment frameworks don't produce scores, so we filter them out
    // defensively even if a stale persisted pin still references one.
    const pinned = pinnedIds
      .map(id => frameworks.find(f => f.id === id))
      .filter((f): f is FrameworkConfig => !!f && f.correspondenceBased)
      .slice(0, 3)
    const enabled = frameworks.filter(f => f.enabled)
    return { pinned, enabled }
  }, [frameworks, pinnedIds])

  return {
    compliance,
    health,
    audits: auditMetrics,
    observations: observationMetrics,
    risks: riskMetrics,
    policies: policyMetrics,
    samaLetters: samaLetterMetrics,
    training: trainingMetrics,
    team: teamMetrics,
    correspondence: correspondenceMetrics,
    circulars: circularMetrics,
    frameworks: frameworkMetrics,
    currentUser,
  }
}
