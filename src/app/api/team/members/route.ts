// /api/team/members — list profiles + roles.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { rangeFor } from '@/lib/api/pagination'
import { ListMembersQuerySchema } from '@/lib/api/schemas/team'
import { PROFILE_LIST_COLUMNS, getUserPermissionGrants } from '@/lib/api/services/team'

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

    // Hydrate per-user permission overrides so the Access Matrix toggle state
    // survives a reload (these are user_permissions grants, separate from the
    // role-derived effective permissions).
    const rows = data ?? []
    const grants = await getUserPermissionGrants(
      supabase,
      rows.map((r) => (r as { id: string }).id),
    )
    const enriched = rows.map((r) => ({
      ...(r as Record<string, unknown>),
      user_permission_keys: grants[(r as { id: string }).id] ?? [],
    }))

    // No browser/CDN caching: the roster is per-user (RLS-filtered) and is
    // mutated through this same admin UI (role changes, invites, removals). A
    // `public, s-maxage, stale-while-revalidate` header let the browser serve a
    // STALE roster on the reload right after a role change — the change looked
    // like it "didn't work" even though the DB persisted it. `force-dynamic`
    // already re-queries on every request, so there is nothing to gain here.
    return ok(paginate(enriched, q.page, q.pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}
