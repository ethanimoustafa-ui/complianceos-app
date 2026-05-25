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
    const { observationId: observationIdParam } = await params
    // W25.1-RESIDUAL-2: mirror the parent route's dual-accept pattern.
    // `assertObservationExists` already handles both UUID and reference strings
    // (by probing the right column based on UUID_RE). We only call `assertUuid`
    // when the param is NOT a reference — calling it unconditionally would reject
    // valid references like `HAN-2026-0001` with 400 validation_failed.
    const looksUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam)
    if (looksUuid) assertUuid(observationIdParam)
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)
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
