// GET /api/policies/[policyId]/activity — read-only activity feed.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { cacheTags } from '@/lib/api/cache'
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
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: { sMaxAge: 30, tags: [cacheTags.policies(policyId)] },
    })
  } catch (e) {
    return handle(e)
  }
}
