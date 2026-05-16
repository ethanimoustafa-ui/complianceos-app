// GET /api/reports/compliance-evaluations/score-summary
//   ?framework_id=...&department_id=...
//
// Returns aggregated per-framework × per-department compliance scores
// computed from `compliance_evaluations`.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { ScoreSummaryQuerySchema } from '@/lib/api/schemas/reports'
import { getScoreSummary } from '@/lib/api/services/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ScoreSummaryQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const buckets = await getScoreSummary(supabase, q)
    return ok(buckets, {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.evaluationScores(), cacheTags.compliance()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}
