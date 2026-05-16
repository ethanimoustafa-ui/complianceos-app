// GET /api/compliance/score
//   ?period=3months|6months|12months|fiscal & framework_id? & department_id?
//
// Reads the freshest non-expired row from `compliance_scores_cache`. On a
// cache miss this handler:
//   1. Gathers all engine inputs from Supabase (parallel queries).
//   2. Runs the compliance engine (`calculateComplianceScore`).
//   3. Inserts the result into `compliance_scores_cache` with a 1h TTL.
//   4. Returns the freshly computed score.
//
// If compute exceeds a 45s budget (Vercel free-tier safety margin) we enqueue
// a `compliance.recompute` background job and return 202 `{ status: 'computing' }`
// so the client can poll.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { ScoreReadQuerySchema } from '@/lib/api/schemas/reports'
import { enqueueRecompute, readScoreCache } from '@/lib/api/services/compliance'
import { gatherScoringInputs } from '@/lib/api/services/scoring/gather-inputs'
import { calculateComplianceScore } from '@/lib/api/services/scoring/compliance-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMPUTE_TIMEOUT_MS = 45_000

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ScoreReadQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    // 1. Cache HIT — serve immediately.
    const row = await readScoreCache(supabase, {
      period: q.period,
      framework_id: q.framework_id,
      department_id: q.department_id ?? null,
    })
    if (row) {
      return ok(
        {
          overall: Number(row.overall),
          change_pct: Number(row.change_pct),
          confidence: row.confidence,
          components: row.components,
          deductions: row.deductions,
          trend: row.trend,
          calculated_at: row.calculated_at,
          expires_at: row.expires_at,
        },
        {
          cache: {
            sMaxAge: 60,
            staleWhileRevalidate: 300,
            tags: [cacheTags.compliance()],
          },
        },
      )
    }

    // 2. Cache MISS — compute synchronously with a budget.
    const computed = await raceCompute(async () => {
      const gathered = await gatherScoringInputs(supabase, {
        period: q.period,
        framework_id: q.framework_id,
        department_id: q.department_id ?? null,
      })
      const result = calculateComplianceScore(gathered.engineInput)

      // Best-effort cache write. If the upsert fails (e.g. unique violation
      // from a concurrent compute) we still return the live result.
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await supabase.from('compliance_scores_cache').upsert(
        {
          framework_id: q.framework_id,
          period_filter: q.period,
          department_id: q.department_id ?? null,
          inputs_hash: gathered.inputsHash,
          overall: result.overall,
          change_pct: result.change,
          confidence: result.confidence,
          components: result.components,
          deductions: result.deductions,
          trend: result.trend,
          calculated_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: 'framework_id,period_filter,department_id,inputs_hash' },
      )

      return {
        overall: result.overall,
        change_pct: result.change,
        confidence: result.confidence,
        components: result.components,
        deductions: result.deductions,
        trend: result.trend,
        calculated_at: new Date().toISOString(),
        expires_at: expiresAt,
      }
    })

    if (computed === 'timeout') {
      // 3. Compute timed out — enqueue async job and ask client to poll.
      const jobId = await enqueueRecompute(supabase, {
        period: q.period,
        framework_id: q.framework_id,
        department_id: q.department_id ?? null,
      })
      return NextResponse.json(
        { data: { status: 'computing', jobId } },
        { status: 202, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      )
    }

    return ok(computed, {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.compliance()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

/** Race a worker against the compute-time budget; returns 'timeout' on miss. */
async function raceCompute<T>(work: () => Promise<T>): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), COMPUTE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([work(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
