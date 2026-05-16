// /api/notifications/mark-all-read — flip read=true for all current-user notifications.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate } from '@/lib/api/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { supabase, user } = await requireUser()

    const { error, count } = await supabase
      .from('notifications')
      .update({ read: true }, { count: 'exact' })
      .eq('user_id', user.id)
      .eq('read', false)
    if (error) throw error

    revalidate(cacheTags.notifications())
    return ok({ marked: count ?? 0 })
  } catch (e) {
    return handle(e)
  }
}
