// /api/observations/[observationId]/versions — list (paginated newest-first).
// Wave-24 — mirrors the policy versions GET pattern (GAP-15 pagination +
// no-store). The observation_versions table was created in migration 064.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { assertUuid } from '@/lib/api/validate'
import {
  OBSERVATION_VERSION_COLUMNS,
  assertObservationExists,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { observationId } = await params
    assertUuid(observationId)
    const { supabase } = await requireUser()
    await assertObservationExists(supabase, observationId)
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)

    const [from, to] = rangeFor(page, pageSize)
    const { data, error, count } = await supabase
      .from('observation_versions')
      .select(OBSERVATION_VERSION_COLUMNS, { count: 'exact' })
      .eq('observation_id', observationId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}
