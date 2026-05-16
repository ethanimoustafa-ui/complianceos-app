// /api/advisory — list + create advisory requests.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateAdvisorySchema,
  ListAdvisoryQuerySchema,
} from '@/lib/api/schemas/advisory'
import {
  ADVISORY_LIST_COLUMNS,
  nextAdvisoryReference,
} from '@/lib/api/services/advisory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListAdvisoryQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('advisory_requests')
      .select(ADVISORY_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
    if (q.status) query = query.eq('status', q.status)
    if (q.priority) query = query.eq('priority', q.priority)
    const bu = q.business_unit ?? q.business_unit_id
    if (bu) query = query.eq('business_unit', bu)
    if (q.assigned_to) query = query.eq('assigned_to', q.assigned_to)
    if (q.q) query = query.ilike('subject', `%${q.q}%`)
    // department_id is accepted but not stored on advisory_requests — no-op.

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('requested_date', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.advisory()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('create')
    const input = await parseJson(req, CreateAdvisorySchema)

    let inserted: Record<string, unknown> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await nextAdvisoryReference(supabase)
      const { data, error } = await supabase
        .from('advisory_requests')
        .insert({
          ref,
          subject: input.subject,
          description: input.description,
          business_unit: input.business_unit,
          status: input.status,
          priority: input.priority,
          requested_by: input.requested_by,
          requested_date: input.requested_date,
          assigned_to: input.assigned_to ?? null,
        })
        .select(ADVISORY_LIST_COLUMNS)
        .single()
      if (!error && data) {
        inserted = data as Record<string, unknown>
        break
      }
      lastError = error
      if (error && (error as { code?: string }).code !== '23505') break
    }
    if (!inserted) throw lastError ?? NotFound('Insert returned no row')

    const created = inserted as { id: string; ref: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'advisory.create',
      entity_type: 'advisory_request',
      entity_id: created.id,
      metadata: { ref: created.ref, business_unit: input.business_unit },
      supabase,
    })

    revalidate(cacheTags.advisory())
    return ok(inserted, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
