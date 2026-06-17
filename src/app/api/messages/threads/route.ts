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
import { randomUUID } from 'node:crypto'

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

    // Generate the thread id up front instead of using `.insert().select()`.
    // The `message_threads` SELECT policy (RLS) only lets a *participant* read a
    // thread, but at creation time no participant rows exist yet — so reading
    // the row back inline would return zero rows and 500. Insert with a known
    // id, add the participants, THEN read it back once membership exists.
    const threadId = randomUUID()
    const { error } = await supabase.from('message_threads').insert({
      id: threadId,
      subject: input.name ?? null,
      is_group: input.is_group,
      avatar_url: input.avatar_url ?? null,
      created_by: user.id,
    })
    if (error) throw error

    // Insert the creator's admin participant row on its own first: the
    // participant-insert policy only lets you add OTHER users once you are a
    // visible thread admin, so the creator's row must land before the rest.
    const { error: selfErr } = await supabase
      .from('message_thread_participants')
      .insert({ thread_id: threadId, user_id: user.id, is_admin: true, unread_count: 0 })
    if (selfErr) throw selfErr

    const others = Array.from(new Set(input.participant_ids)).filter((uid) => uid !== user.id)
    if (others.length > 0) {
      const { error: pErr } = await supabase
        .from('message_thread_participants')
        .insert(others.map((uid) => ({ thread_id: threadId, user_id: uid, is_admin: false, unread_count: 0 })))
      if (pErr) throw pErr
    }

    // Optional initial message.
    if (input.initial_message) {
      const { error: mErr } = await supabase.from('messages').insert({
        thread_id: threadId,
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
        .eq('id', threadId)
    }

    // Now that the creator is a participant, the SELECT policy permits reading
    // the freshly-created thread back (with the populated last_message fields).
    const { data: thread, error: selErr } = await supabase
      .from('message_threads')
      .select(THREAD_LIST_COLUMNS)
      .eq('id', threadId)
      .single()
    if (selErr || !thread) throw selErr ?? NotFound('Thread not found after insert')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'message_thread.create',
      entity_type: 'message_thread',
      entity_id: threadId,
      metadata: { is_group: input.is_group, participant_count: others.length + 1 },
      supabase,
    })

    revalidate(cacheTags.messages())
    return ok(thread, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
