// Compliance evaluation store — Phase 5 server-state migration.
//
// Backed by `/api/reports/compliance-evaluations` (GET list, POST upsert),
// `/api/reports/compliance-evaluations/bulk` (POST batch), and
// `/api/reports/compliance-evaluations/score-summary` (GET aggregated scores).
//
// Each evaluation row keys on (kind, item_id, department_id). The row id is
// `${kind}:${itemId}::${departmentId}` (matches the legacy local key shape so
// dashboards' `evaluations[key]` lookups stay valid).

import { create } from 'zustand'
import type { Circular, Policy } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

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
  id: string
  kind: ComplianceItemKind
  itemId: string
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

const evalKey = (kind: ComplianceItemKind, itemId: string, departmentId: string) =>
  `${kind}:${itemId}::${departmentId}`

interface EvaluationApiRow {
  id: string
  kind: ComplianceItemKind
  item_id: string
  department_id: string
  verdict: ComplianceVerdict
  notes: string | null
  evaluated_by: string | null
  evaluated_at: string | null
  created_at: string
  updated_at: string
}

interface EvaluationListResponse {
  items: EvaluationApiRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function mapRow(row: EvaluationApiRow): ComplianceEvaluation {
  return {
    id: row.id,
    kind: row.kind,
    itemId: row.item_id,
    ruleId: row.kind === 'rule' ? row.item_id : undefined,
    departmentId: row.department_id,
    verdict: row.verdict,
    notes: row.notes ?? undefined,
    evaluatedBy: row.evaluated_by ?? undefined,
    evaluatedAt: row.evaluated_at ?? undefined,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface ComplianceEvaluationState {
  evaluations: Record<string, ComplianceEvaluation>

  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(opts?: { pageSize?: number }): Promise<void>
  setVerdict(
    kind: ComplianceItemKind,
    itemId: string,
    departmentId: string,
    verdict: ComplianceVerdict,
    evaluatedBy?: string,
    notes?: string,
  ): Promise<void>
  bulkUpsert(
    rows: Array<{
      kind: ComplianceItemKind
      itemId: string
      departmentId: string
      verdict: ComplianceVerdict
      notes?: string
    }>,
  ): Promise<void>
  getVerdict(kind: ComplianceItemKind, itemId: string, departmentId: string): ComplianceVerdict
  getDerivedVerdict(
    kind: ComplianceItemKind,
    itemId: string,
    departmentId: string,
    items: DerivedVerdictItems,
  ): DerivedVerdict
  getDepartmentScoreFromItems(
    departmentId: string,
    items: ComplianceItemRef[],
  ): {
    score: number
    compliantCount: number
    nonCompliantCount: number
    naCount: number
    pendingCount: number
    total: number
  }
  clearError(): void
}

export const useComplianceEvaluationStore = create<ComplianceEvaluationState>()((set, get) => ({
  evaluations: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async (opts) => {
    set({ isLoading: true, error: null })
    try {
      // The list endpoint is paginated; for the dashboard's per-department
      // scoring we need every row, so we burn through pages until exhausted.
      const pageSize = opts?.pageSize ?? 100
      const evaluations: Record<string, ComplianceEvaluation> = {}
      let page = 1
      let totalPages = 1
      do {
        const result = await api.get<EvaluationListResponse>(
          '/reports/compliance-evaluations',
          { page, pageSize },
        )
        for (const row of result.items) {
          evaluations[row.id] = mapRow(row)
        }
        totalPages = result.totalPages
        page += 1
      } while (page <= totalPages)
      set({ evaluations, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch evaluations'), isLoading: false })
    }
  },

  setVerdict: async (kind, itemId, departmentId, verdict, evaluatedBy, notes) => {
    const key = evalKey(kind, itemId, departmentId)
    // Optimistic — verdict cycle is the primary interaction on the
    // compliance-review page; users expect a snappy response.
    const previous = get().evaluations[key]
    const now = new Date().toISOString()
    const optimistic: ComplianceEvaluation = {
      id: key,
      kind,
      itemId,
      ruleId: kind === 'rule' ? itemId : undefined,
      departmentId,
      verdict,
      notes,
      evaluatedBy,
      evaluatedAt: now,
    }
    set((s) => ({
      evaluations: { ...s.evaluations, [key]: optimistic },
      isMutating: true,
      error: null,
    }))
    try {
      const row = await api.post<EvaluationApiRow>('/reports/compliance-evaluations', {
        kind,
        item_id: itemId,
        department_id: departmentId,
        verdict,
        notes,
      })
      set((s) => ({
        evaluations: { ...s.evaluations, [row.id]: mapRow(row) },
        isMutating: false,
      }))
    } catch (e) {
      // Rollback.
      set((s) => {
        const evaluations = { ...s.evaluations }
        if (previous) evaluations[key] = previous
        else delete evaluations[key]
        return {
          evaluations,
          error: errorMessage(e, 'Failed to set verdict'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  bulkUpsert: async (rows) => {
    if (rows.length === 0) return
    set({ isMutating: true, error: null })
    try {
      const result = await api.post<{ items: EvaluationApiRow[]; upserted: number }>(
        '/reports/compliance-evaluations/bulk',
        {
          evaluations: rows.map((r) => ({
            kind: r.kind,
            item_id: r.itemId,
            department_id: r.departmentId,
            verdict: r.verdict,
            notes: r.notes,
          })),
        },
      )
      set((s) => {
        const evaluations = { ...s.evaluations }
        for (const row of result.items) evaluations[row.id] = mapRow(row)
        return { evaluations, isMutating: false }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to bulk-upsert evaluations'), isMutating: false })
      throw e
    }
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

  clearError: () => set({ error: null }),
}))
