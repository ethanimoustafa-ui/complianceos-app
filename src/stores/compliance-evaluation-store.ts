import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ComplianceVerdict = 'compliant' | 'non-compliant' | 'na' | 'unknown'

export interface ComplianceEvaluation {
  id: string                // `${ruleId}::${departmentId}`
  ruleId: string            // circular id
  departmentId: string
  verdict: ComplianceVerdict
  notes?: string
  evaluatedBy?: string
  evaluatedAt?: string
}

interface ComplianceEvaluationState {
  evaluations: Record<string, ComplianceEvaluation>
  setVerdict: (
    ruleId: string,
    departmentId: string,
    verdict: ComplianceVerdict,
    evaluatedBy?: string,
    notes?: string,
  ) => void
  getVerdict: (ruleId: string, departmentId: string) => ComplianceVerdict
  getDepartmentScore: (departmentId: string, applicableRuleIds: string[]) => {
    score: number
    compliantCount: number
    nonCompliantCount: number
    naCount: number
    pendingCount: number
    total: number
  }
}

const evalKey = (ruleId: string, departmentId: string) => `${ruleId}::${departmentId}`

export const useComplianceEvaluationStore = create<ComplianceEvaluationState>()(
  persist(
    (set, get) => ({
      evaluations: {},

      setVerdict: (ruleId, departmentId, verdict, evaluatedBy, notes) => {
        const key = evalKey(ruleId, departmentId)
        set((s) => ({
          evaluations: {
            ...s.evaluations,
            [key]: {
              id: key,
              ruleId,
              departmentId,
              verdict,
              notes,
              evaluatedBy,
              evaluatedAt: new Date().toISOString(),
            },
          },
        }))
      },

      getVerdict: (ruleId, departmentId) =>
        get().evaluations[evalKey(ruleId, departmentId)]?.verdict ?? 'unknown',

      getDepartmentScore: (departmentId, applicableRuleIds) => {
        let compliantCount = 0
        let nonCompliantCount = 0
        let naCount = 0
        let pendingCount = 0
        for (const ruleId of applicableRuleIds) {
          const v = get().evaluations[evalKey(ruleId, departmentId)]?.verdict ?? 'unknown'
          if (v === 'compliant') compliantCount++
          else if (v === 'non-compliant') nonCompliantCount++
          else if (v === 'na') naCount++
          else pendingCount++
        }
        const denom = compliantCount + nonCompliantCount
        const score = denom === 0 ? 0 : Math.round((compliantCount / denom) * 100)
        return {
          score,
          compliantCount,
          nonCompliantCount,
          naCount,
          pendingCount,
          total: applicableRuleIds.length,
        }
      },
    }),
    { name: 'compliance-evaluation-storage' },
  ),
)
