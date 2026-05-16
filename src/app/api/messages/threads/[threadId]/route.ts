// /api/messages/threads/[threadId] — GET / PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateMessageThreadSchema } from '@/lib/api/schemas/messages'
import {
  PARTICIPANT_COLUMNS,
  THREAD_LIST_COLUMNS,
  assertParticipant,
  assertThreadAdmin,
  assertThreadExists,
} from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user } = await requireUser()
    await assertParticipant(supabase, threadId, user.id)

    const { data: thread, error } = await supabase
      .from('message_threads')
      .select(THREAD_LIST_COLUMNS)
      .eq('id', threadId)
      .maybeSingle()
    if (error) throw error
    if (!thread) throw NotFound(`Thread ${threadId} not found`)

    const { data: participants } = await supabase
      .from('message_thread_participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('thread_id', threadId)

    return ok(
      {
        ...thread,
        participants: participants ?? [],
      },
      { cache: 'no-store' },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertThreadAdmin(supabase, threadId, user.id)
    const patch = await parseJson(req, UpdateMessageThreadSchema)

    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) update.subject = patch.name
    if (patch.avatar_url !== undefined) update.avatar_url = patch.avatar_url

    const { data, error } = await supabase
      .from('message_threads')
      .update(update)
      .eq('id', threadId)
      .select(THREAD_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.update',
      entity_type: 'message_thread',
      entity_id: threadId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertThreadAdmin(supabase, threadId, user.id)
    await assertThreadExists(supabase, threadId)

    const { error } = await supabase.from('message_threads').delete().eq('id', threadId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.delete',
      entity_type: 'message_thread',
      entity_id: threadId,
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok({ id: threadId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
