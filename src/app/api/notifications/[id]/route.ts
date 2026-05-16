// /api/notifications/[id] — DELETE.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { assertNotificationOwner } from '@/lib/api/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user } = await requireUser()
    await assertNotificationOwner(supabase, id, user.id)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    revalidate(cacheTags.notifications())
    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
