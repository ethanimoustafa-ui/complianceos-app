// /api/messages/threads — list + create.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateMessageThreadSchema,
  ListMessageThreadsQuerySchema,
} from '@/lib/api/schemas/messages'
import { THREAD_LIST_COLUMNS } from '@/lib/api/services/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    const q = ListMessageThreadsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    // Find threads where the current user is a participant. Supabase REST
    // doesn't support JOIN filters cleanly, so we two-step.
    const { data: parts } = await supabase
      .from('message_thread_participants')
      .select('thread_id, unread_count, is_admin')
      .eq('user_id', user.id)
    const threadIds = (parts ?? []).map((p) => (p as { thread_id: string }).thread_id)
    if (threadIds.length === 0) {
      return ok(paginate([], q.page, q.pageSize, 0), {
        cache: 'no-store',
      })
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await supabase
      .from('message_threads')
      .select(THREAD_LIST_COLUMNS, { count: 'exact' })
      .in('id', threadIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (error) throw error

    // Stitch in unread_count per thread for the caller.
    const partsByThread: Record<string, { unread_count: number; is_admin: boolean }> = {}
    for (const p of parts ?? []) {
      const row = p as { thread_id: string; unread_count: number; is_admin: boolean }
      partsByThread[row.thread_id] = { unread_count: row.unread_count, is_admin: row.is_admin }
    }
    const items = (data ?? []).map((t) => {
      const row = t as { id: string }
      return {
        ...t,
        unread_count: partsByThread[row.id]?.unread_count ?? 0,
        is_admin: partsByThread[row.id]?.is_admin ?? false,
      }
    })

    return ok(paginate(items, q.page, q.pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser()
    const input = await parseJson(req, CreateMessageThreadSchema)

    const { data: thread, error } = await supabase
      .from('message_threads')
      .insert({
        subject: input.name ?? null,
        is_group: input.is_group,
        avatar_url: input.avatar_url ?? null,
        created_by: user.id,
      })
      .select(THREAD_LIST_COLUMNS)
      .single()
    if (error || !thread) throw error ?? NotFound('Insert returned no row')

    const threadRow = thread as { id: string }
    // Add creator as admin + all listed participants (dedupe).
    const participants = Array.from(new Set([user.id, ...input.participant_ids])).map((uid) => ({
      thread_id: threadRow.id,
      user_id: uid,
      is_admin: uid === user.id,
      unread_count: 0,
    }))
    const { error: pErr } = await supabase.from('message_thread_participants').insert(participants)
    if (pErr) throw pErr

    // Optional initial message.
    if (input.initial_message) {
      const { error: mErr } = await supabase.from('messages').insert({
        thread_id: threadRow.id,
        sender_id: user.id,
        content: input.initial_message,
      })
      if (mErr) throw mErr
      await supabase
        .from('message_threads')
        .update({
          last_message: input.initial_message.slice(0, 200),
          last_message_at: new Date().toISOString(),
        })
        .eq('id', threadRow.id)
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.create',
      entity_type: 'message_thread',
      entity_id: threadRow.id,
      metadata: { is_group: input.is_group, participant_count: participants.length },
      supabase,
    })

    revalidate(cacheTags.messages())
    return ok(thread, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
