// GET /api/circulars/[circularId]/implementations/[implementationId]/versions
//   — read-only per-article version feed.
//
// W15-5: supports `?offset=&limit=` for newest-first paginated "Load More",
// mirroring the circular versions route. Returns `{ items, hasMore }`.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import {
  ARTICLE_VERSION_COLUMNS,
  assertArticleExists,
  assertCircularExists,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ circularId: string; implementationId: string }>
}

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    assertUuid(circularId, implementationId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)

    const sp = new URL(req.url).searchParams
    const offset = Math.max(0, Number(sp.get('offset')) || 0)
    const rawLimit = Number(sp.get('limit')) || DEFAULT_LIMIT
    const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit))

    // Fetch one extra row to cheaply detect whether more rows remain.
    const { data, error } = await supabase
      .from('article_versions')
      .select(ARTICLE_VERSION_COLUMNS)
      .eq('article_id', implementationId)
      .order('version_no', { ascending: false })
      .range(offset, offset + limit)
    if (error) throw error

    const rows = data ?? []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    return ok({ items, hasMore }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
