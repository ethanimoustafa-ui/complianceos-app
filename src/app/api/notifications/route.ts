// /api/notifications — list current user's notifications + admin-create.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { ApiError, handle, Forbidden, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateNotificationSchema,
  ListNotificationsQuerySchema,
} from '@/lib/api/schemas/notifications'
import { NOTIFICATION_COLUMNS } from '@/lib/api/services/notifications'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    const q = ListNotificationsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('notifications')
      .select(NOTIFICATION_COLUMNS, { count: 'exact' })
      .eq('user_id', user.id)
    if (q.read !== undefined) query = query.eq('read', q.read)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser()
    const isAdmin = ctx.permissions.includes('create') || ctx.profile.role === 'admin' || ctx.profile.role === 'org_admin'
    if (!isAdmin && !hasServiceRole()) {
      throw Forbidden('Only admins or service-role callers may create notifications')
    }

    const input = await parseJson(req, CreateNotificationSchema)

    // Use admin client where available so server-generated notifications don't
    // depend on per-user RLS.
    const client = hasServiceRole() ? getAdminClient() : ctx.supabase
    const { data, error } = await client
      .from('notifications')
      .upsert(
        {
          user_id: input.user_id,
          title: input.title,
          message: input.message,
          type: input.type,
          source_type: input.source_type ?? null,
          route: input.route ?? null,
          entity_id: input.entity_id ?? null,
          dedupe_key: input.dedupe_key ?? null,
        },
        { onConflict: 'user_id,dedupe_key', ignoreDuplicates: false },
      )
      .select(NOTIFICATION_COLUMNS)
      .single()
    if (error) {
      // 23505 → unique violation (dedupe collision); treat as success-on-conflict.
      const code = (error as { code?: string }).code
      if (code === '23505') {
        // Fetch the existing row for the caller.
        const { data: existing } = await client
          .from('notifications')
          .select(NOTIFICATION_COLUMNS)
          .eq('user_id', input.user_id)
          .eq('dedupe_key', input.dedupe_key ?? '')
          .maybeSingle()
        return ok(existing ?? null, { status: 200 })
      }
      throw new ApiError('internal', 500, error.message)
    }
    if (!data) throw NotFound('Insert returned no row')

    await writeAudit({
      actor_id: ctx.user.id,
      actor_name: ctx.profile.name ?? ctx.profile.email ?? ctx.user.id,
      action: 'notification.create',
      entity_type: 'notification',
      entity_id: (data as { id: string }).id,
      metadata: { user_id: input.user_id, type: input.type, source_type: input.source_type },
      supabase: ctx.supabase,
    })

    revalidate(cacheTags.notifications())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
