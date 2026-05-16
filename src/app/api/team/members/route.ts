// /api/team/members — list profiles + roles.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags } from '@/lib/api/cache'
import { ListMembersQuerySchema } from '@/lib/api/schemas/team'
import { PROFILE_LIST_COLUMNS } from '@/lib/api/services/team'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListMembersQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('profiles')
      .select(PROFILE_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
    if (q.role) query = query.eq('role', q.role)
    if (q.status) query = query.eq('status', q.status)
    if (q.department_id) query = query.eq('department_id', q.department_id)
    if (q.q) query = query.or(`name.ilike.%${q.q}%,email.ilike.%${q.q}%`)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.team()] },
    })
  } catch (e) {
    return handle(e)
  }
}
