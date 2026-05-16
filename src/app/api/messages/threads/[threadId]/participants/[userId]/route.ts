// /api/messages/threads/[threadId]/participants/[userId] — remove participant (admin only).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertThreadAdmin } from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string; userId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { threadId, userId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertThreadAdmin(supabase, threadId, user.id)

    const { error } = await supabase
      .from('message_thread_participants')
      .delete()
      .eq('thread_id', threadId)
      .eq('user_id', userId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.participants.remove',
      entity_type: 'message_thread',
      entity_id: threadId,
      metadata: { removed: userId },
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok({ thread_id: threadId, user_id: userId, removed: true })
  } catch (e) {
    return handle(e)
  }
}
