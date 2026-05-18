// GET /api/observations/[observationId]/timeline — read-only timeline feed.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { cacheTags } from '@/lib/api/cache'
import {
  OBSERVATION_TIMELINE_COLUMNS,
  assertObservationExists,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)

    const [from, to] = rangeFor(page, pageSize)
    const { data, error, count } = await supabase
      .from('observation_timeline')
      .select(OBSERVATION_TIMELINE_COLUMNS, { count: 'exact' })
      .eq('observation_id', observationId)
      .order('date', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.observations(observationId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}
