// Pure-function score derivation for the dashboard's "Compliance Health"
// hero card and the Compliance Review page. Both surfaces source from
// `calculateComplianceReviewScore` so they can never drift again.
//
// Per-department score = compliant / (compliant + non-compliant).
// Two overall variants exposed:
//   - `overallByRecords`     = sum(compliant) / sum(compliant+non-compliant)
//                              across every dept × item — i.e., a record-level
//                              mean. Canonical for the dashboard hero AND the
//                              Compliance Review "Overall Business Compliance"
//                              KPI per §1.B.
//   - `overallByDepartment`  = arithmetic mean of contributing per-dept
//                              scores (skipping fully-pending depts). Kept for
//                              callers who want a department-fairness metric.
//
// Verdicts are derived from explicit `evaluations[key]?.verdict` if present,
// otherwise auto-derived from a fully-completed workflow on the underlying
// rule/policy when its business owner department matches (§1.C). Manual entry
// always wins.
//
// The eval store key shape is `${kind}:${itemId}::${deptId}`. Legacy
// `${ruleId}::${deptId}` is also tolerated for in-flight migrations.

import type { Circular, CircularWorkflowStep, Department, Policy, PolicyWorkflowStep } from '@/types'
import type {
  ComplianceEvaluation,
  ComplianceItemKind,
  ComplianceVerdict,
} from '@/stores/compliance-evaluation-store'

export interface ComplianceReviewDepartmentBreakdown {
  departmentId: string
  departmentName: string
  score: number              // 0-100, integer
  compliantCount: number
  nonCompliantCount: number
  naCount: number
  pendingCount: number
  evaluatedItems: number     // compliant + non-compliant; lets callers render a "—" pending state
  total: number
}

export interface ComplianceReviewScoreResult {
  /**
   * Canonical aggregate: record-level mean across every department × item.
   * `compliant / (compliant + non-compliant)` rounded to integer percent.
   * Both the dashboard hero and the Compliance Review overall KPI render this.
   */
  overallByRecords: number
  /**
   * Department-level mean (skips depts with denom 0). Retained for callers
   * that want a per-dept-fairness metric.
   */
  overallByDepartment: number
  /**
   * Backward-compat alias for `overallByDepartment` (was the only field
   * before the §1.B refactor). New call sites should use the explicit names.
   * @deprecated prefer `overallByRecords` or `overallByDepartment`.
   */
  overall: number
  byDepartment: ComplianceReviewDepartmentBreakdown[]
  totalCompliant: number
  totalNonCompliant: number
  totalEvaluatedItems: number
  totalPending: number
}

interface CalculateInput {
  circulars: Circular[]
  policies: Policy[]
  departments: Department[]
  evaluations: Record<string, ComplianceEvaluation>
}

/**
 * Returns true when every workflow step on the given circular is in the
 * `completed` status. CircularWorkflowStep uses
 * `status: 'pending' | 'current' | 'completed'` (not a boolean).
 */
function isCircularWorkflowComplete(steps: CircularWorkflowStep[] | undefined): boolean {
  if (!steps || steps.length === 0) return false
  return steps.every((s) => s.status === 'completed')
}

/**
 * Returns true when every workflow timeline step on the given policy is
 * `completed`. PolicyWorkflowStep uses
 * `status: 'completed' | 'current' | 'pending'`.
 */
function isPolicyWorkflowComplete(steps: PolicyWorkflowStep[] | undefined): boolean {
  if (!steps || steps.length === 0) return false
  return steps.every((s) => s.status === 'completed')
}

function explicitVerdict(
  evaluations: Record<string, ComplianceEvaluation>,
  kind: ComplianceItemKind,
  itemId: string,
  departmentId: string,
): ComplianceVerdict | null {
  const newKey = `${kind}:${itemId}::${departmentId}`
  const newHit = evaluations[newKey]
  if (newHit) return newHit.verdict
  // Legacy shape only ever held rules.
  if (kind === 'rule') {
    const oldKey = `${itemId}::${departmentId}`
    const oldHit = evaluations[oldKey]
    if (oldHit) return oldHit.verdict
  }
  return null
}

export interface DerivedVerdictDetail {
  verdict: ComplianceVerdict
  source: 'explicit' | 'derived-workflow' | 'unevaluated'
}

