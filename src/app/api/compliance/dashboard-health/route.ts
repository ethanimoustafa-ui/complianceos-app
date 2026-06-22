// GET /api/compliance/dashboard-health
//
// Returns the dashboard-health snapshot. Mirrors `/api/compliance/score`:
//   1. Read freshest non-expired row from `compliance_scores_cache` using
//      a synthetic `framework_id = 'dashboard-health'` discriminator.
//   2. On miss, gather inputs + run the dashboard-health engine.
//   3. Compute + cache (1h TTL). On timeout (>45s) enqueue async recompute.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { DashboardHealthQuerySchema } from '@/lib/api/schemas/reports'
import { enqueueRecompute, readScoreCache } from '@/lib/api/services/compliance'
import { gatherScoringInputs } from '@/lib/api/services/scoring/gather-inputs'
import { calculateDashboardHealth } from '@/lib/api/services/scoring/dashboard-health'
import { computeBusinessCompliance } from '@/lib/api/services/scoring/business-compliance'
import type { PeriodFilter } from '@/lib/api/services/scoring/compliance-engine.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMPUTE_TIMEOUT_MS = 45_000
const DASHBOARD_KEY = 'dashboard-health'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const parsed = DashboardHealthQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const q = { ...parsed, period: parsed.period as PeriodFilter }
    const frameworkId = q.framework_id ?? DASHBOARD_KEY

    // 1. Cache HIT.
    const row = await readScoreCache(supabase, {
      period: q.period,
      framework_id: frameworkId,
      department_id: q.department_id ?? null,
    })
    if (row) {
      // `row.components` for dashboard-health includes the 7-key shape and
      // the `frameworkScores` / business-compliance fields stored in
      // `components` as a wrapped payload. See compute path below.
      return ok(
        {
          overall: Number(row.overall),
          components: row.components,
          deductions: row.deductions,
          trend: row.trend,
          confidence: row.confidence,
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

    // 2. Cache MISS — compute.
    const computed = await raceCompute(async () => {
      const gathered = await gatherScoringInputs(supabase, {
        period: q.period,
        framework_id: frameworkId,
        department_id: q.department_id ?? null,
      })
      const result = calculateDashboardHealth(gathered.dashboardInput)

      // Phase A: compute the business-compliance overlay server-side (was
      // computed in the browser from 4 full-table downloads). Reuses the same
      // pure lib as the Compliance Review page so the two can't drift.
      const biz = await computeBusinessCompliance(supabase)

      // The dashboard-health engine returns a richer shape than the
      // compliance-score one. We pack the full shape into `components`
      // (jsonb) so consumers can read it back as a single blob without a
      // schema change. `overall` and `confidence` are still surfaced as
      // top-level columns for cheap "is everything ok" reads.
      const componentsPayload = {
        components: result.components,
        frameworkScores: result.frameworkScores,
        businessComplianceScore: biz.businessComplianceScore,
        businessComplianceEvaluated: biz.businessComplianceEvaluated,
      }

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await supabase.from('compliance_scores_cache').upsert(
        {
          framework_id: frameworkId,
          period_filter: q.period,
          department_id: q.department_id ?? null,
          inputs_hash: gathered.inputsHash,
          overall: result.overall,
          change_pct: 0,
          confidence: result.confidence,
          components: componentsPayload,
          deductions: result.deductions,
          trend: [],
          calculated_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: 'framework_id,period_filter,department_id,inputs_hash' },
      )

      return {
        overall: result.overall,
        components: componentsPayload,
        deductions: result.deductions,
        trend: [],
        confidence: result.confidence,
        calculated_at: new Date().toISOString(),
        expires_at: expiresAt,
      }
    })

    if (computed === 'timeout') {
      const jobId = await enqueueRecompute(supabase, {
        period: q.period,
        framework_id: frameworkId,
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
