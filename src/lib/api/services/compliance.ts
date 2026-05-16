// Compliance-score cache reader + recompute-job enqueuer.
//
// Phase 6 will own the actual score computation. This file's role in Phase 4:
//   • read the most recent (non-expired) row from `compliance_scores_cache`
//     for a given key, and
//   • enqueue a `compliance.recompute` job into `jobs` when the cache is cold
//     or stale.

import type { SupabaseClient } from '@supabase/supabase-js'

export const SCORE_CACHE_COLUMNS =
  'id, framework_id, period_filter, department_id, inputs_hash, overall, change_pct, confidence, components, deductions, trend, calculated_at, expires_at'

export interface ScoreCacheKey {
  period: '3months' | '6months' | '12months' | 'fiscal'
  framework_id: string
  department_id: string | null
}

export interface ScoreCacheRow {
  id: string
  framework_id: string
  period_filter: string
  department_id: string | null
  inputs_hash: string
  overall: number
  change_pct: number
  confidence: string
  components: unknown
  deductions: unknown
  trend: unknown
  calculated_at: string
  expires_at: string
}

/**
 * Look up the freshest non-expired score for `(framework, period, dept)`.
 * Returns `null` on miss / expired.
 */
export async function readScoreCache(
  supabase: SupabaseClient,
  key: ScoreCacheKey,
): Promise<ScoreCacheRow | null> {
  let query = supabase
    .from('compliance_scores_cache')
    .select(SCORE_CACHE_COLUMNS)
    .eq('framework_id', key.framework_id)
    .eq('period_filter', key.period)
    .gt('expires_at', new Date().toISOString())
    .order('calculated_at', { ascending: false })
    .limit(1)

  if (key.department_id === null) query = query.is('department_id', null)
  else query = query.eq('department_id', key.department_id)

  const { data, error } = await query.maybeSingle<ScoreCacheRow>()
  if (error) throw error
  return data ?? null
}

/**
 * Enqueue a `compliance.recompute` job to refresh the cache for this key.
 * Idempotent via `idempotency_key = compliance.recompute:<fw>:<period>:<dept>`
 * so a fresh queued/running job for the same key is not duplicated.
 *
 * Returns the job id (existing or newly inserted) — caller can hand it back
 * to the client as `{ jobId }` for polling. Returns `null` on insert error.
 */
export async function enqueueRecompute(
  supabase: SupabaseClient,
  key: ScoreCacheKey,
): Promise<string | null> {
  const idem = `compliance.recompute:${key.framework_id}:${key.period}:${key.department_id ?? '_'}`
  // Try insert; on idempotency conflict fall back to selecting the live row.
  const { data: inserted, error } = await supabase
    .from('jobs')
    .insert({
      kind: 'compliance.recompute',
      payload: {
        framework_id: key.framework_id,
        period: key.period,
        department_id: key.department_id,
      },
      idempotency_key: idem,
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (inserted?.id) return inserted.id
  // Unique-violation path: fetch the live row.
  if (error) {
    const { data: existing } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('kind', 'compliance.recompute')
      .eq('idempotency_key', idem)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>()
    return existing?.id ?? null
  }
  return null
}
