// /api/correspondence — generic correspondence registry list + create.
//
// W22 PORTING-TEMPLATE §2 countermeasures applied:
//   - GET: cache:'no-store' (§2.2 — entity reads must never be stale post-write).
//   - POST: SEC-8 strict schema, server-generated reference (§2.10).

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateCorrespondenceSchema,
  ListCorrespondenceQuerySchema,
} from '@/lib/api/schemas/correspondence'
import {
  CORRESPONDENCE_LIST_COLUMNS,
  nextCorrespondenceReference,
} from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    // parseQuery → ValidationFailed (HTTP 400) on malformed query strings.
    // A raw `.parse(...)` would throw ZodError → 500 in the generic-error
    // branch of `handle()`.
    const q = parseQuery(req.nextUrl.searchParams, ListCorrespondenceQuerySchema)

    let query = supabase
      .from('correspondence')
      .select(CORRESPONDENCE_LIST_COLUMNS, { count: 'exact' })
      // F1: exclude soft-deleted rows (deleted_at set by the DELETE route).
      .is('deleted_at', null)

    if (q.type) query = query.eq('type', q.type)
    if (q.status) query = query.eq('status', q.status)
    if (q.thread_id) query = query.eq('thread_id', q.thread_id)
    if (q.assignee_id) query = query.eq('assignee_id', q.assignee_id)
    if (q.q) query = query.ilike('subject', `%${q.q}%`)

    if (q.direction === 'inbound') query = query.eq('status', 'received')
    if (q.direction === 'outbound') query = query.in('status', ['draft', 'sent'])

    if (q.archived === 'true') query = query.eq('archived', true)
    else if (q.archived === 'false') query = query.eq('archived', false)
    // 'all' — no filter

    if (q.has_attachments === 'true' || q.has_attachments === 'false') {
      const { data: rows } = await supabase
        .from('correspondence_attachments')
        .select('correspondence_id')
      const set = new Set(
        ((rows ?? []) as { correspondence_id: string }[]).map((r) => r.correspondence_id),
      )
      if (q.has_attachments === 'true') {
        if (set.size === 0) {
          // §2.2 — cache:'no-store' on every entity GET.
          return ok(paginate([], q.page, q.pageSize, 0), { cache: 'no-store' })
        }
        query = query.in('id', Array.from(set))
      } else if (set.size > 0) {
        query = query.not('id', 'in', `(${Array.from(set).join(',')})`)
      }
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('date', { ascending: false })
      .range(from, to)
    if (error) throw error

    // Decorate list rows with attachment_count + has_pdf for card rendering.
    const pageRows = (data ?? []) as Array<Record<string, unknown> & { id: string }>
    const attachmentCount = new Map<string, number>()
    if (pageRows.length > 0) {
      const pageIds = pageRows.map((r) => r.id)
      const { data: atts } = await supabase
        .from('correspondence_attachments')
        .select('correspondence_id')
        .in('correspondence_id', pageIds)
      for (const a of ((atts ?? []) as { correspondence_id: string }[])) {
        attachmentCount.set(
          a.correspondence_id,
          (attachmentCount.get(a.correspondence_id) ?? 0) + 1,
        )
      }
    }
    const decorated = pageRows.map((r) => ({
      ...r,
      attachment_count: attachmentCount.get(r.id) ?? 0,
      has_pdf: (attachmentCount.get(r.id) ?? 0) > 0,
    }))

    // §2.2 — cache:'no-store' on entity reads (rows vanish for up to 60s after
    // writes with sMaxAge; hard-refresh must always show the latest state).
    return ok(paginate(decorated, q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    // Granular `feed:create` (Access Matrix, migration 118) OR the legacy
    // generic `create` key role tiers carry. Mirrors the RLS predicate.
    const { supabase, user, profile } = await requireAnyPerm(['feed:create', 'create'])
    const input = await parseJson(req, CreateCorrespondenceSchema)

    let inserted: Record<string, unknown> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = await nextCorrespondenceReference(supabase)
      const { data, error } = await supabase
        .from('correspondence')
        .insert({
          reference,
          subject: input.subject,
          from_party: input.from_party,
          to_parties: input.to_parties,
          date: input.date,
          type: input.type,
          status: input.status,
          body: input.body ?? null,
          thread_id: input.thread_id ?? null,
          archived: input.archived,
          assignee_id: input.assignee_id ?? null,
          framework_ids: input.framework_ids,
        })
        .select(CORRESPONDENCE_LIST_COLUMNS)
        .single()
      if (!error && data) {
        inserted = data as Record<string, unknown>
        break
      }
      lastError = error
      if (error && (error as { code?: string }).code !== '23505') break
    }
    if (!inserted) throw lastError ?? NotFound('Insert returned no row')

    const created = inserted as { id: string; reference: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.create',
      entity_type: 'correspondence',
      entity_id: created.id,
      metadata: { reference: created.reference, type: input.type },
      supabase,
    })

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(created.id)])
    return ok(inserted, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
