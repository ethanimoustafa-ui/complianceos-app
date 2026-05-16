// /api/audit-logs — paginated, read-only global audit-log reader.
//
// Gated by `audit:view` (seeded permission). Always fresh — `Cache-Control: no-store`.
// Writes are not exposed; the underlying table is append-only at the DB role
// level (migration 012) and every mutation writes via `writeAudit()`.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { rangeFor } from '@/lib/api/pagination'
import { ListAuditLogsQuerySchema } from '@/lib/api/schemas/audit-logs'
import { AUDIT_LOG_COLUMNS } from '@/lib/api/services/audit-logs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requirePerm('audit:view')
    const q = ListAuditLogsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('audit_logs')
      .select(AUDIT_LOG_COLUMNS, { count: 'exact' })

    if (q.actor_id) query = query.eq('user_id', q.actor_id)
    if (q.action) query = query.eq('action', q.action)
    if (q.entity_type) query = query.eq('target_type', q.entity_type)
    if (q.entity_id) query = query.eq('target_id', q.entity_id)
    if (q.status) query = query.eq('status', q.status)
    if (q.date_from) query = query.gte('timestamp', q.date_from)
    if (q.date_to) query = query.lte('timestamp', q.date_to)
    if (q.q) query = query.ilike('user_name', `%${q.q}%`)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('timestamp', { ascending: false })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
