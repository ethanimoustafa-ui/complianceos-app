// /api/messages/threads/[threadId]/participants — add participants (admin only).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AddParticipantsSchema } from '@/lib/api/schemas/messages'
import { assertThreadAdmin } from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertThreadAdmin(supabase, threadId, user.id)
    const input = await parseJson(req, AddParticipantsSchema)

    const rows = input.user_ids.map((user_id) => ({
      thread_id: threadId,
      user_id,
      is_admin: false,
      unread_count: 0,
    }))
    const { error } = await supabase
      .from('message_thread_participants')
      .upsert(rows, { onConflict: 'thread_id,user_id' })
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.participants.add',
      entity_type: 'message_thread',
      entity_id: threadId,
      metadata: { added: input.user_ids },
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok({ added: input.user_ids }, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
