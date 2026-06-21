// /api/notifications/unread-count — cheap unread-badge count for the current
// user. The LookupHydrator polls this instead of refetching the full
// `pageSize=100` notifications list just to keep the sidebar badge fresh.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
    if (error) throw error
    return ok({ count: count ?? 0 }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
