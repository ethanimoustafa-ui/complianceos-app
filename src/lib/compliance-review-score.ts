// Pure-function score derivation for the dashboard's "Compliance Health"
// hero card. Mirrors the per-department checklist on
// /reports/compliance-review:
//   department score = compliant / (compliant + non-compliant)
//   overall          = arithmetic mean of department scores (skip
//                      departments with zero compliant+non-compliant denom)
//
// The eval store has been migrated from `${ruleId}::${deptId}` →
// `${kind}:${itemId}::${deptId}`. We tolerate both formats so this works
// regardless of which migration agent finishes first.

import type { Circular, Department, Policy } from '@/types'
import type {
  ComplianceEvaluation,
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
  total: number
}

export interface ComplianceReviewScoreResult {
  overall: number            // 0-100, integer; mean of contributing departments
  byDepartment: ComplianceReviewDepartmentBreakdown[]
  totalCompliant: number
  totalNonCompliant: number
}

interface CalculateInput {
  circulars: Pick<Circular, 'id' | 'businessOwnerDepartment'>[]
  policies: Pick<Policy, 'id' | 'businessOwnerDepartmentId'>[]
  departments: Department[]
  evaluations: Record<string, ComplianceEvaluation>
}

function lookupVerdict(
  evaluations: Record<string, ComplianceEvaluation>,
  kind: 'rule' | 'policy',
  itemId: string,
  departmentId: string,
): ComplianceVerdict {
  // Preferred (post-migration) shape.
  const newKey = `${kind}:${itemId}::${departmentId}`
  const newHit = evaluations[newKey]
  if (newHit) return newHit.verdict

  // Legacy shape, only ever held rules; fall back so we don't lose data
  // mid-migration.
  if (kind === 'rule') {
    const oldKey = `${itemId}::${departmentId}`
    const oldHit = evaluations[oldKey]
    if (oldHit) return oldHit.verdict
  }
  return 'unknown'
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
      const v = lookupVerdict(evaluations, 'rule', c.id, dept.id)
      if (v === 'compliant') compliantCount++
      else if (v === 'non-compliant') nonCompliantCount++
      else if (v === 'na') naCount++
      else pendingCount++
    }

    for (const p of deptPolicies) {
      const v = lookupVerdict(evaluations, 'policy', p.id, dept.id)
      if (v === 'compliant') compliantCount++
      else if (v === 'non-compliant') nonCompliantCount++
      else if (v === 'na') naCount++
      else pendingCount++
    }

    const denom = compliantCount + nonCompliantCount
    const score = denom === 0 ? 0 : Math.round((compliantCount / denom) * 100)

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      score,
      compliantCount,
      nonCompliantCount,
      naCount,
      pendingCount,
      total: deptCirculars.length + deptPolicies.length,
    }
  })

  // Overall = arithmetic mean of contributing departments only.
  // A department contributes if it has at least one compliant or non-compliant
  // evaluation. Pure-pending or pure-na departments are skipped so their 0%
  // doesn't drag the mean down spuriously.
  const contributing = byDepartment.filter(
    (d) => d.compliantCount + d.nonCompliantCount > 0,
  )
  const overall = contributing.length === 0
    ? 0
    : Math.round(
        contributing.reduce((sum, d) => sum + d.score, 0) / contributing.length,
      )

  const totalCompliant = byDepartment.reduce((s, d) => s + d.compliantCount, 0)
  const totalNonCompliant = byDepartment.reduce((s, d) => s + d.nonCompliantCount, 0)

  return {
    overall,
    byDepartment,
    totalCompliant,
    totalNonCompliant,
  }
}
