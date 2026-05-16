// /api/notifications/[id]/mark-read — flip read=true for one notification.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate } from '@/lib/api/cache'
import {
  NOTIFICATION_COLUMNS,
  assertNotificationOwner,
} from '@/lib/api/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user } = await requireUser()
    await assertNotificationOwner(supabase, id, user.id)

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', user.id)
      .select(NOTIFICATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    revalidate(cacheTags.notifications())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
