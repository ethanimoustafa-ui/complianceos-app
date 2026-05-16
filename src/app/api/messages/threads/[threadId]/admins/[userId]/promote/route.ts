// /api/messages/threads/[threadId]/admins/[userId]/promote — promote participant to admin.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertThreadAdmin } from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string; userId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { threadId, userId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertThreadAdmin(supabase, threadId, user.id)

    const { data, error } = await supabase
      .from('message_thread_participants')
      .update({ is_admin: true })
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .select('thread_id, user_id, is_admin')
      .single()
    if (error || !data) throw error ?? NotFound('Participant not found')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.admin.promote',
      entity_type: 'message_thread',
      entity_id: threadId,
      metadata: { user_id: userId },
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
