// /api/team/logs — list `user_activity_logs` (admin-only via team:view).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags } from '@/lib/api/cache'
import { ListUserLogsQuerySchema } from '@/lib/api/schemas/team'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOG_COLUMNS = 'id, user_id, user_name, action, module, details, ip_address, metadata, created_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requirePerm('team:view')
    const q = ListUserLogsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('user_activity_logs')
      .select(LOG_COLUMNS, { count: 'exact' })
    if (q.user_id) query = query.eq('user_id', q.user_id)
    if (q.action) query = query.eq('action', q.action)
    if (q.module) query = query.eq('module', q.module)
    if (q.start_date) query = query.gte('created_at', q.start_date)
    if (q.end_date) query = query.lte('created_at', q.end_date)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 30, staleWhileRevalidate: 120, tags: [cacheTags.team()] },
    })
  } catch (e) {
    return handle(e)
  }
}
