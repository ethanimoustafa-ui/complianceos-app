// Compliance-evaluations service-layer helpers.
//
// Evaluation row id is constructed as `${kind}:${itemId}::${departmentId}` —
// matches the legacy Zustand store key shape, so the existing UI can keep
// using its current cache key without translation.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const EVALUATION_COLUMNS =
  'id, kind, item_id, department_id, verdict, notes, evaluated_by, evaluated_at, created_at, updated_at'

export function evaluationId(kind: string, itemId: string, deptId: string): string {
  return `${kind}:${itemId}::${deptId}`
}

export async function assertEvaluationExists(
  supabase: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('compliance_evaluations')
    .select('id')
    .eq('id', id)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Compliance evaluation ${id} not found`)
  return data.id
}

export interface ScoreBucket {
  framework_id: string | null
  department_id: string | null
  compliant: number
  non_compliant: number
  na: number
  unknown: number
  total: number
  /** `compliant / (compliant + non_compliant)` as a 0-100 percentage. */
  score: number
}

/**
 * Aggregate compliance evaluations into per-framework × per-department score
 * buckets. Caller filters via `framework_id` / `department_id`; both are
 * optional (null = aggregate across that dimension).
 *
 * Note: evaluations are keyed by (kind, item_id, department_id) — we look up
 * the framework via the linked policy/circular row's `framework` column.
 */
export async function getScoreSummary(
  supabase: SupabaseClient,
  filters: { framework_id?: string; department_id?: string },
): Promise<ScoreBucket[]> {
  let query = supabase
    .from('compliance_evaluations')
    .select('kind, item_id, department_id, verdict')
  if (filters.department_id) query = query.eq('department_id', filters.department_id)
  const { data: evals, error } = await query
  if (error) throw error

  if (!evals?.length) return []

  // Resolve framework per (kind, item_id) — batch lookups.
  const ruleIds = Array.from(new Set(evals.filter((e) => e.kind === 'rule').map((e) => e.item_id)))
  const policyIds = Array.from(
    new Set(evals.filter((e) => e.kind === 'policy').map((e) => e.item_id)),
  )

  const frameworkByItem = new Map<string, string | null>()
  if (ruleIds.length > 0) {
    const { data: rules } = await supabase
      .from('circulars')
      .select('id, framework')
      .in('id', ruleIds)
    for (const r of (rules ?? []) as Array<{ id: string; framework: string | null }>) {
      frameworkByItem.set(`rule:${r.id}`, r.framework)
    }
  }
  if (policyIds.length > 0) {
    const { data: policies } = await supabase
      .from('policies')
      .select('id, framework')
      .in('id', policyIds)
    for (const p of (policies ?? []) as Array<{ id: string; framework: string | null }>) {
      frameworkByItem.set(`policy:${p.id}`, p.framework)
    }
  }

  const buckets = new Map<string, ScoreBucket>()
  for (const e of evals as Array<{
    kind: string
    item_id: string
    department_id: string
    verdict: string
  }>) {
    const fw = frameworkByItem.get(`${e.kind}:${e.item_id}`) ?? null
    if (filters.framework_id && fw !== filters.framework_id) continue
    const key = `${fw ?? '_'}:${e.department_id ?? '_'}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        framework_id: fw,
        department_id: e.department_id ?? null,
        compliant: 0,
        non_compliant: 0,
        na: 0,
        unknown: 0,
        total: 0,
        score: 0,
      }
      buckets.set(key, b)
    }
    b.total += 1
    if (e.verdict === 'compliant') b.compliant += 1
    else if (e.verdict === 'non-compliant') b.non_compliant += 1
    else if (e.verdict === 'na') b.na += 1
    else b.unknown += 1
  }

  for (const b of buckets.values()) {
    const denom = b.compliant + b.non_compliant
    b.score = denom > 0 ? Math.round((b.compliant / denom) * 1000) / 10 : 0
  }
  return Array.from(buckets.values())
}
