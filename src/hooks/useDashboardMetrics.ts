'use client'

import { useMemo } from 'react'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useAuthStore } from '@/stores/auth-store'
import { useComplianceScore } from '@/hooks/useComplianceScore'
import { useDashboardHealth } from '@/hooks/useDashboardHealth'
import { useDashboardSummary } from '@/hooks/useDashboardSummary'
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
    // Tracker stats-strip counts (rollup migration 106); optional so the
    // dashboard cards that don't use them stay unaffected.
    openCritical?: number
    inRemediation?: number
    drafting?: number
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
  /**
   * The 7-component weighted score measuring how well the compliance
   * DEPARTMENT executes its work (audit completion, observation closure,
   * letter timeliness, policy currency, circular implementation, risk posture,
   * training completion). This is `health.overall` labelled explicitly so
   * consumers can distinguish it from `health.businessComplianceScore`.
   */
  departmentHealthScore: number
  /**
   * True while any store feeding the "Compliance Health" hero (circulars,
   * policies, departments, evaluations) is still on its first fetch. The hero
   * ring renders a loading placeholder instead of a misleading "Pending —"
   * (0 evaluated) state until these resolve. Distinct from the genuine
   * pending state (`businessComplianceEvaluated === 0` *after* loading).
   */
  complianceHealthLoading: boolean
  /**
   * True while the count-based KPI summary (/api/dashboard/summary) is still on
   * its first fetch. The page gates its composed skeleton on this so the alert
   * cards / metric tiles / hero don't pop in with zeros and then fill — they
   * stay under the skeleton until the real counts land.
   */
  summaryLoading: boolean
}

const ZERO_SEV = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }

// Zeroed count groups used until the server summary resolves. Shapes mirror the
// `dashboard_rollup` blob (migration 104) exactly.
const EMPTY_COUNTS: Pick<
  DashboardMetrics,
  'audits' | 'observations' | 'risks' | 'policies' | 'samaLetters' | 'correspondence' | 'circulars' | 'training'
> = {
  audits: { total: 0, byStatus: {}, byType: {}, overdueCount: 0, upcoming30dCount: 0, completedThisMonth: 0 },
  observations: {
    total: 0,
    open: 0,
    openCritical: 0,
    inRemediation: 0,
    drafting: 0,
    bySource: { sama: { ...ZERO_SEV }, internal: { ...ZERO_SEV }, sharia: { ...ZERO_SEV } },
    closedThisQuarter: 0,
    overdueCount: 0,
  },
  risks: { total: 0, open: 0, byLevel: { critical: 0, high: 0, medium: 0, low: 0 }, resolved: 0 },
  policies: { total: 0, approved: 0, overdue: 0, requiresReview: 0, draft: 0, expired: 0 },
  samaLetters: { total: 0, byStatus: {}, overdueCount: 0, upcoming30d: 0, completedThisMonth: 0 },
  correspondence: { total: 0, active: 0, drafts: 0, sent: 0 },
  circulars: { total: 0, byAuthority: {}, implemented: 0 },
  training: { overallCompletion: 0, saudization: { actual: 0, target: 0, gap: 0 }, departmentProgress: [] },
}

export function useDashboardMetrics(): DashboardMetrics {
  const compliance = useComplianceScore('12months')
  const health = useDashboardHealth()

  // Count-based KPI groups now come from the precomputed server rollup
  // (/api/dashboard/summary -> dashboard_rollup), computed in SQL so totals are
  // correct at scale instead of being counted from page-1 of each paginated
  // list (audit finding B2). One request replaces ~7 entity-list fetches.
  const summary = useDashboardSummary()
  const counts = summary.data ?? EMPTY_COUNTS

  // Groups that need row-level data (not just counts) stay client-side.
  const teamMembers = useTeamStore(s => s.members)
  const frameworks = useFrameworkConfigStore(s => s.frameworks)
  const pinnedIds = useFrameworkConfigStore(s => s.pinnedIds)
  const currentUser = useAuthStore(s => s.user)

  // The Compliance Health hero's score (incl. business-compliance) is now fully
  // server-computed (useDashboardHealth -> /api/compliance/dashboard-health), so
  // its loading state is just the health request's own loading flag.
  const complianceHealthLoading = health.isLoading

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

  const frameworkMetrics = useMemo(() => {
    // Active frameworks on the dashboard = first 3 correspondence-based pins.
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
    departmentHealthScore: health.overall,
    audits: counts.audits,
    observations: counts.observations,
    risks: counts.risks,
    policies: counts.policies,
    samaLetters: counts.samaLetters,
    // `training` is the newest rollup section (migration 122) — fall back to the
    // empty shape if an older rollup blob predates it, so the views never read
    // `.saudization` off undefined.
    training: counts.training ?? EMPTY_COUNTS.training,
    team: teamMetrics,
    correspondence: counts.correspondence,
    circulars: counts.circulars,
    frameworks: frameworkMetrics,
    currentUser,
    complianceHealthLoading,
    summaryLoading: summary.isLoading,
  }
}
