// GET /api/policies/[policyId]/activity — read-only activity feed,
// newest-first, paginated 10/page (GAP-15 / Load More tab).
//
// Wave-18: assertUuid + cache:'no-store'.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { assertUuid } from '@/lib/api/validate'
import {
  POLICY_ACTIVITY_COLUMNS,
  assertPolicyExists,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase } = await requireUser()
    await assertPolicyExists(supabase, policyId)
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)

    const [from, to] = rangeFor(page, pageSize)
    const { data, error, count } = await supabase
      .from('policy_activity_log')
      .select(POLICY_ACTIVITY_COLUMNS, { count: 'exact' })
      .eq('policy_id', policyId)
      .order('timestamp', { ascending: false })
      .range(from, to)

    // P11 (W30): PostgREST returns PGRST116 ("range not satisfiable") when the
    // requested range is entirely beyond the available rows. Also handle
    // message-based detection as the code varies across PostgREST versions.
    // Treat this as an empty page — still return 200 with zero items so the
    // client's Load More handler can see `hasMore: false` and stop paginating.
    if (error) {
      const code = (error as { code?: string }).code
      const message = (error as { message?: string }).message ?? ''
      const isOutOfRange =
        code === 'PGRST116' ||
        message.includes('range not satisfiable') ||
        message.includes('Requested range not satisfiable')
      if (isOutOfRange) {
        return ok(paginate([], page, pageSize, count ?? 0), { cache: 'no-store' })
      }
      throw error
    }

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}
