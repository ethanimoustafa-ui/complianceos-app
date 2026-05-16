// /api/messages/threads/[threadId]/messages — list + send.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ListMessagesQuerySchema, SendMessageSchema } from '@/lib/api/schemas/messages'
import { MESSAGE_COLUMNS, assertParticipant } from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user } = await requireUser()
    await assertParticipant(supabase, threadId, user.id)

    const q = ListMessagesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('messages')
      .select(MESSAGE_COLUMNS, { count: 'exact' })
      .eq('thread_id', threadId)
    if (q.before) query = query.lt('created_at', q.before)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    // Return newest-last as per the assignment contract.
    const items = (data ?? []).slice().reverse()
    return ok(paginate(items, q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { threadId } = await params
    const { supabase, user, profile } = await requireUser()
    await assertParticipant(supabase, threadId, user.id)
    const input = await parseJson(req, SendMessageSchema)

    const { data, error } = await supabase
      .from('messages')
      .insert({ thread_id: threadId, sender_id: user.id, content: input.content })
      .select(MESSAGE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    // Update thread last_message + last_message_at; bump unread_count for everyone else.
    await supabase
      .from('message_threads')
      .update({
        last_message: input.content.slice(0, 200),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    // Bump unread_count for everyone except the sender.
    // RLS allows participants to read/update their own row; for cross-user
    // increments we rely on RLS allowing thread admins/participants to update —
    // see migration 016. If the increment is rejected we just log.
    const { data: others } = await supabase
      .from('message_thread_participants')
      .select('user_id, unread_count')
      .eq('thread_id', threadId)
      .neq('user_id', user.id)
    for (const o of (others ?? []) as Array<{ user_id: string; unread_count: number }>) {
      await supabase
        .from('message_thread_participants')
        .update({ unread_count: (o.unread_count ?? 0) + 1 })
        .eq('thread_id', threadId)
        .eq('user_id', o.user_id)
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message.send',
      entity_type: 'message',
      entity_id: (data as { id: string }).id,
      metadata: { thread_id: threadId },
      supabase,
    })

    revalidateAll([cacheTags.messages(), cacheTags.messages(threadId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