/**
 * Resolve a verdict for a single (kind, itemId, deptId) tuple. Manual
 * `evaluations` entry wins; otherwise derives `'compliant'` when the
 * underlying item's full workflow has completed AND the item's business
 * owner matches the department. Falls back to `'unknown'`.
 */
export function resolveVerdict(args: {
  kind: ComplianceItemKind
  itemId: string
  departmentId: string
  departmentName: string
  evaluations: Record<string, ComplianceEvaluation>
  circulars: Circular[]
  policies: Policy[]
}): DerivedVerdictDetail {
  const { kind, itemId, departmentId, departmentName, evaluations, circulars, policies } = args
  const explicit = explicitVerdict(evaluations, kind, itemId, departmentId)
  if (explicit) return { verdict: explicit, source: 'explicit' }

  if (kind === 'rule') {
    const c = circulars.find((x) => x.id === itemId)
    if (
      c &&
      c.businessOwnerDepartment === departmentName &&
      isCircularWorkflowComplete(c.workflowSteps)
    ) {
      return { verdict: 'compliant', source: 'derived-workflow' }
    }
  } else {
    const p = policies.find((x) => x.id === itemId)
    if (
      p &&
      p.businessOwnerDepartmentId === departmentId &&
      isPolicyWorkflowComplete(p.workflowTimeline)
    ) {
      return { verdict: 'compliant', source: 'derived-workflow' }
    }
  }
  return { verdict: 'unknown', source: 'unevaluated' }
}

export function calculateComplianceReviewScore(
  input: CalculateInput,
): ComplianceReviewScoreResult {
  const { circulars, policies, departments, evaluations } = input

  const byDepartment: ComplianceReviewDepartmentBreakdown[] = departments.map((dept) => {
    const deptCirculars = circulars.filter(
      (c) => c.businessOwnerDepartment === dept.name,
    )
    const deptPolicies = policies.filter(
      (p) => p.businessOwnerDepartmentId === dept.id,
    )

    let compliantCount = 0
    let nonCompliantCount = 0
    let naCount = 0
    let pendingCount = 0

    for (const c of deptCirculars) {
      const { verdict } = resolveVerdict({
        kind: 'rule',
        itemId: c.id,
        departmentId: dept.id,
        departmentName: dept.name,
        evaluations,
        circulars,
        policies,
      })
      if (verdict === 'compliant') compliantCount++
      else if (verdict === 'non-compliant') nonCompliantCount++
      else if (verdict === 'na') naCount++
      else pendingCount++
    }

    for (const p of deptPolicies) {
      const { verdict } = resolveVerdict({
        kind: 'policy',
        itemId: p.id,
        departmentId: dept.id,
        departmentName: dept.name,
        evaluations,
        circulars,
        policies,
      })
      if (verdict === 'compliant') compliantCount++
      else if (verdict === 'non-compliant') nonCompliantCount++
      else if (verdict === 'na') naCount++
      else pendingCount++
    }

    const evaluatedItems = compliantCount + nonCompliantCount
    const score = evaluatedItems === 0 ? 0 : Math.round((compliantCount / evaluatedItems) * 100)

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      score,
      compliantCount,
      nonCompliantCount,
      naCount,
      pendingCount,
      evaluatedItems,
      total: deptCirculars.length + deptPolicies.length,
    }
  })

  const totalCompliant = byDepartment.reduce((s, d) => s + d.compliantCount, 0)
  const totalNonCompliant = byDepartment.reduce((s, d) => s + d.nonCompliantCount, 0)
  const totalEvaluatedItems = totalCompliant + totalNonCompliant
  const totalPending = byDepartment.reduce((s, d) => s + d.pendingCount, 0)

  // Canonical record-level mean.
  const overallByRecords = totalEvaluatedItems === 0
    ? 0
    : Math.round((totalCompliant / totalEvaluatedItems) * 100)

  // Department-level mean (legacy shape).
  const contributing = byDepartment.filter((d) => d.evaluatedItems > 0)
  const overallByDepartment = contributing.length === 0
    ? 0
    : Math.round(
        contributing.reduce((sum, d) => sum + d.score, 0) / contributing.length,
      )

  return {
    overallByRecords,
    overallByDepartment,
    overall: overallByDepartment,
    byDepartment,
    totalCompliant,
    totalNonCompliant,
    totalEvaluatedItems,
    totalPending,
  }
}
