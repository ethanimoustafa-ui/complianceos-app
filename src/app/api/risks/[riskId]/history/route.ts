// GET /api/risks/[riskId]/history — read-only risk history (append-only table).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { cacheTags } from '@/lib/api/cache'
import { RISK_HISTORY_COLUMNS, assertRiskExists } from '@/lib/api/services/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ riskId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { riskId } = await params
    const { supabase } = await requireUser()
    await assertRiskExists(supabase, riskId)
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)

    const [from, to] = rangeFor(page, pageSize)
    const { data, error, count } = await supabase
      .from('risk_history')
      .select(RISK_HISTORY_COLUMNS, { count: 'exact' })
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: { sMaxAge: 30, tags: [cacheTags.risks(riskId)] },
    })
  } catch (e) {
    return handle(e)
  }
}
