// /api/messages/unread-count — cheap unread-badge total for the current user.
// Sums the per-participant `unread_count` across the user's threads. The
// LookupHydrator polls this instead of refetching the full `pageSize=100`
// thread list (and avoids the panel's per-thread N+1) just to keep the sidebar
// badge fresh.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    const { data, error } = await supabase
      .from('message_thread_participants')
      .select('unread_count')
      .eq('user_id', user.id)
    if (error) throw error
    const count = (data ?? []).reduce(
      (sum, r) => sum + ((r as { unread_count: number }).unread_count || 0),
      0,
    )
    return ok({ count }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
