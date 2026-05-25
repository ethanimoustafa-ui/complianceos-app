// GET /api/reports/compliance-evaluations/score-summary
//   ?framework_id=...&department_id=...
//
// Returns aggregated per-framework × per-department compliance scores
// computed from `compliance_evaluations`.
//
// W26-B: cache: 'no-store' — aggregate reads must be fresh (FORENSIC P1 / W3).
// The stale-read risk here is high: a just-saved verdict would be invisible
// until sMaxAge expires, producing a split between the list and the summary.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
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
    return ok(buckets, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
