import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Circular, Policy } from '@/types'

export type ComplianceVerdict = 'compliant' | 'non-compliant' | 'na' | 'unknown'
export type ComplianceItemKind = 'rule' | 'policy'
export type ComplianceVerdictSource = 'explicit' | 'derived-workflow' | 'unevaluated'

export interface DerivedVerdict {
  verdict: ComplianceVerdict
  source: ComplianceVerdictSource
}

interface DerivedVerdictItems {
  circulars: Circular[]
  policies: Policy[]
  /** Department display name; required for rule lookups since circulars store the department by name. */
  departmentName: string
}

export interface ComplianceEvaluation {
  id: string                // `${kind}:${itemId}::${departmentId}`
  kind: ComplianceItemKind
  itemId: string            // circular id or policy id
  /** @deprecated use itemId — kept for backward-compat with older persisted records */
  ruleId?: string
  departmentId: string
  verdict: ComplianceVerdict
  notes?: string
  evaluatedBy?: string
  evaluatedAt?: string
}

export interface ComplianceItemRef {
  kind: ComplianceItemKind
  id: string
}

interface ComplianceEvaluationState {
  evaluations: Record<string, ComplianceEvaluation>
  setVerdict: (
    kind: ComplianceItemKind,
    itemId: string,
    departmentId: string,
    verdict: ComplianceVerdict,
    evaluatedBy?: string,
    notes?: string,
  ) => void
  getVerdict: (kind: ComplianceItemKind, itemId: string, departmentId: string) => ComplianceVerdict
  /**
   * §1.C — derived-on-read verdict resolution. Returns the explicit manual
   * verdict if present; otherwise auto-derives `'compliant'` when the
   * underlying rule/policy's full workflow has completed AND the item's
   * business owner matches the department. Does NOT persist — manual
   * `setVerdict` always wins thereafter.
   */
  getDerivedVerdict: (
    kind: ComplianceItemKind,
    itemId: string,
    departmentId: string,
    items: DerivedVerdictItems,
  ) => DerivedVerdict
  getDepartmentScoreFromItems: (departmentId: string, items: ComplianceItemRef[]) => {
    score: number
    compliantCount: number
    nonCompliantCount: number
    naCount: number
    pendingCount: number
    total: number
  }
}

const evalKey = (kind: ComplianceItemKind, itemId: string, departmentId: string) =>
  `${kind}:${itemId}::${departmentId}`

export const useComplianceEvaluationStore = create<ComplianceEvaluationState>()(
  persist(
    (set, get) => ({
      evaluations: {},

      setVerdict: (kind, itemId, departmentId, verdict, evaluatedBy, notes) => {
        const key = evalKey(kind, itemId, departmentId)
        set((s) => ({
          evaluations: {
            ...s.evaluations,
            [key]: {
              id: key,
              kind,
              itemId,
              ruleId: kind === 'rule' ? itemId : undefined,
              departmentId,
              verdict,
              notes,
              evaluatedBy,
              evaluatedAt: new Date().toISOString(),
            },
          },
        }))
      },

      getVerdict: (kind, itemId, departmentId) =>
        get().evaluations[evalKey(kind, itemId, departmentId)]?.verdict ?? 'unknown',

      getDerivedVerdict: (kind, itemId, departmentId, items) => {
        const explicit = get().evaluations[evalKey(kind, itemId, departmentId)]?.verdict
        if (explicit) return { verdict: explicit, source: 'explicit' }

        if (kind === 'rule') {
          const c = items.circulars.find((x) => x.id === itemId)
          if (
            c &&
            c.businessOwnerDepartment === items.departmentName &&
            c.workflowSteps &&
            c.workflowSteps.length > 0 &&
            c.workflowSteps.every((s) => s.status === 'completed')
          ) {
            return { verdict: 'compliant', source: 'derived-workflow' }
          }
        } else {
          const p = items.policies.find((x) => x.id === itemId)
          if (
            p &&
            p.businessOwnerDepartmentId === departmentId &&
            p.workflowTimeline &&
            p.workflowTimeline.length > 0 &&
            p.workflowTimeline.every((s) => s.status === 'completed')
          ) {
            return { verdict: 'compliant', source: 'derived-workflow' }
          }
        }
        return { verdict: 'unknown', source: 'unevaluated' }
      },

      getDepartmentScoreFromItems: (departmentId, items) => {
        let compliantCount = 0
        let nonCompliantCount = 0
        let naCount = 0
        let pendingCount = 0
        for (const item of items) {
          const v = get().evaluations[evalKey(item.kind, item.id, departmentId)]?.verdict ?? 'unknown'
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
          total: items.length,
        }
      },
    }),
    {
      name: 'compliance-evaluation-storage',
      version: 2,
      migrate: (persistedState, version) => {
        // v1 → v2: rekey from `${ruleId}::${deptId}` to `rule:${ruleId}::${deptId}`
        // and add `kind: 'rule'` + `itemId` to each record. Pre-v1 (no version) = same shape.
        if (!persistedState || typeof persistedState !== 'object') return persistedState as unknown
        if (version >= 2) return persistedState as unknown
        const state = persistedState as { evaluations?: Record<string, ComplianceEvaluation & { ruleId?: string }> }
        const oldEvals = state.evaluations ?? {}
        const newEvals: Record<string, ComplianceEvaluation> = {}
        for (const [oldKey, raw] of Object.entries(oldEvals)) {
          // already-migrated key (defensive)
          if (oldKey.startsWith('rule:') || oldKey.startsWith('policy:')) {
            newEvals[oldKey] = raw as ComplianceEvaluation
            continue
          }
          // old key shape: `${ruleId}::${departmentId}`
          const sepIdx = oldKey.indexOf('::')
          if (sepIdx === -1) continue
          const ruleId = raw.ruleId ?? oldKey.slice(0, sepIdx)
          const departmentId = raw.departmentId ?? oldKey.slice(sepIdx + 2)
          const newKey = evalKey('rule', ruleId, departmentId)
          newEvals[newKey] = {
            ...raw,
            id: newKey,
            kind: 'rule',
            itemId: ruleId,
            ruleId,
            departmentId,
          }
        }
        return { ...state, evaluations: newEvals }
      },
    },
  ),
)
